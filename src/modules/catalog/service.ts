import { and, asc, eq, ilike, inArray, or, sql } from 'drizzle-orm'
import { books, classReservations, copies, holdQueue, loans } from '@/db/schema'
import type { Db } from '@/db/types'
import type { Clock } from '@/lib/clock'
import { BusinessError, NotFoundError } from '@/lib/errors'
import * as audit from '@/modules/audit/service'
import {
  canChangeCopyStatus,
  COPY_STATUS_LABEL,
  isValidCopyCode,
  normalizeCopyCode,
  removalMode,
  validateBook,
  type BookInput,
  type ManualCopyStatus,
} from './rules'

export type Book = typeof books.$inferSelect
export type Copy = typeof copies.$inferSelect

export interface BookSummary extends Book {
  totalCopies: number
  availableCopies: number
}

export interface BookDetails extends Book {
  copies: Copy[]
  /** Já teve algum empréstimo: não pode ser excluído, só inativado (US01-CA4). */
  hasLoanHistory: boolean
}

/** Cadastro de livro (T1.2, US01-CA1). Exemplares são cadastrados em seguida, com `addCopies`. */
export async function createBook(db: Db, clock: Clock, userId: number, input: BookInput): Promise<Book> {
  const result = validateBook(input)
  if (!result.ok) throw new BusinessError(result.reasons.join('; '), 'BOOK_INVALID')
  return db.transaction(async (tx) => {
    const [row] = await tx
      .insert(books)
      .values({ ...result.book, createdAt: clock.now() })
      .returning()
    await audit.append(tx, {
      userId,
      action: 'livro.cadastrar',
      entity: 'book',
      entityId: row!.id,
      payload: { title: row!.title },
    })
    return row!
  })
}

/** Edição de livro (T1.2). As mesmas regras do cadastro valem na edição. */
export async function updateBook(db: Db, userId: number, id: number, input: BookInput): Promise<Book> {
  const result = validateBook(input)
  if (!result.ok) throw new BusinessError(result.reasons.join('; '), 'BOOK_INVALID')
  return db.transaction(async (tx) => {
    const [current] = await tx.select().from(books).where(eq(books.id, id))
    if (!current) throw new NotFoundError('Livro')
    const [row] = await tx.update(books).set(result.book).where(eq(books.id, id)).returning()
    await audit.append(tx, {
      userId,
      action: 'livro.editar',
      entity: 'book',
      entityId: id,
      payload: { antes: pickBook(current), depois: pickBook(row!) },
    })
    return row!
  })
}

function pickBook(b: Book): BookInput {
  return { title: b.title, author: b.author, category: b.category, ageRange: b.ageRange }
}

/**
 * Cadastra exemplares de um livro (T1.3). Cada código é único no acervo (US01-CA2) e todo exemplar novo
 * nasce disponível para empréstimo (US01-CA3). Se algum código for inválido ou repetido, nenhum é gravado.
 */
export async function addCopies(
  db: Db,
  clock: Clock,
  userId: number,
  bookId: number,
  rawCodes: string[],
): Promise<Copy[]> {
  const codes = rawCodes.map(normalizeCopyCode).filter(Boolean)
  if (codes.length === 0)
    throw new BusinessError('Informe o código de pelo menos um exemplar.', 'COPY_NO_CODE')
  const invalid = codes.filter((c) => !isValidCopyCode(c))
  if (invalid.length)
    throw new BusinessError(
      `Código inválido: ${invalid.join(', ')}. Use letras, números, hífen, ponto ou barra (até 30).`,
      'COPY_INVALID_CODE',
    )
  const repeated = [...new Set(codes.filter((c, i) => codes.indexOf(c) !== i))]
  if (repeated.length)
    throw new BusinessError(`Código repetido na lista: ${repeated.join(', ')}.`, 'COPY_DUPLICATE')

  return db.transaction(async (tx) => {
    const [book] = await tx.select().from(books).where(eq(books.id, bookId))
    if (!book) throw new NotFoundError('Livro')
    if (!book.active)
      throw new BusinessError('Livro inativo: reative antes de cadastrar exemplares.', 'BOOK_INACTIVE')
    const taken = await tx
      .select({ code: copies.code })
      .from(copies)
      .where(inArray(sql`upper(${copies.code})`, codes))
    if (taken.length)
      throw new BusinessError(
        `Já existe exemplar com o código ${taken.map((t) => t.code.toUpperCase()).join(', ')}.`,
        'COPY_DUPLICATE',
      )
    const now = clock.now()
    const rows = await tx
      .insert(copies)
      .values(codes.map((code) => ({ bookId, code, status: 'disponivel' as const, createdAt: now })))
      .returning()
    await audit.append(tx, {
      userId,
      action: 'exemplar.cadastrar',
      entity: 'book',
      entityId: bookId,
      payload: { codes },
    })
    return rows
  })
}

/**
 * Altera a situação de um exemplar à mão (T1.3): marcar perdido/danificado ou devolver ao acervo um exemplar
 * encontrado. Exemplar emprestado ou separado para reserva só muda pelo balcão.
 */
export async function setCopyStatus(
  db: Db,
  userId: number,
  copyId: number,
  status: ManualCopyStatus,
): Promise<Copy> {
  return db.transaction(async (tx) => {
    const [copy] = await tx.select().from(copies).where(eq(copies.id, copyId)).for('update')
    if (!copy) throw new NotFoundError('Exemplar')
    if (!canChangeCopyStatus(copy.status))
      throw new BusinessError(
        `Exemplar ${COPY_STATUS_LABEL[copy.status].toLowerCase()}: a situação muda pelo balcão.`,
        'COPY_STATUS_LOCKED',
      )
    const [row] = await tx.update(copies).set({ status }).where(eq(copies.id, copyId)).returning()
    await audit.append(tx, {
      userId,
      action: 'exemplar.situacao',
      entity: 'copy',
      entityId: copyId,
      payload: { code: copy.code, antes: copy.status, depois: status },
    })
    return row!
  })
}

/**
 * Remove um livro do acervo (US01-CA4): se já teve empréstimo, é inativado (o histórico continua);
 * senão é excluído junto com os exemplares. Livro com reserva de turma ou fila ativa também só é inativado.
 */
export async function removeBook(
  db: Db,
  userId: number,
  bookId: number,
): Promise<{ mode: 'excluir' | 'inativar'; title: string }> {
  return db.transaction(async (tx) => {
    const [book] = await tx.select().from(books).where(eq(books.id, bookId)).for('update')
    if (!book) throw new NotFoundError('Livro')
    const hasHistory = await hasLoanHistory(tx, bookId)
    const [reserved] = await tx
      .select({ id: classReservations.id })
      .from(classReservations)
      .where(eq(classReservations.bookId, bookId))
      .limit(1)
    const [held] = await tx
      .select({ id: holdQueue.id })
      .from(holdQueue)
      .where(eq(holdQueue.bookId, bookId))
      .limit(1)
    const mode = removalMode(hasHistory || Boolean(reserved) || Boolean(held))
    if (mode === 'inativar') {
      await tx.update(books).set({ active: false }).where(eq(books.id, bookId))
    } else {
      await tx.delete(copies).where(eq(copies.bookId, bookId))
      await tx.delete(books).where(eq(books.id, bookId))
    }
    await audit.append(tx, {
      userId,
      action: mode === 'inativar' ? 'livro.inativar' : 'livro.excluir',
      entity: 'book',
      entityId: bookId,
      payload: { title: book.title },
    })
    return { mode, title: book.title }
  })
}

/** Devolve ao acervo um livro inativado. */
export async function reactivateBook(db: Db, userId: number, bookId: number): Promise<Book> {
  return db.transaction(async (tx) => {
    const [row] = await tx.update(books).set({ active: true }).where(eq(books.id, bookId)).returning()
    if (!row) throw new NotFoundError('Livro')
    await audit.append(tx, {
      userId,
      action: 'livro.reativar',
      entity: 'book',
      entityId: bookId,
      payload: { title: row.title },
    })
    return row
  })
}

async function hasLoanHistory(db: Db, bookId: number): Promise<boolean> {
  const [row] = await db
    .select({ id: loans.id })
    .from(loans)
    .innerJoin(copies, eq(copies.id, loans.copyId))
    .where(eq(copies.bookId, bookId))
    .limit(1)
  return Boolean(row)
}

export async function getBookDetails(db: Db, id: number): Promise<BookDetails | undefined> {
  const [book] = await db.select().from(books).where(eq(books.id, id))
  if (!book) return undefined
  const list = await db.select().from(copies).where(eq(copies.bookId, id)).orderBy(asc(copies.code))
  return { ...book, copies: list, hasLoanHistory: await hasLoanHistory(db, id) }
}

/** Lista do acervo com total de exemplares e quantos estão disponíveis. Busca por título, autor ou categoria. */
export async function searchBooks(
  db: Db,
  term = '',
  opts: { includeInactive?: boolean; limit?: number } = {},
): Promise<BookSummary[]> {
  const q = term.trim()
  const conditions = []
  if (q)
    conditions.push(
      or(ilike(books.title, `%${q}%`), ilike(books.author, `%${q}%`), ilike(books.category, `%${q}%`)),
    )
  if (!opts.includeInactive) conditions.push(eq(books.active, true))
  return db
    .select({
      id: books.id,
      title: books.title,
      author: books.author,
      category: books.category,
      ageRange: books.ageRange,
      active: books.active,
      createdAt: books.createdAt,
      totalCopies: sql<number>`count(${copies.id})::int`,
      availableCopies: sql<number>`(count(${copies.id}) filter (where ${copies.status} = 'disponivel'))::int`,
    })
    .from(books)
    .leftJoin(copies, eq(copies.bookId, books.id))
    .where(conditions.length ? and(...conditions) : undefined)
    .groupBy(books.id)
    .orderBy(asc(books.title))
    .limit(opts.limit ?? 100)
}
