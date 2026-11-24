import { guardPage } from '@/components/guard'
import { getDb } from '@/db/client'
import { searchStudents } from '@/modules/students/service'
import { classLinks } from '@/modules/students/telegram'

export const dynamic = 'force-dynamic'

/** Links e QR codes de vínculo de uma turma, para imprimir e mandar para casa (ADR 8). */
export default async function TelegramTurmaPage({
  searchParams,
}: {
  searchParams: Promise<{ turma?: string }>
}) {
  const { denied } = await guardPage('bibliotecaria')
  if (denied) return denied
  const { turma = '' } = await searchParams
  const bot = process.env.TELEGRAM_BOT_USERNAME
  const db = await getDb()
  const classes = [...new Set((await searchStudents(db, '', 2000)).map((s) => s.className))].sort()
  const links = bot && turma ? await classLinks(db, bot, turma) : []

  return (
    <section className="space-y-4">
      <h1 className="text-2xl font-semibold print:hidden">Links do Telegram por turma</h1>
      {!bot && (
        <p className="card text-slate-700">
          O bot do Telegram ainda não foi configurado (TELEGRAM_BOT_USERNAME).
        </p>
      )}
      <form className="flex flex-wrap items-end gap-2 print:hidden">
        <label className="text-sm">
          <span className="mb-1 block font-medium">Turma</span>
          <select name="turma" defaultValue={turma} className="input">
            <option value="">Escolha…</option>
            {classes.map((c) => (
              <option key={c} value={c}>
                {c}
              </option>
            ))}
          </select>
        </label>
        <button className="btn-secondary">Ver</button>
      </form>
      {turma && bot && (
        <>
          <p className="text-sm text-slate-600 print:hidden">
            {links.filter((l) => l.linked).length} de {links.length} responsáveis já vinculados. Use Ctrl+P
            para imprimir.
          </p>
          <ul className="grid grid-cols-1 gap-3 sm:grid-cols-2 print:grid-cols-2">
            {links.map((l) => (
              <li key={l.studentId} className="card flex break-inside-avoid gap-3">
                <div className="w-28 shrink-0" dangerouslySetInnerHTML={{ __html: l.qrSvg }} />
                <div className="min-w-0 space-y-1 text-sm">
                  <p className="font-semibold">{l.name}</p>
                  <p>Turma {l.className}</p>
                  <p className="text-slate-600">
                    Para receber os avisos da biblioteca, aponte a câmera para o QR code ou abra o link no
                    celular:
                  </p>
                  <p className="break-all font-mono text-xs">{l.url}</p>
                  {l.linked && <p className="text-emerald-800 print:hidden">Já vinculado</p>}
                </div>
              </li>
            ))}
          </ul>
        </>
      )}
    </section>
  )
}
