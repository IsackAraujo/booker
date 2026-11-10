import { eq } from 'drizzle-orm'
import { createTestDb, type TestDb } from '@tests/support/db'
import { setTestDeps } from '@tests/support/deps'
import { asSession, makeCopy, makeLoan, makeUser } from '@tests/factories'
import { fakeUser, loginAs, rolesExcept } from '@tests/support/session'
import { loans } from '@/db/schema'
import { idle } from '@/lib/action'
import { fixedClock } from '@/lib/clock'
import { findLoanForReturnAction, registerReturnAction } from './actions'

let db: TestDb
beforeEach(async () => {
  db = await createTestDb()
  setTestDeps({ db, clock: fixedClock('2026-03-18') })
})

function form(fields: Record<string, string>) {
  const f = new FormData()
  for (const [k, v] of Object.entries(fields)) f.set(k, v)
  return f
}

describe('US05 Registrar devolução — Server Actions', () => {
  it('[US03-CA1] sem sessão não registra devolução', async () => {
    const loan = await makeLoan(db)

    const result = await registerReturnAction(idle, form({ loanId: String(loan.id), condition: 'ok' }))

    expect(result).toEqual({ status: 'error', message: 'É preciso entrar no sistema.' })
    const [l] = await db.select().from(loans).where(eq(loans.id, loan.id))
    expect(l!.returnedAt).toBeNull()
  })

  it.each(rolesExcept('bibliotecaria'))('[US03-CA2] perfil %s não registra devolução', async (role) => {
    loginAs(fakeUser(role))
    const loan = await makeLoan(db)

    expect(
      await registerReturnAction(idle, form({ loanId: String(loan.id), condition: 'ok' })),
    ).toMatchObject({
      status: 'error',
      message: 'Seu perfil não tem acesso a esta função.',
    })
    expect(await findLoanForReturnAction(idle, form({ code: 'X' }))).toMatchObject({ status: 'error' })
  })

  it('[US05-CA1] não confirma sem identificar o exemplar', async () => {
    loginAs(asSession(await makeUser(db)))

    expect(await registerReturnAction(idle, form({ condition: 'ok' }))).toEqual({
      status: 'error',
      message: 'Identifique o exemplar antes de confirmar.',
    })
  })

  it('[US05-CA2] [US05-CA3] confere pelo código e confirma a devolução atrasada', async () => {
    loginAs(asSession(await makeUser(db)))
    const copy = await makeCopy(db, { code: 'AB-12' })
    await makeLoan(db, { copy, dueDate: '2026-03-16' })

    const found = await findLoanForReturnAction(idle, form({ code: 'ab-12' }))
    expect(found).toMatchObject({ status: 'ok', data: { copyCode: 'AB-12', daysLate: 2 } })
    const loanId = (found as { data: { loanId: number } }).data.loanId

    const done = await registerReturnAction(idle, form({ loanId: String(loanId), condition: 'ok' }))

    expect(done).toMatchObject({
      status: 'ok',
      message: 'Devolução registrada.',
      data: { returnedLate: true },
    })
  })

  it('condição inválida é recusada', async () => {
    loginAs(asSession(await makeUser(db)))
    const loan = await makeLoan(db)

    expect(
      await registerReturnAction(idle, form({ loanId: String(loan.id), condition: 'sumiu' })),
    ).toMatchObject({
      status: 'error',
    })
  })
})
