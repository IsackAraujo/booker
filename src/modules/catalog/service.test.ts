import { eq } from 'drizzle-orm'
import { createTestDb, type TestDb } from '@tests/support/db'
import { makeBook, makeClassReservation, makeCopy, makeLoan, makeUser } from '@tests/factories'
import { auditLog, books, copies } from '@/db/schema'
import { fixedClock } from '@/lib/clock'
import * as service from './service'

const clock = fixedClock('2026-03-10')
const input = {
  title: 'O Pequeno Príncipe',
  author: 'Saint-Exupéry',
  category: 'Literatura',
  ageRange: '8-10',
}

let db: TestDb
let userId: number
beforeEach(async () => {
  db = await createTestDb()
  userId = (await makeUser(db)).id
})

async function auditActions() {
  return (await db.select().from(auditLog)).map((a) => a.action)
}

describe('US01 Cadastrar livros (T1.2)', () => {
  it('[US01-CA1] cadastra livro com os campos obrigatórios e grava no histórico', async () => {
    const book = await service.createBook(db, clock, userId, input)

    expect(book).toMatchObject({ ...input, active: true })
    const [log] = await db.select().from(auditLog)
    expect(log).toMatchObject({ userId, action: 'livro.cadastrar', entity: 'book', entityId: book.id })
  })

  it('[US01-CA1] não cadastra sem autor e não grava histórico', async () => {
    await expect(service.createBook(db, clock, userId, { ...input, author: ' ' })).rejects.toMatchObject({
      code: 'BOOK_INVALID',
      message: 'Sem autor',
    })

    expect(await db.select().from(books)).toHaveLength(0)
    expect(await db.select().from(auditLog)).toHaveLength(0)
  })

  it('[US01-CA1] edição também exige os campos obrigatórios', async () => {
    const book = await makeBook(db)

    await expect(service.updateBook(db, userId, book.id, { ...input, category: '' })).rejects.toMatchObject({
      code: 'BOOK_INVALID',
    })
  })

  it('edita o livro e guarda antes e depois no histórico', async () => {
    const book = await makeBook(db, { title: 'Titulo errado' })

    const saved = await service.updateBook(db, userId, book.id, input)

    expect(saved.title).toBe('O Pequeno Príncipe')
    const [log] = await db.select().from(auditLog)
    expect(log).toMatchObject({
      action: 'livro.editar',
      payload: { antes: { title: 'Titulo errado' }, depois: { title: 'O Pequeno Príncipe' } },
    })
  })

  it('editar livro inexistente', async () => {
    await expect(service.updateBook(db, userId, 999, input)).rejects.toThrow('Livro não encontrado')
  })
})

describe('US01 Cadastrar exemplares (T1.3)', () => {
  it('[US01-CA3] exemplares novos ficam disponíveis para empréstimo', async () => {
    const book = await makeBook(db)

    const created = await service.addCopies(db, clock, userId, book.id, ['pp-001', ' PP-002 '])

    expect(created.map((c) => [c.code, c.status])).toEqual([
      ['PP-001', 'disponivel'],
      ['PP-002', 'disponivel'],
    ])
    expect(await auditActions()).toEqual(['exemplar.cadastrar'])
  })

  it('[US01-CA2] recusa código que já existe no acervo, mesmo em outro livro e com outra caixa', async () => {
    await makeCopy(db, { code: 'PP-001' })
    const other = await makeBook(db)

    await expect(service.addCopies(db, clock, userId, other.id, ['pp-001'])).rejects.toMatchObject({
      code: 'COPY_DUPLICATE',
      message: 'Já existe exemplar com o código PP-001.',
    })
  })

  it('[US01-CA2] recusa código repetido na mesma lista e não grava nenhum', async () => {
    const book = await makeBook(db)

    await expect(service.addCopies(db, clock, userId, book.id, ['A-1', 'A-2', 'a-1'])).rejects.toMatchObject({
      code: 'COPY_DUPLICATE',
    })
    expect(await db.select().from(copies)).toHaveLength(0)
    expect(await db.select().from(auditLog)).toHaveLength(0)
  })

  it('[US01-CA2] o banco também impede código duplicado', async () => {
    const book = await makeBook(db)
    await db.insert(copies).values({ bookId: book.id, code: 'X-1' })

    await expect(db.insert(copies).values({ bookId: book.id, code: 'X-1' })).rejects.toThrow()
  })

  it('recusa código inválido', async () => {
    const book = await makeBook(db)

    await expect(service.addCopies(db, clock, userId, book.id, ['EX_1'])).rejects.toMatchObject({
      code: 'COPY_INVALID_CODE',
    })
  })

  it('exige pelo menos um código', async () => {
    const book = await makeBook(db)

    await expect(service.addCopies(db, clock, userId, book.id, ['', '  '])).rejects.toMatchObject({
      code: 'COPY_NO_CODE',
    })
  })

  it('não cadastra exemplar em livro inexistente ou inativo', async () => {
    const inactive = await makeBook(db, { active: false })

    await expect(service.addCopies(db, clock, userId, 999, ['A-1'])).rejects.toThrow('Livro não encontrado')
    await expect(service.addCopies(db, clock, userId, inactive.id, ['A-1'])).rejects.toMatchObject({
      code: 'BOOK_INACTIVE',
    })
  })

  it('[T1.3] marca exemplar como perdido e devolve ao acervo quando encontrado', async () => {
    const copy = await makeCopy(db)

    await service.setCopyStatus(db, userId, copy.id, 'perdido')
    const back = await service.setCopyStatus(db, userId, copy.id, 'disponivel')

    expect(back.status).toBe('disponivel')
    const logs = await db.select().from(auditLog)
    expect(logs.map((l) => l.payload)).toEqual([
      { code: copy.code, antes: 'disponivel', depois: 'perdido' },
      { code: copy.code, antes: 'perdido', depois: 'disponivel' },
    ])
  })

  it('[T1.3] exemplar emprestado só muda de situação pelo balcão', async () => {
    const copy = await makeCopy(db)
    await makeLoan(db, { copy })

    await expect(service.setCopyStatus(db, userId, copy.id, 'disponivel')).rejects.toMatchObject({
      code: 'COPY_STATUS_LOCKED',
    })
  })

  it('situação de exemplar inexistente', async () => {
    await expect(service.setCopyStatus(db, userId, 999, 'perdido')).rejects.toThrow('Exemplar não encontrado')
  })
})

describe('US01 Excluir ou inativar livro', () => {
  it('[US01-CA4] livro que já teve empréstimo é inativado, não excluído', async () => {
    const copy = await makeCopy(db)
    await makeLoan(db, { copy, returnedAt: new Date('2026-03-05T13:00:00Z') })

    const result = await service.removeBook(db, userId, copy.bookId)

    expect(result.mode).toBe('inativar')
    const [book] = await db.select().from(books).where(eq(books.id, copy.bookId))
    expect(book?.active).toBe(false)
    expect(await db.select().from(copies)).toHaveLength(1)
    expect(await auditActions()).toEqual(['livro.inativar'])
  })

  it('[US01-CA4] livro sem empréstimos é excluído com os exemplares', async () => {
    const copy = await makeCopy(db)

    const result = await service.removeBook(db, userId, copy.bookId)

    expect(result.mode).toBe('excluir')
    expect(await db.select().from(books)).toHaveLength(0)
    expect(await db.select().from(copies)).toHaveLength(0)
    expect(await auditActions()).toEqual(['livro.excluir'])
  })

  it('livro com reserva de turma é inativado para não perder a reserva', async () => {
    const book = await makeBook(db)
    await makeClassReservation(db, { book })

    expect((await service.removeBook(db, userId, book.id)).mode).toBe('inativar')
  })

  it('reativa livro inativado', async () => {
    const book = await makeBook(db, { active: false })

    const row = await service.reactivateBook(db, userId, book.id)

    expect(row.active).toBe(true)
    expect(await auditActions()).toEqual(['livro.reativar'])
  })

  it('remover ou reativar livro inexistente', async () => {
    await expect(service.removeBook(db, userId, 999)).rejects.toThrow('Livro não encontrado')
    await expect(service.reactivateBook(db, userId, 999)).rejects.toThrow('Livro não encontrado')
  })
})

describe('Consulta do acervo', () => {
  it('lista livros ativos com total e disponíveis, buscando por título, autor ou categoria', async () => {
    const book = await makeBook(db, { title: 'Dom Casmurro', author: 'Machado de Assis' })
    const copy = await makeCopy(db, { book })
    await makeCopy(db, { book })
    await makeLoan(db, { copy })
    await makeBook(db, { title: 'Outro', author: 'Fulano' })
    await makeBook(db, { title: 'Dom Quixote', author: 'Cervantes', active: false })

    const found = await service.searchBooks(db, 'dom')

    expect(found).toEqual([
      expect.objectContaining({ title: 'Dom Casmurro', totalCopies: 2, availableCopies: 1 }),
    ])
    expect(await service.searchBooks(db, 'machado')).toHaveLength(1)
    expect(await service.searchBooks(db, 'dom', { includeInactive: true })).toHaveLength(2)
  })

  it('detalhes do livro trazem exemplares e se já teve empréstimo', async () => {
    const copy = await makeCopy(db, { code: 'B-2' })
    await makeCopy(db, { book: copy.book, code: 'B-1' })

    const before = await service.getBookDetails(db, copy.bookId)
    await makeLoan(db, { copy })
    const after = await service.getBookDetails(db, copy.bookId)

    expect(before?.copies.map((c) => c.code)).toEqual(['B-1', 'B-2'])
    expect(before?.hasLoanHistory).toBe(false)
    expect(after?.hasLoanHistory).toBe(true)
    expect(await service.getBookDetails(db, 999)).toBeUndefined()
  })
})
