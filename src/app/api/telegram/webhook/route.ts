import { timingSafeEqual } from 'node:crypto'
import { getDeps } from '@/lib/deps'
import { handleTelegramUpdate, webhookReply, type TelegramUpdate } from '@/modules/students/telegram'

/**
 * Recebe as mensagens do bot (https://core.telegram.org/bots/api#setwebhook).
 * O Telegram manda o segredo configurado no setWebhook no cabeçalho X-Telegram-Bot-Api-Secret-Token.
 */
export async function POST(request: Request) {
  const secret = process.env.TELEGRAM_WEBHOOK_SECRET
  const given = request.headers.get('x-telegram-bot-api-secret-token') ?? ''
  if (!secret || !safeEqual(given, secret)) return new Response('forbidden', { status: 403 })

  let update: TelegramUpdate
  try {
    update = await request.json()
  } catch {
    return new Response('bad request', { status: 400 })
  }
  const { db, clock, sender } = await getDeps()
  const outcome = await handleTelegramUpdate(db, clock, update)
  const reply = webhookReply(outcome)
  if (reply && outcome.kind !== 'ignored') await sender.send(outcome.chatId, reply)
  // Sempre 200: senão o Telegram reenvia a mesma mensagem várias vezes.
  return Response.json({ ok: true })
}

function safeEqual(a: string, b: string) {
  const x = Buffer.from(a)
  const y = Buffer.from(b)
  return x.length === y.length && timingSafeEqual(x, y)
}
