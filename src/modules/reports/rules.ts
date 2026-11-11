import type { IsoDate } from '@/lib/clock'

// Regras puras do painel (US13).

export type DashboardKind = 'disponiveis' | 'emprestados' | 'atrasados' | 'perdidos'

export const DASHBOARD_KINDS: { kind: DashboardKind; label: string; help: string }[] = [
  {
    kind: 'disponiveis',
    label: 'Disponíveis',
    help: 'Exemplares disponíveis agora (não depende do período nem da turma).',
  },
  { kind: 'emprestados', label: 'Emprestados', help: 'Empréstimos feitos no período.' },
  {
    kind: 'atrasados',
    label: 'Atrasados',
    help: 'Empréstimos com prazo no período devolvidos com atraso ou ainda em atraso.',
  },
  {
    kind: 'perdidos',
    label: 'Perdidos',
    help: 'Exemplares registrados como perdidos na devolução, no período.',
  },
]

export interface DashboardFilter {
  from: IsoDate
  to: IsoDate
  className?: string
}

const ISO = /^\d{4}-\d{2}-\d{2}$/

/** Período padrão: do dia 1º do mês atual até hoje. */
export function defaultPeriod(today: IsoDate): { from: IsoDate; to: IsoDate } {
  return { from: `${today.slice(0, 8)}01`, to: today }
}

/** Lê o filtro da URL (US13-CA2). Datas inválidas ou invertidas voltam para o período padrão. */
export function parseFilter(
  params: { de?: string; ate?: string; turma?: string },
  today: IsoDate,
): DashboardFilter & { warning?: string } {
  const fallback = defaultPeriod(today)
  const from = params.de && ISO.test(params.de) ? params.de : fallback.from
  const to = params.ate && ISO.test(params.ate) ? params.ate : fallback.to
  const className = params.turma?.trim().toUpperCase() || undefined
  if (from > to)
    return { ...fallback, className, warning: 'A data inicial era depois da final; mostrando o mês atual.' }
  return { from, to, className }
}

export function isDashboardKind(value: string | undefined): value is DashboardKind {
  return DASHBOARD_KINDS.some((k) => k.kind === value)
}
