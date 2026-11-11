import { differenceInCalendarDays, parseISO } from 'date-fns'
import type { IsoDate } from '@/lib/clock'

// Regras puras de empréstimo e devolução. Sem banco, sem data do sistema (datas chegam por parâmetro).

export type ReturnCondition = 'ok' | 'perdido' | 'danificado'
export type CopyStatus = 'disponivel' | 'emprestado' | 'separado' | 'perdido' | 'danificado'

/** Dias de atraso em `onDate` (0 se não está atrasado). Devolver no próprio dia do prazo não é atraso. */
export function daysLate(dueDate: IsoDate, onDate: IsoDate): number {
  return Math.max(0, differenceInCalendarDays(parseISO(onDate), parseISO(dueDate)))
}

/** US05-CA3: devolução feita depois da data prevista é atraso. */
export function isLate(dueDate: IsoDate, returnDate: IsoDate): boolean {
  return daysLate(dueDate, returnDate) > 0
}

/** Situação do exemplar depois da devolução (US05, T5.2 e T5.3). */
export function copyStatusAfterReturn(condition: ReturnCondition): CopyStatus {
  if (condition === 'perdido') return 'perdido'
  if (condition === 'danificado') return 'danificado'
  return 'disponivel'
}

export const RETURN_CONDITION_LABEL: Record<ReturnCondition, string> = {
  ok: 'Devolvido em bom estado',
  perdido: 'Perdido',
  danificado: 'Danificado',
}
