import { and, asc, eq, ilike, isNull, or, sql } from 'drizzle-orm'
import { books, copies, loans, students } from '@/db/schema'
import type { Db } from '@/db/types'
import { toSchoolDate, type Clock, type IsoDate } from '@/lib/clock'
import { BusinessError, NotFoundError } from '@/lib/errors'
import * as audit from '@/modules/audit/service'
import { getSettings } from '@/lib/settings'
import {
  canBorrow,
  copyStatusAfterReturn,
  copyUnavailableReason,
  daysLate,
  dueDate as computeDueDate,
  isLate,
  type BorrowCheck,
  type CopyStatus,
  type ReturnCondition,
} from './rules'

export interface OpenLoanDetails {
  loanId: number
  copyId: number
  copyCode: string
  bookTitle: string
  studentId: number
  studentName: string
  className: string
  dueDate: IsoDate
  loanedAt: Date
  /** Dias de atraso em relação a hoje (0 = no prazo). */
  daysLate: number
}

function normalizeCode(code: string) {
  return code.trim().toUpperCase()
}

/**
 * Empréstimo aberto do exemplar, com aluno e título, para conferência antes de confirmar (US05-CA2).
 * Código não encontrado ou exemplar sem empréstimo aberto viram erro com mensagem para o balcão.
 */
export async function findOpenLoanByCopyCode(db: Db, clock: Clock, code: string): Promise<OpenLoanDetails> {
  const normalized = normalizeCode(code)
  if (!normalized) throw new BusinessError('Informe o código do exemplar.', 'RETURN_NO_COPY')
  const [copy] = await db
    .select({ id: copies.id, status: copies.status })
    .from(copies)
    .where(sql`upper(${copies.code}) = ${normalized}`)
  if (!copy) throw new NotFoundError('Exemplar')
  const [row] = await db
    .select({
      loanId: loans.id,
      copyId: copies.id,
      copyCode: copies.code,
      bookTitle: books.title,
      studentId: students.id,
      studentName: students.name,
      className: students.className,
      dueDate: loans.dueDate,
      loanedAt: loans.loanedAt,
    })
    .from(loans)
    .innerJoin(copies, eq(copies.id, loans.copyId))
    .innerJoin(books, eq(books.id, copies.bookId))
    .innerJoin(students, eq(students.id, loans.studentId))
    .where(and(eq(loans.copyId, copy.id), isNull(loans.returnedAt)))
  if (!row) throw new BusinessError('Este exemplar não está emprestado.', 'RETURN_NOT_LOANED')
  return { ...row, daysLate: daysLate(row.dueDate, clock.today()) }
}

export interface ReturnResult {
  loanId: number
  copyCode: string
  bookTitle: string
  studentName: string
  returnedLate: boolean
  daysLate: number
  condition: ReturnCondition
}

/**
 * Registra a devolução (US05): dá baixa no empréstimo, marca atraso (CA3), registra perdido/danificado (CA4),
 * atualiza a situação do exemplar e grava no histórico quem fez (US03-CA3). Tudo na mesma transação.
 *
 * Integração pendente: quando o título tiver fila de reserva (US12, SEB-17), o exemplar devolvido em bom
 * estado deve ficar "separado" e o primeiro da fila ser avisado. Esse passo entra aqui na US12.
 */
export async function registerReturn(
  db: Db,
  clock: Clock,
  userId: number,
  input: { loanId: number; condition: ReturnCondition },
): Promise<ReturnResult> {
  return db.transaction(async (tx) => {
    const [loan] = await tx
      .select({
        id: loans.id,
        copyId: loans.copyId,
        dueDate: loans.dueDate,
        returnedAt: loans.returnedAt,
        copyCode: copies.code,
        bookTitle: books.title,
        studentName: students.name,
      })
      .from(loans)
      .innerJoin(copies, eq(copies.id, loans.copyId))
      .innerJoin(books, eq(books.id, copies.bookId))
      .innerJoin(students, eq(students.id, loans.studentId))
      .where(eq(loans.id, input.loanId))
      .for('update', { of: loans })
    if (!loan) throw new NotFoundError('Empréstimo')
    if (loan.returnedAt) throw new BusinessError('Este empréstimo já foi devolvido.', 'RETURN_ALREADY_DONE')

    const now = clock.now()
    const returnDate = toSchoolDate(now)
    const late = isLate(loan.dueDate, returnDate)
    await tx
      .update(loans)
      .set({ returnedAt: now, returnedBy: userId, returnCondition: input.condition, returnedLate: late })
      .where(eq(loans.id, loan.id))
    await tx
      .update(copies)
      .set({ status: copyStatusAfterReturn(input.condition) })
      .where(eq(copies.id, loan.copyId))
    const result: ReturnResult = {
      loanId: loan.id,
      copyCode: loan.copyCode,
      bookTitle: loan.bookTitle,
      studentName: loan.studentName,
      returnedLate: late,
      daysLate: daysLate(loan.dueDate, returnDate),
      condition: input.condition,
    }
    await audit.append(tx, {
      userId,
      action: 'emprestimo.devolver',
      entity: 'loan',
      entityId: loan.id,
      payload: { copyCode: loan.copyCode, condition: input.condition, late, daysLate: result.daysLate },
    })
    return result
  })
}

// ---------------------------------------------------------------------------------------------------------
// US04 Registrar empréstimo
// ---------------------------------------------------------------------------------------------------------

export interface Borrower {
  id: number
  registration: string
  name: string
  className: string
  status: 'ativo' | 'transferido'
  activeLoans: number
  overdueLoans: number
}

export interface LoanableCopy {
  id: number
  code: string
  status: CopyStatus
  bookId: number
  bookTitle: string
  author: string
  /** Motivo de não poder emprestar (null = disponível). */
  unavailable: string | null
}

/** Empréstimos abertos e atrasados por aluno, como subconsultas (usadas na busca e no registro). */
function loanCounts(today: string) {
  // Colunas escritas com a tabela, porque dentro da subconsulta "id" seria ambíguo entre loans e students.
  return {
    activeLoans: sql<number>`(select count(*)::int from loans l where l.student_id = "students"."id" and l.returned_at is null)`,
    overdueLoans: sql<number>`(select count(*)::int from loans l where l.student_id = "students"."id" and l.returned_at is null and l.due_date < ${today})`,
  }
}

/** T4.1: busca rápida do aluno no balcão, por nome ou matrícula, já com a situação de empréstimos. */
export async function searchBorrowers(db: Db, clock: Clock, term: string, limit = 8): Promise<Borrower[]> {
  const q = term.trim()
  if (!q) return []
  return db
    .select({
      id: students.id,
      registration: students.registration,
      name: students.name,
      className: students.className,
      status: students.status,
      ...loanCounts(clock.today()),
    })
    .from(students)
    .where(or(ilike(students.name, `%${q}%`), ilike(students.registration, `${q}%`)))
    .orderBy(asc(students.name))
    .limit(limit)
}

/**
 * T4.1: busca rápida do exemplar, pelo código (leitor de código de barras) ou pelo título. Código exato vem
 * primeiro. Só livros ativos.
 */
export async function searchLoanableCopies(db: Db, term: string, limit = 8): Promise<LoanableCopy[]> {
  const q = term.trim()
  if (!q) return []
  const code = q.replace(/\s+/g, '').toUpperCase()
  const rows = await db
    .select({
      id: copies.id,
      code: copies.code,
      status: copies.status,
      bookId: books.id,
      bookTitle: books.title,
      author: books.author,
    })
    .from(copies)
    .innerJoin(books, eq(books.id, copies.bookId))
    .where(
      and(
        eq(books.active, true),
        or(sql`upper(${copies.code}) like ${code + '%'}`, ilike(books.title, `%${q}%`)),
      ),
    )
    .orderBy(
      sql`(upper(${copies.code}) = ${code}) desc`,
      sql`(${copies.status} = 'disponivel') desc`,
      asc(books.title),
      asc(copies.code),
    )
    .limit(limit)
  return rows.map((r) => ({ ...r, unavailable: copyUnavailableReason(r.status) }))
}

export interface LoanPreview {
  student: Borrower
  copy: LoanableCopy
  dueDate: IsoDate
  check: BorrowCheck
  /** Livros que o aluno já está levando, para a bibliotecária conferir os atrasos. */
  openLoans: OpenLoanOfStudent[]
}

/** Situação para conferir antes de confirmar: prazo calculado (US04-CA2) e avisos/bloqueios (US04-CA3). */
export async function previewLoan(
  db: Db,
  clock: Clock,
  input: { studentId?: number | null; copyId?: number | null },
): Promise<LoanPreview> {
  if (!input.studentId) throw new BusinessError('Identifique o aluno.', 'LOAN_NO_STUDENT')
  if (!input.copyId) throw new BusinessError('Identifique o exemplar.', 'LOAN_NO_COPY')
  const today = clock.today()
  const [student] = await db
    .select({
      id: students.id,
      registration: students.registration,
      name: students.name,
      className: students.className,
      status: students.status,
      ...loanCounts(today),
    })
    .from(students)
    .where(eq(students.id, input.studentId))
  if (!student) throw new NotFoundError('Aluno')
  const [copy] = await db
    .select({
      id: copies.id,
      code: copies.code,
      status: copies.status,
      bookId: books.id,
      bookTitle: books.title,
      author: books.author,
      bookActive: books.active,
    })
    .from(copies)
    .innerJoin(books, eq(books.id, copies.bookId))
    .where(eq(copies.id, input.copyId))
  if (!copy) throw new NotFoundError('Exemplar')
  const settings = await getSettings(db)
  const check = canBorrow({ ...student, studentStatus: student.status }, settings)
  const unavailable = copy.bookActive
    ? copyUnavailableReason(copy.status)
    : 'Este livro está inativo no acervo.'
  if (unavailable) check.blocks.unshift(unavailable)
  check.allowed = check.blocks.length === 0
  const { bookActive: _active, ...copyData } = copy
  return {
    student,
    copy: { ...copyData, unavailable },
    dueDate: computeDueDate(today, settings.loanDays),
    check,
    openLoans: await openLoansOf(db, clock, student.id),
  }
}

export interface LoanResult {
  loanId: number
  dueDate: IsoDate
  studentName: string
  className: string
  copyCode: string
  bookTitle: string
  warnings: string[]
}

/**
 * Registra o empréstimo (US04). Exige aluno e exemplar (CA1), calcula a devolução pelo prazo da escola (CA2),
 * aplica limite, atraso e transferência (CA3, US06-CA2) e impede emprestar exemplar já emprestado (CA4) —
 * também pelo índice único do banco, para o caso de dois balcões ao mesmo tempo. Tudo numa transação, com
 * histórico de quem registrou (US03-CA3).
 */
export async function registerLoan(
  db: Db,
  clock: Clock,
  userId: number,
  input: { studentId?: number | null; copyId?: number | null },
): Promise<LoanResult> {
  try {
    return await db.transaction(async (tx) => {
      if (input.copyId)
        await tx.select({ id: copies.id }).from(copies).where(eq(copies.id, input.copyId)).for('update')
      if (input.studentId)
        await tx
          .select({ id: students.id })
          .from(students)
          .where(eq(students.id, input.studentId))
          .for('update')
      const preview = await previewLoan(tx, clock, input)
      if (!preview.check.allowed) throw new BusinessError(preview.check.blocks.join(' '), 'LOAN_BLOCKED')
      const [loan] = await tx
        .insert(loans)
        .values({
          copyId: preview.copy.id,
          studentId: preview.student.id,
          loanedAt: clock.now(),
          dueDate: preview.dueDate,
          createdBy: userId,
        })
        .returning({ id: loans.id })
      await tx.update(copies).set({ status: 'emprestado' }).where(eq(copies.id, preview.copy.id))
      await audit.append(tx, {
        userId,
        action: 'emprestimo.registrar',
        entity: 'loan',
        entityId: loan!.id,
        payload: {
          copyCode: preview.copy.code,
          studentId: preview.student.id,
          dueDate: preview.dueDate,
          warnings: preview.check.warnings,
        },
      })
      return {
        loanId: loan!.id,
        dueDate: preview.dueDate,
        studentName: preview.student.name,
        className: preview.student.className,
        copyCode: preview.copy.code,
        bookTitle: preview.copy.bookTitle,
        warnings: preview.check.warnings,
      }
    })
  } catch (err) {
    if (isUniqueViolation(err, 'loans_one_open_per_copy'))
      throw new BusinessError(
        'Este exemplar já está emprestado. Registre a devolução antes.',
        'LOAN_COPY_TAKEN',
      )
    throw err
  }
}

function isUniqueViolation(err: unknown, constraint: string): boolean {
  const e = err as { code?: string; constraint?: string; cause?: { code?: string; constraint?: string } }
  const target = e?.cause ?? e
  return target?.code === '23505' && (!target.constraint || target.constraint === constraint)
}

export interface OpenLoanOfStudent {
  loanId: number
  copyCode: string
  bookTitle: string
  dueDate: IsoDate
  daysLate: number
}

/** Empréstimos abertos do aluno, para conferência no balcão. */
export async function openLoansOf(db: Db, clock: Clock, studentId: number): Promise<OpenLoanOfStudent[]> {
  const today = clock.today()
  const rows = await db
    .select({ loanId: loans.id, copyCode: copies.code, bookTitle: books.title, dueDate: loans.dueDate })
    .from(loans)
    .innerJoin(copies, eq(copies.id, loans.copyId))
    .innerJoin(books, eq(books.id, copies.bookId))
    .where(and(eq(loans.studentId, studentId), isNull(loans.returnedAt)))
    .orderBy(asc(loans.dueDate))
  return rows.map((r) => ({ ...r, daysLate: daysLate(r.dueDate, today) }))
}
