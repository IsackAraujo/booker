import { eq } from 'drizzle-orm'
import { createTestDb, type TestDb } from '@tests/support/db'
import { makeBook, makeCopy, makeSettings, makeStudent, makeUser } from '@tests/factories'
import { auditLog, copies, loans } from '@/db/schema'
import { fixedClock } from '@/lib/clock'
import { listOverdue } from '@/modules/notifications/service'
import * as service from './service'

// SEB-49: devolução (US05) de ponta a ponta com o registro de empréstimo (US04), sem criar empréstimos
// direto no banco. Prazo de 14 dias e limite de 2 livros, com bloqueio por atraso (padrões da escola).

const LOAN_DAY = '2026-03-02' // segunda-feira; prazo de 14 dias cai em 16/03, também segunda

let db: TestDb
let userId: number
beforeEach(async () => {
  db = await createTestDb()
  userId = (await makeUser(db)).id
  await makeSettings(db, { loanDays: 14, maxActiveLoans: 2, blockWhenOverdue: true })
})

async function scenario() {
  const book = await makeBook(db, { title: 'Capitães da Areia' })
  const c1 = await makeCopy(db, { book, code: 'CA-1' })
  const c2 = await makeCopy(db, { book, code: 'CA-2' })
  const c3 = await makeCopy(db, { book, code: 'CA-3' })
  const student = await makeStudent(db, { name: 'Raissa' })
  return { c1, c2, c3, student }
}

const lend = (day: string, studentId: number, copyId: number) =>
  service.registerLoan(db, fixedClock(day), userId, { studentId, copyId })

const giveBack = (day: string, loanId: number, condition: 'ok' | 'perdido' | 'danificado' = 'ok') =>
  service.registerReturn(db, fixedClock(day), userId, { loanId, condition })

async function copyStatus(id: number) {
  const [c] = await db.select({ status: copies.status }).from(copies).where(eq(copies.id, id))
  return c!.status
}

describe('SEB-49 Empréstimo (US04) e devolução (US05) de ponta a ponta', () => {
  it('devolução no prazo libera o exemplar para um novo empréstimo', async () => {
    const { c1, student } = await scenario()
    const loan = await lend(LOAN_DAY, student.id, c1.id)
    expect(loan.dueDate).toBe('2026-03-16')

    const found = await service.findOpenLoanByCopyCode(db, fixedClock('2026-03-16'), 'ca-1')
    expect(found).toMatchObject({ loanId: loan.loanId, studentName: 'Raissa', daysLate: 0 })
    const ret = await giveBack('2026-03-16', loan.loanId)

    expect(ret).toMatchObject({ returnedLate: false, daysLate: 0 })
    expect(await copyStatus(c1.id)).toBe('disponivel')
    await expect(lend('2026-03-17', student.id, c1.id)).resolves.toMatchObject({ copyCode: 'CA-1' })
  })

  it('[US05-CA3] devolução depois do prazo calculado pela US04 é registrada como atraso', async () => {
    const { c1, student } = await scenario()
    const loan = await lend(LOAN_DAY, student.id, c1.id)

    const ret = await giveBack('2026-03-19', loan.loanId)

    expect(ret).toMatchObject({ returnedLate: true, daysLate: 3 })
    const [saved] = await db.select().from(loans).where(eq(loans.id, loan.loanId))
    expect(saved!.returnedLate).toBe(true)
  })

  it('[US04-CA3] aluno em atraso fica bloqueado e volta a poder emprestar depois de devolver', async () => {
    const { c1, c2, student } = await scenario()
    const loan = await lend(LOAN_DAY, student.id, c1.id)

    await expect(lend('2026-03-18', student.id, c2.id)).rejects.toMatchObject({ code: 'LOAN_BLOCKED' })
    await giveBack('2026-03-18', loan.loanId)

    await expect(lend('2026-03-18', student.id, c2.id)).resolves.toMatchObject({ copyCode: 'CA-2' })
  })

  it('[US04-CA3] no limite de livros, devolver um libera o próximo empréstimo', async () => {
    const { c1, c2, c3, student } = await scenario()
    const first = await lend(LOAN_DAY, student.id, c1.id)
    await lend(LOAN_DAY, student.id, c2.id)

    await expect(lend('2026-03-05', student.id, c3.id)).rejects.toThrow(/limite da escola: 2 livros/)
    await giveBack('2026-03-05', first.loanId)

    await expect(lend('2026-03-05', student.id, c3.id)).resolves.toMatchObject({ copyCode: 'CA-3' })
  })

  it.each(['perdido', 'danificado'] as const)(
    '[US05-CA4] exemplar devolvido como %s não pode ser emprestado de novo',
    async (condition) => {
      const { c1, student } = await scenario()
      const loan = await lend(LOAN_DAY, student.id, c1.id)

      await giveBack('2026-03-10', loan.loanId, condition)

      expect(await copyStatus(c1.id)).toBe(condition)
      await expect(lend('2026-03-11', student.id, c1.id)).rejects.toMatchObject({ code: 'LOAN_BLOCKED' })
    },
  )

  it('[US08-CA5] o atraso some da lista de cobrança depois da devolução', async () => {
    const { c1, student } = await scenario()
    const loan = await lend(LOAN_DAY, student.id, c1.id)
    expect((await listOverdue(db, fixedClock('2026-03-20'))).map((o) => o.loanId)).toEqual([loan.loanId])

    await giveBack('2026-03-20', loan.loanId)

    expect(await listOverdue(db, fixedClock('2026-03-20'))).toEqual([])
  })

  it('[US03-CA3] o histórico registra empréstimo e devolução, com quem fez', async () => {
    const { c1, student } = await scenario()
    const loan = await lend(LOAN_DAY, student.id, c1.id)

    await giveBack('2026-03-10', loan.loanId)

    const logs = await db.select().from(auditLog).where(eq(auditLog.entityId, loan.loanId))
    expect(logs.map((l) => [l.action, l.userId])).toEqual([
      ['emprestimo.registrar', userId],
      ['emprestimo.devolver', userId],
    ])
  })
})
