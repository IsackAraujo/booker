import Link from 'next/link'
import { getDb } from '@/db/client'
import { linkInfo } from '@/modules/students/telegram'
import { UnlinkTelegram } from './unlink-telegram'

/** Situação do vínculo do responsável com o bot do Telegram (ADR 8), com link e QR code para enviar. */
export async function TelegramCard({ studentId }: { studentId: number }) {
  const bot = process.env.TELEGRAM_BOT_USERNAME
  return (
    <div className="card max-w-lg space-y-3">
      <h2 className="text-lg font-semibold">Avisos pelo Telegram</h2>
      {!bot ? (
        <p className="text-sm text-slate-600">
          O bot do Telegram ainda não foi configurado (TELEGRAM_BOT_USERNAME).
        </p>
      ) : (
        <TelegramLink studentId={studentId} bot={bot} />
      )}
    </div>
  )
}

async function TelegramLink({ studentId, bot }: { studentId: number; bot: string }) {
  const info = await linkInfo(await getDb(), bot, studentId)
  return (
    <div className="space-y-3 text-sm">
      {info.linked ? (
        <p className="rounded-md bg-emerald-50 px-3 py-2 text-emerald-900">
          Responsável vinculado: recebe lembretes e avisos de atraso.
        </p>
      ) : (
        <p className="rounded-md bg-amber-100 px-3 py-2 text-amber-900">
          Responsável ainda não vinculado: não recebe avisos. Envie o link ou o QR code abaixo.
        </p>
      )}
      <div className="flex flex-wrap items-start gap-4">
        <div
          className="w-40"
          dangerouslySetInnerHTML={{ __html: info.qrSvg }}
          aria-label="QR code de vínculo"
        />
        <div className="min-w-0 flex-1 space-y-2">
          <p className="text-slate-600">Link de vínculo (abre o bot da biblioteca):</p>
          <p
            className="break-all rounded bg-slate-100 px-2 py-1 font-mono text-xs"
            data-testid="telegram-link"
          >
            {info.url}
          </p>
          <Link
            href={`/alunos/telegram?turma=${encodeURIComponent(info.className)}`}
            className="text-emerald-800 underline"
          >
            Links da turma {info.className} para imprimir
          </Link>
        </div>
      </div>
      {info.linked && <UnlinkTelegram studentId={studentId} />}
    </div>
  )
}
