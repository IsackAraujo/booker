import { and, asc, count, eq, gte, isNull, lt, lte, or, type SQL } from 'drizzle-orm'
import { books, copies, loans, students } from '@/db/schema'
import type { Db } from '@/db/types'
import { schoolDayRange, type Clock } from '@/lib/clock'
import type { DashboardFilter, DashboardKind } from './rules'

export type DashboardTotals = Record<DashboardKind, number>

/**
 * Condição de cada total sobre empréstimos (US13-CA1, CA2). "Disponíveis" é sobre exemplares e fica à parte.
 * Definições (também em DASHBOARD_KINDS, mostradas na tela):
 * - emprestados: empréstimo feito no período;
 * - atrasados: prazo no período e devolvido com atraso, ou ainda aberto com prazo vencido;
 * - perdidos: devolução registrada como "perdido" no período.
 */
function loanCondition(
  kind: Exclude<DashboardKind, 'disponiveis'>,
  filter: DashboardFilter,
  clock: Clock,
): SQL {
  const { start, end } = schoolDayRange(filter.from, filter.to)
  const byClass = filter.className ? eq(students.className, filter.className) : undefined
  const byKind = {
    emprestados: and(gte(loans.loanedAt, start), lt(loans.loanedAt, end)),
    atrasados: and(
      gte(loans.dueDate, filter.from),
      lte(loans.dueDate, filter.to),
      or(eq(loans.returnedLate, true), and(isNull(loans.returnedAt), lt(loans.dueDate, clock.today()))),
    ),
    perdidos: and(
      eq(loans.returnCondition, 'perdido'),
      gte(loans.returnedAt, start),
      lt(loans.returnedAt, end),
    ),
  }[kind]
  return and(byKind, byClass)!
}

async function countLoans(db: Db, condition: SQL) {
  const [row] = await db
    .select({ n: count() })
    .from(loans)
    .innerJoin(students, eq(students.id, loans.studentId))
    .where(condition)
  return row?.n ?? 0
}

/** Totais do painel (US13-CA1) para o período e a turma (CA2). */
export async function dashboardTotals(
  db: Db,
  clock: Clock,
  filter: DashboardFilter,
): Promise<DashboardTotals> {
  const [available] = await db.select({ n: count() }).from(copies).where(eq(copies.status, 'disponivel'))
  const [emprestados, atrasados, perdidos] = await Promise.all(
    (['emprestados', 'atrasados', 'perdidos'] as const).map((k) =>
      countLoans(db, loanCondition(k, filter, clock)),
    ),
  )
  return {
    disponiveis: available?.n ?? 0,
    emprestados: emprestados!,
    atrasados: atrasados!,
    perdidos: perdidos!,
  }
}

export interface DashboardRow {
  copyCode: string
  bookTitle: string
  studentName: string | null
  className: string | null
  loanedAt: Date | null
  dueDate: string | null
  returnedAt: Date | null
}

/** Relação de exemplares que compõe um total (US13-CA3). Mesmos critérios dos totais. */
export async function dashboardDetails(
  db: Db,
  clock: Clock,
  kind: DashboardKind,
  filter: DashboardFilter,
): Promise<DashboardRow[]> {
  if (kind === 'disponiveis') {
    const rows = await db
      .select({ copyCode: copies.code, bookTitle: books.title })
      .from(copies)
      .innerJoin(books, eq(books.id, copies.bookId))
      .where(eq(copies.status, 'disponivel'))
      .orderBy(asc(books.title), asc(copies.code))
    return rows.map((r) => ({
      ...r,
      studentName: null,
      className: null,
      loanedAt: null,
      dueDate: null,
      returnedAt: null,
    }))
  }
  return db
    .select({
      copyCode: copies.code,
      bookTitle: books.title,
      studentName: students.name,
      className: students.className,
      loanedAt: loans.loanedAt,
      dueDate: loans.dueDate,
      returnedAt: loans.returnedAt,
    })
    .from(loans)
    .innerJoin(students, eq(students.id, loans.studentId))
    .innerJoin(copies, eq(copies.id, loans.copyId))
    .innerJoin(books, eq(books.id, copies.bookId))
    .where(loanCondition(kind, filter, clock))
    .orderBy(asc(loans.dueDate), asc(students.className), asc(students.name))
}

/** Turmas existentes, para o filtro. */
export async function allClasses(db: Db): Promise<string[]> {
  const rows = await db
    .selectDistinct({ c: students.className })
    .from(students)
    .orderBy(asc(students.className))
  return rows.map((r) => r.c)
}
