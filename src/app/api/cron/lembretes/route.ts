import { timingSafeEqual } from 'node:crypto'
import { getDeps } from '@/lib/deps'
import { sendDueReminders } from '@/modules/notifications/reminders'

/**
 * T7.2: rotina diária dos lembretes (ARCHITECTURE.md §8). Chamada pelo agendador com
 * `Authorization: Bearer $CRON_SECRET`. GET e POST, porque agendadores diferentes usam métodos diferentes.
 * Idempotente: rodar de novo no mesmo dia não envia em dobro.
 */
async function run(request: Request) {
  const secret = process.env.CRON_SECRET
  const auth = request.headers.get('authorization') ?? ''
  if (!secret || !safeEqual(auth, `Bearer ${secret}`)) return new Response('forbidden', { status: 403 })
  const { db, clock, sender } = await getDeps()
  const result = await sendDueReminders(db, clock, sender)
  return Response.json({ ok: true, sent: result.sent, failed: result.failed.length, skipped: result.skipped })
}

export const GET = run
export const POST = run

function safeEqual(a: string, b: string) {
  const x = Buffer.from(a)
  const y = Buffer.from(b)
  return x.length === y.length && timingSafeEqual(x, y)
}
