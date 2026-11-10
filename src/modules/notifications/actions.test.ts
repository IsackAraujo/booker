import { createTestDb, type TestDb } from '@tests/support/db'
import { setTestDeps } from '@tests/support/deps'
import { asSession, makeLoan, makeUser } from '@tests/factories'
import { fakeUser, loginAs, rolesExcept } from '@tests/support/session'
import { notifications } from '@/db/schema'
import { idle } from '@/lib/action'
import { fixedClock } from '@/lib/clock'
import { sendOverdueNoticesAction } from './actions'
import { FakeMessageSender } from './sender'

let db: TestDb
let sender: FakeMessageSender
beforeEach(async () => {
  db = await createTestDb()
  sender = new FakeMessageSender()
  setTestDeps({ db, clock: fixedClock('2026-03-20'), sender })
})

function form(ids: number[]) {
  const f = new FormData()
  for (const id of ids) f.append('loanId', String(id))
  return f
}

describe('US08 Cobrança — Server Action', () => {
  it('[US03-CA1] sem sessão não envia', async () => {
    const loan = await makeLoan(db, { dueDate: '2026-03-10' })

    expect(await sendOverdueNoticesAction(idle, form([loan.id]))).toMatchObject({ status: 'error' })
    expect(sender.sent).toHaveLength(0)
  })

  it.each(rolesExcept('bibliotecaria'))('[US03-CA2] perfil %s não envia cobrança', async (role) => {
    loginAs(fakeUser(role))
    const loan = await makeLoan(db, { dueDate: '2026-03-10' })

    expect(await sendOverdueNoticesAction(idle, form([loan.id]))).toMatchObject({
      status: 'error',
      message: 'Seu perfil não tem acesso a esta função.',
    })
    expect(await db.select().from(notifications)).toHaveLength(0)
  })

  it('[US08-CA3] bibliotecária envia para vários de uma vez', async () => {
    loginAs(asSession(await makeUser(db)))
    const a = await makeLoan(db, { dueDate: '2026-03-10' })
    const b = await makeLoan(db, { dueDate: '2026-03-11' })

    expect(await sendOverdueNoticesAction(idle, form([a.id, b.id]))).toMatchObject({
      status: 'ok',
      data: { sent: 2, failed: [], skipped: 0 },
    })
  })

  it('sem seleção mostra mensagem', async () => {
    loginAs(asSession(await makeUser(db)))

    expect(await sendOverdueNoticesAction(idle, form([]))).toEqual({
      status: 'error',
      message: 'Selecione ao menos um empréstimo atrasado.',
    })
  })
})
