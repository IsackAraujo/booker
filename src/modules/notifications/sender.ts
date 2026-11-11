// Envio de mensagens (ARCHITECTURE.md §8). A integração real com o WhatsApp é a T7.1 (SEB-35).

export type SendResult = { ok: true; id: string } | { ok: false; error: string }

export interface MessageSender {
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

/** Placeholder até a T7.1: toda tentativa fica registrada como falha, sem enviar nada. */
class NotConfiguredSender implements MessageSender {
  async send(): Promise<SendResult> {
    return { ok: false, error: 'Envio por WhatsApp ainda não configurado (T7.1).' }
  }
}

const globalForSender = globalThis as unknown as { __bookerSender?: MessageSender }

export function getMessageSender(): MessageSender {
  globalForSender.__bookerSender ??=
    process.env.MESSAGE_SENDER === 'fake' ? new FakeMessageSender() : new NotConfiguredSender()
  return globalForSender.__bookerSender
}
