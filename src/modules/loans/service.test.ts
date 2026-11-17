import { eq } from 'drizzle-orm'
import { createTestDb, type TestDb } from '@tests/support/db'
import { makeBook, makeCopy, makeLoan, makeStudent, makeUser } from '@tests/factories'
import { auditLog, copies, loans } from '@/db/schema'
import { fixedClock } from '@/lib/clock'
import * as service from './service'

let db: TestDb
let userId: number
beforeEach(async () => {
  db = await createTestDb()
  userId = (await makeUser(db)).id
})

async function scenario(dueDate = '2026-03-16') {
  const book = await makeBook(db, { title: 'O Pequeno Príncipe' })
  const copy = await makeCopy(db, { book, code: 'PP-001' })
  const student = await makeStudent(db, { name: 'Raissa', className: '5A' })
  const loan = await makeLoan(db, { copy, student, dueDate })
  return { book, copy, student, loan }
}

describe('US05 Registrar devolução — conferência', () => {
  it('[US05-CA2] mostra aluno e título do exemplar antes de confirmar', async () => {
    const { loan } = await scenario()

    const found = await service.findOpenLoanByCopyCode(db, fixedClock('2026-03-10'), 'PP-001')

    expect(found).toMatchObject({
      loanId: loan.id,
      copyCode: 'PP-001',
      bookTitle: 'O Pequeno Príncipe',
      studentName: 'Raissa',
      className: '5A',
      dueDate: '2026-03-16',
      daysLate: 0,
    })
  })

  it('busca o código sem diferenciar maiúsculas e ignorando espaços', async () => {
    await scenario()

    await expect(
      service.findOpenLoanByCopyCode(db, fixedClock('2026-03-10'), '  pp-001 '),
    ).resolves.toMatchObject({
      copyCode: 'PP-001',
    })
  })

  it('já indica o atraso na conferência', async () => {
    await scenario('2026-03-16')

    const found = await service.findOpenLoanByCopyCode(db, fixedClock('2026-03-19'), 'PP-001')

    expect(found.daysLate).toBe(3)
  })

  it('[US05-CA1] não busca sem código do exemplar', async () => {
    await expect(service.findOpenLoanByCopyCode(db, fixedClock('2026-03-10'), '  ')).rejects.toMatchObject({
      code: 'RETURN_NO_COPY',
    })
  })

  it('[US05-CA1] código inexistente', async () => {
    await expect(service.findOpenLoanByCopyCode(db, fixedClock('2026-03-10'), 'NAO-EXISTE')).rejects.toThrow(
      'Exemplar não encontrado',
    )
  })

  it('exemplar que não está emprestado', async () => {
    await makeCopy(db, { code: 'LIVRE-1' })

    await expect(
      service.findOpenLoanByCopyCode(db, fixedClock('2026-03-10'), 'LIVRE-1'),
    ).rejects.toMatchObject({
      code: 'RETURN_NOT_LOANED',
    })
  })
})

describe('US05 Registrar devolução — baixa', () => {
  it('[US05-CA3] devolução no prazo: dá baixa, libera o exemplar e não marca atraso', async () => {
    const { loan, copy } = await scenario('2026-03-16')

    const result = await service.registerReturn(db, fixedClock('2026-03-16', '17:30'), userId, {
      loanId: loan.id,
      condition: 'ok',
    })

    expect(result).toMatchObject({
      returnedLate: false,
      daysLate: 0,
      condition: 'ok',
      bookTitle: 'O Pequeno Príncipe',
    })
    const [saved] = await db.select().from(loans).where(eq(loans.id, loan.id))
    expect(saved).toMatchObject({ returnedBy: userId, returnCondition: 'ok', returnedLate: false })
    expect(saved!.returnedAt?.toISOString()).toBe('2026-03-16T20:30:00.000Z')
    const [c] = await db.select().from(copies).where(eq(copies.id, copy.id))
    expect(c!.status).toBe('disponivel')
  })

  it('[US05-CA3] devolução depois da data prevista é registrada como atraso', async () => {
    const { loan } = await scenario('2026-03-16')

    const result = await service.registerReturn(db, fixedClock('2026-03-18'), userId, {
      loanId: loan.id,
      condition: 'ok',
    })

    expect(result).toMatchObject({ returnedLate: true, daysLate: 2 })
    const [saved] = await db.select().from(loans).where(eq(loans.id, loan.id))
    expect(saved!.returnedLate).toBe(true)
  })

  it('[US05-CA3] 23h50 do dia do prazo ainda é no prazo (fuso da escola)', async () => {
    const { loan } = await scenario('2026-03-16')

    const result = await service.registerReturn(db, fixedClock('2026-03-16', '23:50'), userId, {
      loanId: loan.id,
      condition: 'ok',
    })

    expect(result.returnedLate).toBe(false)
  })

  it.each(['perdido', 'danificado'] as const)('[US05-CA4] registra exemplar %s', async (condition) => {
    const { loan, copy } = await scenario()

    await service.registerReturn(db, fixedClock('2026-03-10'), userId, { loanId: loan.id, condition })

    const [saved] = await db.select().from(loans).where(eq(loans.id, loan.id))
    expect(saved!.returnCondition).toBe(condition)
    const [c] = await db.select().from(copies).where(eq(copies.id, copy.id))
    expect(c!.status).toBe(condition)
  })

  it('não devolve duas vezes o mesmo empréstimo', async () => {
    const { loan } = await scenario()
    await service.registerReturn(db, fixedClock('2026-03-10'), userId, { loanId: loan.id, condition: 'ok' })

    await expect(
      service.registerReturn(db, fixedClock('2026-03-11'), userId, { loanId: loan.id, condition: 'perdido' }),
    ).rejects.toMatchObject({ code: 'RETURN_ALREADY_DONE' })
  })

  it('empréstimo inexistente', async () => {
    await expect(
      service.registerReturn(db, fixedClock('2026-03-10'), userId, { loanId: 999, condition: 'ok' }),
    ).rejects.toThrow('Empréstimo não encontrado')
  })

  it('[US03-CA3] registra quem fez a devolução no histórico', async () => {
    const { loan } = await scenario('2026-03-16')

    await service.registerReturn(db, fixedClock('2026-03-17'), userId, {
      loanId: loan.id,
      condition: 'danificado',
    })

    const [log] = await db.select().from(auditLog)
    expect(log).toMatchObject({
      userId,
      action: 'emprestimo.devolver',
      entityId: loan.id,
      payload: { copyCode: 'PP-001', condition: 'danificado', late: true, daysLate: 1 },
    })
  })

  it('exemplar devolvido pode ser conferido de novo só se for emprestado outra vez', async () => {
    const { loan } = await scenario()
    await service.registerReturn(db, fixedClock('2026-03-10'), userId, { loanId: loan.id, condition: 'ok' })

    await expect(
      service.findOpenLoanByCopyCode(db, fixedClock('2026-03-10'), 'PP-001'),
    ).rejects.toMatchObject({
      code: 'RETURN_NOT_LOANED',
    })
  })
})
