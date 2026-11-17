import type { IsoDate } from '@/lib/clock'

// Regras puras da reserva de exemplares para a turma (US10). Datas chegam por parâmetro.

export interface ClassReservationInput {
  bookId: number | null
  className: string
  quantity: number | null
  activityDate: IsoDate | null
}

const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/

/** US10-CA1: quantidade e data da atividade são obrigatórias; data não pode ser passada. */
export function validateReservation(input: ClassReservationInput, today: IsoDate): string[] {
  const errors: string[] = []
  if (!input.bookId) errors.push('Escolha o livro')
  if (!input.className.trim()) errors.push('Informe a turma')
  if (input.quantity === null || !Number.isInteger(input.quantity))
    errors.push('Informe a quantidade de exemplares')
  else if (input.quantity < 1) errors.push('A quantidade deve ser pelo menos 1')
  if (!input.activityDate || !ISO_DATE.test(input.activityDate)) errors.push('Informe a data da atividade')
  else if (input.activityDate < today) errors.push('A data da atividade já passou')
  return errors
}

/**
 * Exemplares que podem ser reservados numa data (US10-CA2):
 * exemplares utilizáveis − emprestados que ainda estarão fora na data − já reservados para turmas na data.
 * Nunca negativo.
 */
export function availableOn(input: {
  usableCopies: number
  outOnDate: number
  reservedOnDate: number
}): number {
  return Math.max(0, input.usableCopies - input.outOnDate - input.reservedOnDate)
}

/**
 * Empréstimo aberto que ainda estará fora na data da atividade: vence na data ou depois, ou já está atrasado
 * (não dá para contar com a devolução de um livro atrasado).
 */
export function loanStillOutOn(dueDate: IsoDate, activityDate: IsoDate, today: IsoDate): boolean {
  return dueDate >= activityDate || dueDate < today
}

/** US10-CA4: a professora pode cancelar antes da data da atividade (no próprio dia, não). */
export function canCancel(activityDate: IsoDate, today: IsoDate): boolean {
  return today < activityDate
}
