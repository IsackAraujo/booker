// Envio de mensagens (ARCHITECTURE.md §8). Desde a ADR 8 o canal é o Telegram.

export type SendResult = { ok: true; id: string } | { ok: false; error: string }

export interface MessageSender {
  /** `to` é o chat_id do Telegram do responsável. */
  send(to: string, body: string): Promise<SendResult>
}

/** Guarda as mensagens em memória. Usado em testes e em desenvolvimento (MESSAGE_SENDER=fake). */
export class FakeMessageSender implements MessageSender {
  readonly sent: { to: string; body: string }[] = []
  private failures: string[] = []

  /** Faz o próximo envio falhar com o motivo indicado. */
  failNext(reason = 'falha simulada') {
    this.failures.push(reason)
  }

  async send(to: string, body: string): Promise<SendResult> {
    const failure = this.failures.shift()
    if (failure) return { ok: false, error: failure }
    this.sent.push({ to, body })
    return { ok: true, id: `fake-${this.sent.length}` }
  }
}

type FetchLike = (url: string, init: RequestInit) => Promise<Response>

/**
 * Envio pela Bot API do Telegram (https://core.telegram.org/bots/api#sendmessage).
 * O bot só consegue escrever para quem já iniciou conversa com ele: por isso o destino é o chat_id
 * gravado no vínculo do responsável, não o telefone.
 */
export class TelegramSender implements MessageSender {
  constructor(
    private readonly token: string,
    private readonly fetchImpl: FetchLike = fetch,
  ) {}

  async send(to: string, body: string): Promise<SendResult> {
    let response: Response
    try {
      response = await this.fetchImpl(`https://api.telegram.org/bot${this.token}/sendMessage`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ chat_id: to, text: body }),
        signal: AbortSignal.timeout(10_000),
      })
    } catch {
      return { ok: false, error: 'Sem conexão com o Telegram. Tente de novo mais tarde.' }
    }
    let data: { ok?: boolean; result?: { message_id?: number }; description?: string; error_code?: number }
    try {
      data = await response.json()
    } catch {
      return { ok: false, error: `Resposta inválida do Telegram (HTTP ${response.status}).` }
    }
    if (data.ok && data.result?.message_id !== undefined)
      return { ok: true, id: String(data.result.message_id) }
    return { ok: false, error: telegramErrorMessage(data.error_code ?? response.status, data.description) }
  }
}

/** Traduz os erros mais comuns da Bot API para a bibliotecária entender o que fazer. */
export function telegramErrorMessage(code: number, description = ''): string {
  if (code === 403)
    return 'O responsável bloqueou o bot ou saiu da conversa. Peça para abrir o link de vínculo de novo.'
  if (code === 400 && /chat not found/i.test(description))
    return 'Conversa do responsável não encontrada. Peça para abrir o link de vínculo de novo.'
  if (code === 401) return 'Token do bot inválido. Confira TELEGRAM_BOT_TOKEN.'
  if (code === 429) return 'Muitas mensagens em pouco tempo. Tente de novo em alguns minutos.'
  return `Telegram recusou o envio (${code}${description ? `: ${description}` : ''}).`
}

/** Sem configuração: toda tentativa fica registrada como falha, sem enviar nada. */
class NotConfiguredSender implements MessageSender {
  async send(): Promise<SendResult> {
    return { ok: false, error: 'Envio pelo Telegram não configurado (TELEGRAM_BOT_TOKEN).' }
  }
}

const globalForSender = globalThis as unknown as { __bookerSender?: MessageSender }

/** Escolhido por MESSAGE_SENDER: `fake` (testes e dev) ou `telegram` (com TELEGRAM_BOT_TOKEN). */
export function getMessageSender(): MessageSender {
  globalForSender.__bookerSender ??= createSender()
  return globalForSender.__bookerSender
}

function createSender(): MessageSender {
  if (process.env.MESSAGE_SENDER === 'fake') return new FakeMessageSender()
  if (process.env.MESSAGE_SENDER === 'telegram' && process.env.TELEGRAM_BOT_TOKEN)
    return new TelegramSender(process.env.TELEGRAM_BOT_TOKEN)
  return new NotConfiguredSender()
}
