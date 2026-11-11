import { TZDate } from '@date-fns/tz'
import { format } from 'date-fns'

export const SCHOOL_TZ = 'America/Sao_Paulo'

/** Data de calendário no formato ISO (YYYY-MM-DD). */
export type IsoDate = string

export interface Clock {
  now(): Date
  /** Data de hoje no fuso da escola. */
  today(): IsoDate
}

export function toSchoolDate(instant: Date): IsoDate {
  return format(new TZDate(instant, SCHOOL_TZ), 'yyyy-MM-dd')
}

export const systemClock: Clock = {
  now: () => new Date(),
  today: () => toSchoolDate(new Date()),
}

/** Relógio parado, para testes. `fixedClock('2026-03-10')` = 10/03/2026 às 10h no fuso da escola. */
export function fixedClock(isoDate: IsoDate, time = '10:00'): Clock {
  const [y, m, d] = isoDate.split('-').map(Number) as [number, number, number]
  const [hh, mm] = time.split(':').map(Number) as [number, number]
  const instant = new TZDate(y, m - 1, d, hh, mm, 0, SCHOOL_TZ)
  return { now: () => new Date(instant.getTime()), today: () => isoDate }
}

/** Instante em que o dia começa no fuso da escola (00:00 em São Paulo). */
export function startOfSchoolDay(date: IsoDate): Date {
  const [y, m, d] = date.split('-').map(Number) as [number, number, number]
  return new Date(new TZDate(y, m - 1, d, 0, 0, 0, SCHOOL_TZ).getTime())
}

/** Intervalo [início do dia `from`, início do dia seguinte a `to`) para filtrar timestamps por período. */
export function schoolDayRange(from: IsoDate, to: IsoDate): { start: Date; end: Date } {
  const [y, m, d] = to.split('-').map(Number) as [number, number, number]
  const end = new Date(new TZDate(y, m - 1, d + 1, 0, 0, 0, SCHOOL_TZ).getTime())
  return { start: startOfSchoolDay(from), end }
}
