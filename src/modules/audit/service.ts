import { and, desc, eq, gte, lt } from 'drizzle-orm'
import { addDays, format, parseISO } from 'date-fns'
import { TZDate } from '@date-fns/tz'
import { auditLog } from '@/db/schema'
import type { Db } from '@/db/types'
import { SCHOOL_TZ, type IsoDate } from '@/lib/clock'

export interface AuditEntry {
  userId: number
  action: string
  entity: string
  entityId?: number | null
  payload?: Record<string, unknown>
}

/**
 * Registra uma operação no histórico. Chame com a MESMA transação da operação (ARCHITECTURE.md §7).
 * Não existe update nem delete: o histórico é imutável (US03-CA4), reforçado por trigger no banco.
 */
export async function append(tx: Db, entry: AuditEntry) {
  await tx.insert(auditLog).values({
    userId: entry.userId,
    action: entry.action,
    entity: entry.entity,
    entityId: entry.entityId ?? null,
    payload: entry.payload ?? null,
  })
}

function startOfSchoolDay(date: IsoDate): Date {
  const [y, m, d] = date.split('-').map(Number) as [number, number, number]
  return new Date(new TZDate(y, m - 1, d, 0, 0, 0, SCHOOL_TZ).getTime())
}

export async function list(db: Db, filter: { from?: IsoDate; to?: IsoDate; userId?: number } = {}) {
  const conditions = []
  if (filter.from) conditions.push(gte(auditLog.createdAt, startOfSchoolDay(filter.from)))
  if (filter.to) {
    const next = format(addDays(parseISO(filter.to), 1), 'yyyy-MM-dd')
    conditions.push(lt(auditLog.createdAt, startOfSchoolDay(next)))
  }
  if (filter.userId) conditions.push(eq(auditLog.userId, filter.userId))
  return db
    .select()
    .from(auditLog)
    .where(conditions.length ? and(...conditions) : undefined)
    .orderBy(desc(auditLog.createdAt), desc(auditLog.id))
}
