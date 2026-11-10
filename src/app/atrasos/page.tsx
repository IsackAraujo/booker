import { guardPage } from '@/components/guard'
import { getDb } from '@/db/client'
import { systemClock } from '@/lib/clock'
import { listOverdue, overdueClasses } from '@/modules/notifications/service'
import { OverdueTable } from './overdue-table'

export const dynamic = 'force-dynamic'

export default async function AtrasosPage({ searchParams }: { searchParams: Promise<{ turma?: string }> }) {
  const { denied } = await guardPage('bibliotecaria')
  if (denied) return denied
  const { turma = '' } = await searchParams
  const db = await getDb()
  const [list, classes] = await Promise.all([
    listOverdue(db, systemClock, { className: turma || undefined }),
    overdueClasses(db, systemClock),
  ])

  return (
    <section className="space-y-4">
      <h1 className="text-2xl font-semibold">Empréstimos atrasados</h1>
      <form className="flex flex-wrap items-end gap-2">
        <label className="text-sm">
          <span className="mb-1 block font-medium">Turma</span>
          <select name="turma" defaultValue={turma} className="input">
            <option value="">Todas</option>
            {classes.map((c) => (
              <option key={c} value={c}>
                {c}
              </option>
            ))}
          </select>
        </label>
        <button className="btn-secondary">Filtrar</button>
      </form>
      {list.length === 0 ? (
        <p className="card text-slate-700">Nenhum empréstimo atrasado{turma ? ` na turma ${turma}` : ''}.</p>
      ) : (
        <OverdueTable
          rows={list.map((l) => ({ ...l, lastNoticeAt: l.lastNoticeAt?.toISOString() ?? null }))}
        />
      )}
    </section>
  )
}
