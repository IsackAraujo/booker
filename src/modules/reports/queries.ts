import 'server-only'
import { getDeps } from '@/lib/deps'
import { requireRole } from '@/lib/session'
import { isDashboardKind, parseFilter, type DashboardKind } from './rules'
import * as service from './service'

/**
 * Dados da página do painel. Só coordenação e bibliotecária (US13-CA4); professor recebe ForbiddenError.
 */
export async function loadDashboard(params: { de?: string; ate?: string; turma?: string; ver?: string }) {
  await requireRole('coordenacao', 'bibliotecaria')
  const { db, clock } = await getDeps()
  const filter = parseFilter(params, clock.today())
  const kind: DashboardKind | null = isDashboardKind(params.ver) ? params.ver : null
  const [totals, classes, details] = await Promise.all([
    service.dashboardTotals(db, clock, filter),
    service.allClasses(db),
    kind ? service.dashboardDetails(db, clock, kind, filter) : Promise.resolve(null),
  ])
  return { filter, totals, classes, kind, details }
}
