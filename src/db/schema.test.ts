import { eq, sql } from 'drizzle-orm'
import { createTestDb, type TestDb } from '@tests/support/db'
import { makeBook, makeCopy, makeLoan, makeStudent, makeUser } from '@tests/factories'
import * as s from './schema'

// T1.1 (SEB-20): as regras críticas também são garantidas pelo banco, mesmo sem passar pelo código.

let db: TestDb
beforeEach(async () => {
  db = await createTestDb()
})

describe('Modelo de dados', () => {
  it('[US01-CA1] livro exige título, autor, categoria e faixa etária', async () => {
    await expect(
      db.insert(s.books).values({ title: 'X', author: 'Y', category: 'Z' } as typeof s.books.$inferInsert),
    ).rejects.toThrow()
  })

  it('[US01-CA2] código de exemplar não se repete', async () => {
    await makeCopy(db, { code: 'A-001' })

    await expect(makeCopy(db, { code: 'A-001' })).rejects.toThrow()
  })

  it('[US01-CA3] exemplar novo nasce disponível', async () => {
    const copy = await makeCopy(db)

    expect(copy.status).toBe('disponivel')
  })

  it('[US04-CA4] banco recusa segundo empréstimo aberto do mesmo exemplar', async () => {
    const copy = await makeCopy(db)
    await makeLoan(db, { copy })

    await expect(makeLoan(db, { copy })).rejects.toThrow()
  })

  it('[US04-CA4] exemplar devolvido pode ser emprestado de novo', async () => {
    const copy = await makeCopy(db)
    await makeLoan(db, { copy, returnedAt: new Date('2026-03-10T12:00:00Z') })

    await expect(makeLoan(db, { copy })).resolves.toBeDefined()
  })

  it('[US02-CA3] matrícula de aluno é única', async () => {
    await makeStudent(db, { registration: 'M1' })

    await expect(makeStudent(db, { registration: 'M1' })).rejects.toThrow()
  })

  it('[US12-CA2] aluno não entra duas vezes na fila ativa do mesmo título', async () => {
    const book = await makeBook(db)
    const student = await makeStudent(db)
    await db.insert(s.holdQueue).values({ bookId: book.id, studentId: student.id })

    await expect(db.insert(s.holdQueue).values({ bookId: book.id, studentId: student.id })).rejects.toThrow()
  })

  it('[US07-CA1] só um lembrete enviado por empréstimo', async () => {
    const loan = await makeLoan(db)
    const base = { kind: 'lembrete', loanId: loan.id, phone: '+55', body: 'x', status: 'enviado' } as const
    await db.insert(s.notifications).values(base)

    await expect(db.insert(s.notifications).values(base)).rejects.toThrow()
  })

  it('[US07-CA4] lembrete que falhou pode ser tentado de novo', async () => {
    const loan = await makeLoan(db)
    await db
      .insert(s.notifications)
      .values({
        kind: 'lembrete',
        loanId: loan.id,
        phone: '+55',
        body: 'x',
        status: 'falhou',
        error: 'timeout',
      })

    await expect(
      db
        .insert(s.notifications)
        .values({ kind: 'lembrete', loanId: loan.id, phone: '+55', body: 'x', status: 'enviado' }),
    ).resolves.toBeDefined()
  })

  it('reserva de turma exige quantidade positiva', async () => {
    const teacher = await makeUser(db, { role: 'professor' })
    const book = await makeBook(db)

    await expect(
      db.insert(s.classReservations).values({
        teacherId: teacher.id,
        bookId: book.id,
        className: '5A',
        quantity: 0,
        activityDate: '2026-03-20',
      }),
    ).rejects.toThrow()
  })

  it('settings tem uma única linha', async () => {
    await db.insert(s.settings).values({ id: 1 })

    await expect(db.insert(s.settings).values({ id: 2 })).rejects.toThrow()
  })

  it('[US03-CA4] histórico não pode ser alterado nem apagado', async () => {
    const user = await makeUser(db)
    const [entry] = await db
      .insert(s.auditLog)
      .values({ userId: user.id, action: 'teste', entity: 'x' })
      .returning()

    await expect(
      db.update(s.auditLog).set({ action: 'outro' }).where(eq(s.auditLog.id, entry!.id)),
    ).rejects.toMatchObject({ cause: { message: expect.stringMatching(/somente inclusão/) } })
    await expect(db.delete(s.auditLog).where(eq(s.auditLog.id, entry!.id))).rejects.toMatchObject({
      cause: { message: expect.stringMatching(/somente inclusão/) },
    })
  })

  it('cada teste recebe um banco vazio', async () => {
    const { rows } = (await db.execute(sql`select count(*)::int as n from books`)) as unknown as {
      rows: { n: number }[]
    }
    const row = rows[0]

    expect(row!.n).toBe(0)
  })
})
