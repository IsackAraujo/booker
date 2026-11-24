import { eq } from 'drizzle-orm'
import { createTestDb, type TestDb } from '@tests/support/db'
import { makeStudent } from '@tests/factories'
import { students } from '@/db/schema'
import { fixedClock } from '@/lib/clock'
import {
  classLinks,
  ensureLinkCode,
  handleTelegramUpdate,
  linkInfo,
  newLinkCode,
  telegramLink,
  unlinkTelegram,
  webhookReply,
} from './telegram'

const clock = fixedClock('2026-11-24')
let db: TestDb
beforeEach(async () => {
  db = await createTestDb()
})

const start = (text: string, chatId = 555) => ({ message: { text, chat: { id: chatId } } })

describe('SEB-35 Vínculo do responsável com o bot do Telegram', () => {
  it('o código do link cabe no parâmetro start do Telegram', () => {
    const code = newLinkCode()

    expect(code).toMatch(/^[A-Za-z0-9_-]{16}$/)
    expect(newLinkCode()).not.toBe(code)
    expect(telegramLink('@biblioteca_bot', code)).toBe(`https://t.me/biblioteca_bot?start=${code}`)
  })

  it('o código é criado uma vez e reaproveitado', async () => {
    const s = await makeStudent(db)

    const first = await ensureLinkCode(db, s.id)

    expect(await ensureLinkCode(db, s.id)).toBe(first)
  })

  it('aluno inexistente', async () => {
    await expect(ensureLinkCode(db, 999)).rejects.toThrow('Aluno não encontrado')
  })

  it('link e QR code de vínculo do aluno', async () => {
    const s = await makeStudent(db, { name: 'Raissa', className: '5A', telegramChatId: null })

    const info = await linkInfo(db, 'biblioteca_bot', s.id)

    expect(info).toMatchObject({ name: 'Raissa', className: '5A', linked: false })
    expect(info.url).toMatch(/^https:\/\/t\.me\/biblioteca_bot\?start=[A-Za-z0-9_-]{16}$/)
    expect(info.qrSvg).toContain('<svg')
  })

  it('links da turma: só alunos ativos, em ordem de nome', async () => {
    await makeStudent(db, { name: 'Bruno', className: '5A' })
    await makeStudent(db, { name: 'Ana', className: '5A' })
    await makeStudent(db, { name: 'Caio', className: '5A', status: 'transferido' })
    await makeStudent(db, { name: 'Duda', className: '6B' })

    expect((await classLinks(db, 'bot', '5a')).map((l) => l.name)).toEqual(['Ana', 'Bruno'])
  })

  it('"/start <código>" grava o chat do responsável no aluno', async () => {
    const s = await makeStudent(db, { name: 'Raissa', telegramChatId: null })
    const code = await ensureLinkCode(db, s.id)

    const outcome = await handleTelegramUpdate(db, clock, start(`/start ${code}`, 4242))

    expect(outcome).toEqual({ kind: 'linked', chatId: '4242', studentName: 'Raissa' })
    const [saved] = await db.select().from(students).where(eq(students.id, s.id))
    expect(saved!.telegramChatId).toBe('4242')
    expect(webhookReply(outcome)).toContain('avisos da biblioteca sobre Raissa')
  })

  it('o mesmo responsável pode vincular irmãos', async () => {
    const a = await makeStudent(db, { name: 'Ana', telegramChatId: null })
    const b = await makeStudent(db, { name: 'Beto', telegramChatId: null })

    await handleTelegramUpdate(db, clock, start(`/start ${await ensureLinkCode(db, a.id)}`, 7))
    await handleTelegramUpdate(db, clock, start(`/start ${await ensureLinkCode(db, b.id)}`, 7))

    const rows = await db.select({ chat: students.telegramChatId }).from(students)
    expect(rows.map((r) => r.chat)).toEqual(['7', '7'])
  })

  it('código inválido não vincula ninguém e o bot avisa', async () => {
    await makeStudent(db, { telegramChatId: null })

    const outcome = await handleTelegramUpdate(db, clock, start('/start codigoerrado'))

    expect(outcome).toEqual({ kind: 'invalid-code', chatId: '555' })
    expect(webhookReply(outcome)).toContain('não é válido')
  })

  it('"/start" sem código explica como vincular', async () => {
    const outcome = await handleTelegramUpdate(db, clock, start('/start'))

    expect(outcome).toEqual({ kind: 'no-code', chatId: '555' })
    expect(webhookReply(outcome)).toContain('abra o link de vínculo')
  })

  it.each([{}, { message: { text: 'oi', chat: { id: 1 } } }, { message: { text: '/start abc' } }])(
    'ignora mensagens que não são /start: %o',
    async (update) => {
      const outcome = await handleTelegramUpdate(db, clock, update)

      expect(outcome).toEqual({ kind: 'ignored' })
      expect(webhookReply(outcome)).toBeNull()
    },
  )

  it('desvincular apaga o chat e troca o código (o link antigo deixa de valer)', async () => {
    const s = await makeStudent(db, { telegramChatId: '99' })
    const old = await ensureLinkCode(db, s.id)

    await unlinkTelegram(db, clock, s.id)

    const [saved] = await db.select().from(students).where(eq(students.id, s.id))
    expect(saved!.telegramChatId).toBeNull()
    expect(saved!.telegramLinkCode).not.toBe(old)
    expect((await handleTelegramUpdate(db, clock, start(`/start ${old}`))).kind).toBe('invalid-code')
  })
})
