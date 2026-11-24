import { guardPage } from '@/components/guard'
import { getDb } from '@/db/client'
import { systemClock } from '@/lib/clock'
import { history, historyUsers, parseHistoryFilter } from '@/modules/audit/history'

export const dynamic = 'force-dynamic'

const dateTimeBr = (d: Date) =>
  d.toLocaleString('pt-BR', { timeZone: 'America/Sao_Paulo', dateStyle: 'short', timeStyle: 'medium' })

/** T3.3 / US03-CA4: histórico de operações por período e usuário. Somente leitura. */
export default async function HistoricoPage({
  searchParams,
}: {
  searchParams: Promise<{ de?: string; ate?: string; usuario?: string }>
}) {
  const { denied } = await guardPage('bibliotecaria', 'coordenacao')
  if (denied) return denied
  const filter = parseHistoryFilter(await searchParams, systemClock.today())
  const db = await getDb()
  const [rows, people] = await Promise.all([history(db, filter), historyUsers(db)])

  return (
    <section className="space-y-4">
      <h1 className="text-2xl font-semibold">Histórico de operações</h1>
      <form className="flex flex-wrap items-end gap-3">
        <label className="text-sm">
          <span className="mb-1 block font-medium">De</span>
          <input type="date" name="de" defaultValue={filter.from} className="input" />
        </label>
        <label className="text-sm">
          <span className="mb-1 block font-medium">Até</span>
          <input type="date" name="ate" defaultValue={filter.to} className="input" />
        </label>
        <label className="text-sm">
          <span className="mb-1 block font-medium">Usuário</span>
          <select name="usuario" defaultValue={filter.userId ?? ''} className="input">
            <option value="">Todos</option>
            {people.map((p) => (
              <option key={p.id} value={p.id}>
                {p.name}
              </option>
            ))}
          </select>
        </label>
        <button className="btn-secondary">Filtrar</button>
      </form>
      <p className="text-sm text-slate-600">
        {rows.length} {rows.length === 1 ? 'registro' : 'registros'}
        {rows.length === 500 && ' (mostrando os 500 mais recentes; reduza o período)'}. O histórico não pode
        ser alterado.
      </p>
      {rows.length > 0 && (
        <div className="overflow-x-auto">
          <table className="w-full text-left text-sm">
            <thead className="text-slate-500">
              <tr>
                <th className="py-2">Data e hora</th>
                <th>Usuário</th>
                <th>Operação</th>
                <th>Detalhe</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => (
                <tr key={r.id} className="border-t border-slate-200 align-top">
                  <td className="whitespace-nowrap py-2">{dateTimeBr(r.createdAt)}</td>
                  <td>
                    {r.userName} <span className="text-slate-500">({r.userRole})</span>
                  </td>
                  <td>{r.actionLabel}</td>
                  <td className="text-slate-600">{detail(r.payload)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </section>
  )
}

/** Resumo legível dos dados mais úteis da operação (exemplar, situação, atraso). */
function detail(payload: Record<string, unknown> | null): string {
  if (!payload) return ''
  const parts: string[] = []
  if (payload.copyCode) parts.push(`exemplar ${payload.copyCode}`)
  if (payload.dueDate) parts.push(`devolver até ${String(payload.dueDate).split('-').reverse().join('/')}`)
  if (payload.condition && payload.condition !== 'ok') parts.push(String(payload.condition))
  if (payload.late) parts.push(`${payload.daysLate} dia(s) de atraso`)
  if (typeof payload.sent === 'number') parts.push(`${payload.sent} enviado(s)`)
  if (typeof payload.created === 'number')
    parts.push(`${payload.created} novo(s), ${payload.updated} atualizado(s)`)
  return parts.join(' · ')
}
