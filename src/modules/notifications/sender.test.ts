import { getMessageSender, TelegramSender, telegramErrorMessage } from './sender'

function fakeFetch(status: number, body: unknown) {
  const calls: { url: string; init: RequestInit }[] = []
  const impl = async (url: string, init: RequestInit) => {
    calls.push({ url, init })
    return new Response(typeof body === 'string' ? body : JSON.stringify(body), { status })
  }
  return { impl, calls }
}

describe('SEB-35 Envio pelo Telegram', () => {
  it('chama sendMessage com o chat_id e o texto e devolve o id da mensagem', async () => {
    const { impl, calls } = fakeFetch(200, { ok: true, result: { message_id: 42 } })

    const result = await new TelegramSender('TOKEN', impl).send('987', 'Olá')

    expect(result).toEqual({ ok: true, id: '42' })
    expect(calls[0]!.url).toBe('https://api.telegram.org/botTOKEN/sendMessage')
    expect(calls[0]!.init.method).toBe('POST')
    expect(JSON.parse(String(calls[0]!.init.body))).toEqual({ chat_id: '987', text: 'Olá' })
  })

  it('[US07-CA4] responsável que bloqueou o bot vira falha com orientação', async () => {
    const { impl } = fakeFetch(403, {
      ok: false,
      error_code: 403,
      description: 'Forbidden: bot was blocked by the user',
    })

    expect(await new TelegramSender('T', impl).send('1', 'x')).toEqual({
      ok: false,
      error: 'O responsável bloqueou o bot ou saiu da conversa. Peça para abrir o link de vínculo de novo.',
    })
  })

  it('falha de rede não derruba o envio', async () => {
    const impl = async () => {
      throw new Error('ECONNRESET')
    }

    expect(await new TelegramSender('T', impl).send('1', 'x')).toEqual({
      ok: false,
      error: 'Sem conexão com o Telegram. Tente de novo mais tarde.',
    })
  })

  it('resposta que não é JSON vira falha', async () => {
    const { impl } = fakeFetch(502, '<html>Bad gateway</html>')

    expect(await new TelegramSender('T', impl).send('1', 'x')).toEqual({
      ok: false,
      error: 'Resposta inválida do Telegram (HTTP 502).',
    })
  })

  it.each([
    [400, 'Bad Request: chat not found', /Conversa do responsável não encontrada/],
    [401, 'Unauthorized', /Token do bot inválido/],
    [429, 'Too Many Requests', /Muitas mensagens/],
    [500, 'Internal', /Telegram recusou o envio \(500: Internal\)/],
  ])('traduz o erro %i', (code, description, expected) => {
    expect(telegramErrorMessage(code, description)).toMatch(expected)
  })

  it('MESSAGE_SENDER=telegram com token usa o Telegram', () => {
    delete (globalThis as { __bookerSender?: unknown }).__bookerSender
    const previous = { sender: process.env.MESSAGE_SENDER, token: process.env.TELEGRAM_BOT_TOKEN }
    process.env.MESSAGE_SENDER = 'telegram'
    process.env.TELEGRAM_BOT_TOKEN = 'abc'
    try {
      expect(getMessageSender()).toBeInstanceOf(TelegramSender)
    } finally {
      process.env.MESSAGE_SENDER = previous.sender
      if (previous.token) process.env.TELEGRAM_BOT_TOKEN = previous.token
      else delete process.env.TELEGRAM_BOT_TOKEN
      delete (globalThis as { __bookerSender?: unknown }).__bookerSender
    }
  })
})
