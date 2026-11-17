import { eq } from 'drizzle-orm'
import { createTestDb, type TestDb } from '@tests/support/db'
import { makeBook, makeCopy, makeLoan, makeSettings, makeStudent, makeUser } from '@tests/factories'
import { auditLog, copies, loans } from '@/db/schema'
import { fixedClock } from '@/lib/clock'
import * as service from './service'

// Terça-feira, 10/03/2026. Prazo padrão de 14 dias → 24/03 (terça).
const clock = fixedClock('2026-03-10')

let db: TestDb
let userId: number
beforeEach(async () => {
  db = await createTestDb()
  userId = (await makeUser(db)).id
})

async function scenario() {
  const book = await makeBook(db, { title: 'O Pequeno Príncipe' })
  const copy = await makeCopy(db, { book, code: 'PP-001' })
  const student = await makeStudent(db, { name: 'Raissa', registration: '2026001', className: '5A' })
  return { book, copy, student }
}

describe('US04 Registrar empréstimo — busca rápida (T4.1)', () => {
  it('encontra aluno por nome ou matrícula, com livros abertos e atrasados', async () => {
    const { student } = await scenario()
    await makeLoan(db, { student, dueDate: '2026-03-05' })
    await makeLoan(db, { student, dueDate: '2026-03-20' })
    await makeStudent(db, { name: 'Bruno' })

    const byName = await service.searchBorrowers(db, clock, 'rai')
    const byRegistration = await service.searchBorrowers(db, clock, '2026')

    expect(byName).toEqual([
      expect.objectContaining({ id: student.id, name: 'Raissa', activeLoans: 2, overdueLoans: 1 }),
    ])
    expect(byRegistration.map((s) => s.id)).toEqual([student.id])
    expect(await service.searchBorrowers(db, clock, '  ')).toEqual([])
  })

  it('encontra exemplar pelo código (exato primeiro) ou pelo título, indicando se pode emprestar', async () => {
    const { book, copy } = await scenario()
    const lent = await makeCopy(db, { book, code: 'PP-0010' })
    await makeLoan(db, { copy: lent })
    await makeCopy(db, { book: await makeBook(db, { title: 'Inativo', active: false }), code: 'PP-0011' })

    const byCode = await service.searchLoanableCopies(db, ' pp-001')
    const byTitle = await service.searchLoanableCopies(db, 'príncipe')

    expect(byCode.map((c) => [c.code, c.unavailable])).toEqual([
      ['PP-001', null],
      ['PP-0010', 'Este exemplar já está emprestado. Registre a devolução antes.'],
    ])
    expect(byTitle.map((c) => c.id)).toEqual([copy.id, lent.id])
    expect(await service.searchLoanableCopies(db, '')).toEqual([])
  })
})

describe('US04 Registrar empréstimo', () => {
  it('[US04-CA2] registra com a data de devolução pelo prazo da escola e marca o exemplar', async () => {
    const { copy, student } = await scenario()

    const result = await service.registerLoan(db, clock, userId, { studentId: student.id, copyId: copy.id })

    expect(result).toMatchObject({
      dueDate: '2026-03-24',
      studentName: 'Raissa',
      copyCode: 'PP-001',
      bookTitle: 'O Pequeno Príncipe',
      warnings: [],
    })
    const [loan] = await db.select().from(loans)
    expect(loan).toMatchObject({
      studentId: student.id,
      copyId: copy.id,
      dueDate: '2026-03-24',
      createdBy: userId,
    })
    const [updated] = await db.select().from(copies).where(eq(copies.id, copy.id))
    expect(updated?.status).toBe('emprestado')
  })

  it('[US04-CA2] usa o prazo configurado e pula o fim de semana', async () => {
    const { copy, student } = await scenario()
    await makeSettings(db, { loanDays: 4 }) // 10/03 + 4 = sábado 14/03 → segunda 16/03

    const result = await service.registerLoan(db, clock, userId, { studentId: student.id, copyId: copy.id })

    expect(result.dueDate).toBe('2026-03-16')
  })

  it('[US03-CA3] grava no histórico quem registrou o empréstimo', async () => {
    const { copy, student } = await scenario()

    const result = await service.registerLoan(db, clock, userId, { studentId: student.id, copyId: copy.id })

    const [log] = await db.select().from(auditLog)
    expect(log).toMatchObject({
      userId,
      action: 'emprestimo.registrar',
      entity: 'loan',
      entityId: result.loanId,
      payload: { copyCode: 'PP-001', studentId: student.id, dueDate: '2026-03-24' },
    })
  })

  it('[US04-CA1] não registra sem aluno', async () => {
    const { copy } = await scenario()

    await expect(service.registerLoan(db, clock, userId, { copyId: copy.id })).rejects.toMatchObject({
      code: 'LOAN_NO_STUDENT',
    })
    expect(await db.select().from(loans)).toHaveLength(0)
    expect(await db.select().from(auditLog)).toHaveLength(0)
  })

  it('[US04-CA1] não registra sem exemplar', async () => {
    const { student } = await scenario()

    await expect(service.registerLoan(db, clock, userId, { studentId: student.id })).rejects.toMatchObject({
      code: 'LOAN_NO_COPY',
    })
  })

  it('[US04-CA1] aluno ou exemplar inexistente', async () => {
    const { copy, student } = await scenario()

    await expect(
      service.registerLoan(db, clock, userId, { studentId: 999, copyId: copy.id }),
    ).rejects.toThrow('Aluno não encontrado')
    await expect(
      service.registerLoan(db, clock, userId, { studentId: student.id, copyId: 999 }),
    ).rejects.toThrow('Exemplar não encontrado')
  })

  it('[US04-CA4] exemplar emprestado não é emprestado de novo', async () => {
    const { copy, student } = await scenario()
    await service.registerLoan(db, clock, userId, { studentId: student.id, copyId: copy.id })
    const other = await makeStudent(db)

    await expect(
      service.registerLoan(db, clock, userId, { studentId: other.id, copyId: copy.id }),
    ).rejects.toMatchObject({ code: 'LOAN_BLOCKED', message: expect.stringContaining('já está emprestado') })
    expect(await db.select().from(loans)).toHaveLength(1)
  })

  it('[US04-CA4] mesmo com a situação desatualizada, o banco barra o segundo empréstimo aberto', async () => {
    const { copy, student } = await scenario()
    await makeLoan(db, { copy })
    await db.update(copies).set({ status: 'disponivel' }).where(eq(copies.id, copy.id))

    await expect(
      service.registerLoan(db, clock, userId, { studentId: student.id, copyId: copy.id }),
    ).rejects.toMatchObject({ code: 'LOAN_COPY_TAKEN' })
    expect(await db.select().from(auditLog)).toHaveLength(0)
  })

  it('[US04-CA4] exemplar devolvido pode ser emprestado de novo', async () => {
    const { copy, student } = await scenario()
    await makeLoan(db, { copy, returnedAt: new Date('2026-03-05T13:00:00Z') })
    await db.update(copies).set({ status: 'disponivel' }).where(eq(copies.id, copy.id))

    await expect(
      service.registerLoan(db, clock, userId, { studentId: student.id, copyId: copy.id }),
    ).resolves.toMatchObject({ dueDate: '2026-03-24' })
  })

  it.each(['perdido', 'danificado'] as const)('[US04-CA4] exemplar %s não é emprestado', async (status) => {
    const { copy, student } = await scenario()
    await db.update(copies).set({ status }).where(eq(copies.id, copy.id))

    await expect(
      service.registerLoan(db, clock, userId, { studentId: student.id, copyId: copy.id }),
    ).rejects.toMatchObject({ code: 'LOAN_BLOCKED', message: expect.stringContaining(status) })
  })

  it('exemplar de livro inativo não é emprestado', async () => {
    const book = await makeBook(db, { active: false })
    const copy = await makeCopy(db, { book })
    const student = await makeStudent(db)

    await expect(
      service.registerLoan(db, clock, userId, { studentId: student.id, copyId: copy.id }),
    ).rejects.toMatchObject({ message: 'Este livro está inativo no acervo.' })
  })
})

describe('US04 Limite e atraso (T4.3)', () => {
  it('[US04-CA3] aluno no limite de livros é bloqueado', async () => {
    const { copy, student } = await scenario()
    await makeLoan(db, { student, dueDate: '2026-03-20' })
    await makeLoan(db, { student, dueDate: '2026-03-20' })

    await expect(
      service.registerLoan(db, clock, userId, { studentId: student.id, copyId: copy.id }),
    ).rejects.toMatchObject({
      code: 'LOAN_BLOCKED',
      message: expect.stringContaining('limite da escola: 2 livros'),
    })
    const [unchanged] = await db.select().from(copies).where(eq(copies.id, copy.id))
    expect(unchanged?.status).toBe('disponivel')
  })

  it('[US04-CA3] livros já devolvidos não contam para o limite', async () => {
    const { copy, student } = await scenario()
    await makeLoan(db, { student, returnedAt: new Date('2026-03-01T13:00:00Z') })
    await makeLoan(db, { student, returnedAt: new Date('2026-03-01T13:00:00Z') })

    await expect(
      service.registerLoan(db, clock, userId, { studentId: student.id, copyId: copy.id }),
    ).resolves.toBeDefined()
  })

  it('[US04-CA3] aluno em atraso é bloqueado (padrão da escola)', async () => {
    const { copy, student } = await scenario()
    await makeLoan(db, { student, dueDate: '2026-03-09' })

    await expect(
      service.registerLoan(db, clock, userId, { studentId: student.id, copyId: copy.id }),
    ).rejects.toMatchObject({ message: expect.stringContaining('1 livro em atraso') })
  })

  it('[US04-CA3] devolução prevista para hoje ainda não é atraso', async () => {
    const { copy, student } = await scenario()
    await makeLoan(db, { student, dueDate: '2026-03-10' })

    await expect(
      service.registerLoan(db, clock, userId, { studentId: student.id, copyId: copy.id }),
    ).resolves.toMatchObject({ warnings: [] })
  })

  it('[US04-CA3] se a escola não bloqueia por atraso, registra com aviso', async () => {
    const { copy, student } = await scenario()
    await makeSettings(db, { blockWhenOverdue: false })
    await makeLoan(db, { student, dueDate: '2026-03-09' })

    const result = await service.registerLoan(db, clock, userId, { studentId: student.id, copyId: copy.id })

    expect(result.warnings).toEqual(['Aluno com 1 livro em atraso.'])
    const [log] = await db.select().from(auditLog)
    expect(log?.payload).toMatchObject({ warnings: ['Aluno com 1 livro em atraso.'] })
  })

  it('[US06-CA2] aluno transferido não pega empréstimo', async () => {
    const { copy } = await scenario()
    const transferred = await makeStudent(db, { status: 'transferido' })

    await expect(
      service.registerLoan(db, clock, userId, { studentId: transferred.id, copyId: copy.id }),
    ).rejects.toMatchObject({ message: 'Aluno transferido não pode pegar livros.' })
  })

  it('[US04-CA3] conferência mostra prazo, avisos e os livros que o aluno já tem', async () => {
    const { copy, student } = await scenario()
    await makeLoan(db, { student, dueDate: '2026-03-07', copy: await makeCopy(db, { code: 'ATR-1' }) })

    const preview = await service.previewLoan(db, clock, { studentId: student.id, copyId: copy.id })

    expect(preview).toMatchObject({
      dueDate: '2026-03-24',
      student: { name: 'Raissa', activeLoans: 1, overdueLoans: 1 },
      copy: { code: 'PP-001', unavailable: null },
      check: { allowed: false },
      openLoans: [{ copyCode: 'ATR-1', dueDate: '2026-03-07', daysLate: 3 }],
    })
  })
})
