import Link from 'next/link'
import { guardPage } from '@/components/guard'
import { loadDashboard } from '@/modules/reports/queries'
import { DASHBOARD_KINDS } from '@/modules/reports/rules'

export const dynamic = 'force-dynamic'

type Params = { de?: string; ate?: string; turma?: string; ver?: string }

const dateBr = (iso: string) => iso.split('-').reverse().join('/')
const dateTimeBr = (d: Date) => d.toLocaleDateString('pt-BR', { timeZone: 'America/Sao_Paulo' })

export default async function PainelPage({ searchParams }: { searchParams: Promise<Params> }) {
  const { denied } = await guardPage('coordenacao', 'bibliotecaria')
  if (denied) return denied
  const params = await searchParams
  const { filter, totals, classes, kind, details } = await loadDashboard(params)

  const linkFor = (ver: string) => {
    const q = new URLSearchParams({ de: filter.from, ate: filter.to, ver })
    if (filter.className) q.set('turma', filter.className)
    return `/painel?${q}`
  }
  const selected = DASHBOARD_KINDS.find((k) => k.kind === kind)

  return (
    <section className="space-y-5">
      <h1 className="text-2xl font-semibold">Painel da biblioteca</h1>

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
          <span className="mb-1 block font-medium">Turma</span>
          <select name="turma" defaultValue={filter.className ?? ''} className="input">
            <option value="">Todas</option>
            {classes.map((c) => (
              <option key={c} value={c}>
                {c}
              </option>
            ))}
          </select>
        </label>
        <button className="btn-secondary">Aplicar</button>
      </form>
      {'warning' in filter && filter.warning && (
        <p role="alert" className="rounded-md bg-amber-50 px-3 py-2 text-sm text-amber-900">
          {filter.warning}
        </p>
      )}
      <p className="text-sm text-slate-600">
        Período: {dateBr(filter.from)} a {dateBr(filter.to)}
        {filter.className ? ` · Turma ${filter.className}` : ' · Todas as turmas'}
      </p>

      <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
        {DASHBOARD_KINDS.map((k) => (
          <Link
            key={k.kind}
            href={linkFor(k.kind)}
            className={`card block hover:border-emerald-600 ${kind === k.kind ? 'border-emerald-600' : ''}`}
            aria-label={`${k.label}: ${totals[k.kind]}. Ver relação`}
          >
            <span className="block text-sm text-slate-600">{k.label}</span>
            <span className="block text-3xl font-semibold" data-testid={`total-${k.kind}`}>
              {totals[k.kind]}
            </span>
            <span className="block text-xs text-slate-500">{k.help}</span>
          </Link>
        ))}
      </div>

      {selected && details && (
        <div className="space-y-2">
          <h2 className="text-lg font-semibold">
            {selected.label}: {details.length} {details.length === 1 ? 'exemplar' : 'exemplares'}
          </h2>
          {details.length === 0 ? (
            <p className="text-slate-600">Nenhum exemplar.</p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-left text-sm">
                <thead className="text-slate-500">
                  <tr>
                    <th className="py-2">Exemplar</th>
                    <th>Título</th>
                    {kind !== 'disponiveis' && (
                      <>
                        <th>Aluno</th>
                        <th>Turma</th>
                        <th>Empréstimo</th>
                        <th>Previsto</th>
                        <th>Devolução</th>
                      </>
                    )}
                  </tr>
                </thead>
                <tbody>
                  {details.map((r, i) => (
                    <tr key={`${r.copyCode}-${i}`} className="border-t border-slate-200">
                      <td className="py-2">{r.copyCode}</td>
                      <td>{r.bookTitle}</td>
                      {kind !== 'disponiveis' && (
                        <>
                          <td>{r.studentName}</td>
                          <td>{r.className}</td>
                          <td>{r.loanedAt ? dateTimeBr(r.loanedAt) : '—'}</td>
                          <td>{r.dueDate ? dateBr(r.dueDate) : '—'}</td>
                          <td>{r.returnedAt ? dateTimeBr(r.returnedAt) : 'Em aberto'}</td>
                        </>
                      )}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}
    </section>
  )
}
