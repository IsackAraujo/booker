import { overdueNoticeText } from './rules'
import { FakeMessageSender, getMessageSender } from './sender'

describe('US08 Texto do aviso', () => {
  it('[US08-CA3] traz aluno, título, data prevista em formato brasileiro e dias de atraso', () => {
    const text = overdueNoticeText({
      studentName: 'Raissa',
      bookTitle: 'Dom Casmurro',
      dueDate: '2026-03-15',
      daysLate: 5,
    })

    expect(text).toContain('Raissa')
    expect(text).toContain('"Dom Casmurro"')
    expect(text).toContain('15/03/2026')
    expect(text).toContain('5 dias de atraso')
  })

  it('usa singular para 1 dia', () => {
    expect(
      overdueNoticeText({ studentName: 'A', bookTitle: 'B', dueDate: '2026-03-15', daysLate: 1 }),
    ).toContain('(1 dia de atraso)')
  })
})

describe('Envio de mensagens', () => {
  it('FakeMessageSender guarda as mensagens e simula falha uma vez', async () => {
    const sender = new FakeMessageSender()
    sender.failNext('sem rede')

    expect(await sender.send('+55', 'a')).toEqual({ ok: false, error: 'sem rede' })
    expect(await sender.send('+55', 'b')).toEqual({ ok: true, id: 'fake-1' })
    expect(sender.sent).toEqual([{ to: '+55', body: 'b' }])
  })

  it('sem Telegram configurado, o envio falha com motivo claro', async () => {
    delete (globalThis as { __bookerSender?: unknown }).__bookerSender
    const previous = { sender: process.env.MESSAGE_SENDER, token: process.env.TELEGRAM_BOT_TOKEN }
    process.env.MESSAGE_SENDER = 'telegram'
    delete process.env.TELEGRAM_BOT_TOKEN
    try {
      expect(await getMessageSender().send('123', 'x')).toEqual({
        ok: false,
        error: 'Envio pelo Telegram não configurado (TELEGRAM_BOT_TOKEN).',
      })
    } finally {
      process.env.MESSAGE_SENDER = previous.sender
      if (previous.token) process.env.TELEGRAM_BOT_TOKEN = previous.token
      delete (globalThis as { __bookerSender?: unknown }).__bookerSender
    }
  })
})
