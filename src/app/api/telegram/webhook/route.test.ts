import { eq } from 'drizzle-orm'
import { createTestDb, type TestDb } from '@tests/support/db'
import { setTestDeps } from '@tests/support/deps'
import { makeStudent } from '@tests/factories'
import { students } from '@/db/schema'
import { fixedClock } from '@/lib/clock'
import { FakeMessageSender } from '@/modules/notifications/sender'
import { ensureLinkCode } from '@/modules/students/telegram'
import { POST } from './route'

let db: TestDb
let sender: FakeMessageSender
beforeEach(async () => {
  db = await createTestDb()
  sender = new FakeMessageSender()
  setTestDeps({ db, clock: fixedClock('2026-11-24'), sender })
  process.env.TELEGRAM_WEBHOOK_SECRET = 'segredo-teste'
})
afterEach(() => {
  delete process.env.TELEGRAM_WEBHOOK_SECRET
})

function request(body: unknown, secret: string | null = 'segredo-teste') {
  const headers: Record<string, string> = { 'content-type': 'application/json' }
  if (secret !== null) headers['x-telegram-bot-api-secret-token'] = secret
  return new Request('http://localhost/api/telegram/webhook', {
    method: 'POST',
    headers,
    body: typeof body === 'string' ? body : JSON.stringify(body),
  })
}

describe('SEB-35 Webhook do bot do Telegram', () => {
  it('vincula o responsável e responde no Telegram', async () => {
    const s = await makeStudent(db, { name: 'Raissa', telegramChatId: null })
    const code = await ensureLinkCode(db, s.id)

    const res = await POST(request({ message: { text: `/start ${code}`, chat: { id: 31 } } }))

    expect(res.status).toBe(200)
    const [saved] = await db.select().from(students).where(eq(students.id, s.id))
    expect(saved!.telegramChatId).toBe('31')
    expect(sender.sent).toEqual([{ to: '31', body: expect.stringContaining('Raissa') }])
  })

  it.each([null, 'errado'])('recusa chamada sem o segredo correto (%s)', async (secret) => {
    const res = await POST(request({ message: { text: '/start x', chat: { id: 1 } } }, secret))

    expect(res.status).toBe(403)
    expect(sender.sent).toHaveLength(0)
  })

  it('sem segredo configurado no servidor, recusa tudo', async () => {
    delete process.env.TELEGRAM_WEBHOOK_SECRET

    expect((await POST(request({}))).status).toBe(403)
  })

  it('corpo inválido', async () => {
    expect((await POST(request('não é json'))).status).toBe(400)
  })

  it('mensagem comum é ignorada, sem resposta', async () => {
    const res = await POST(request({ message: { text: 'oi', chat: { id: 1 } } }))

    expect(res.status).toBe(200)
    expect(sender.sent).toHaveLength(0)
  })
})
