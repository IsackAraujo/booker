import { createTestDb, type TestDb } from '@tests/support/db'
import { setTestDeps } from '@tests/support/deps'
import { makeLoan, makeSettings } from '@tests/factories'
import { fixedClock } from '@/lib/clock'
import { FakeMessageSender } from '@/modules/notifications/sender'
import { GET, POST } from './route'

let db: TestDb
let sender: FakeMessageSender
beforeEach(async () => {
  db = await createTestDb()
  sender = new FakeMessageSender()
  setTestDeps({ db, clock: fixedClock('2026-03-10'), sender })
  await makeSettings(db, { reminderDaysBefore: 3 })
  process.env.CRON_SECRET = 'cron-teste'
})
afterEach(() => {
  delete process.env.CRON_SECRET
})

const call = (handler: typeof GET, auth?: string) =>
  handler(
    new Request('http://localhost/api/cron/lembretes', { headers: auth ? { authorization: auth } : {} }),
  )

describe('T7.2 Rota da rotina diária de lembretes', () => {
  it.each([
    ['GET', GET],
    ['POST', POST],
  ])('%s com o segredo envia os lembretes e devolve o resumo', async (_m, handler) => {
    await makeLoan(db, { dueDate: '2026-03-13' })

    const res = await call(handler, 'Bearer cron-teste')

    expect(res.status).toBe(200)
    expect(await res.json()).toEqual({ ok: true, sent: 1, failed: 0, skipped: 0 })
  })

  it.each([undefined, 'Bearer errado', 'cron-teste'])('recusa sem o segredo correto (%s)', async (auth) => {
    await makeLoan(db, { dueDate: '2026-03-13' })

    expect((await call(GET, auth)).status).toBe(403)
    expect(sender.sent).toHaveLength(0)
  })

  it('sem CRON_SECRET configurado, recusa tudo', async () => {
    delete process.env.CRON_SECRET

    expect((await call(GET, 'Bearer ')).status).toBe(403)
  })
})
