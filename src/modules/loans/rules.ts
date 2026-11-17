import { addDays, differenceInCalendarDays, format, getDay, parseISO } from 'date-fns'
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

export const COPY_STATUS_LABEL: Record<CopyStatus, string> = {
  disponivel: 'disponível',
  emprestado: 'emprestado',
  separado: 'separado para a fila de reserva',
  perdido: 'perdido',
  danificado: 'danificado',
}

/**
 * US04-CA2: data de devolução = data do empréstimo + `loanDays` dias corridos. Se cair no sábado ou no
 * domingo, vai para a segunda-feira (a biblioteca não abre no fim de semana).
 */
export function dueDate(loanDate: IsoDate, loanDays: number): IsoDate {
  let due = addDays(parseISO(loanDate), loanDays)
  const weekday = getDay(due)
  if (weekday === 6) due = addDays(due, 2)
  else if (weekday === 0) due = addDays(due, 1)
  return format(due, 'yyyy-MM-dd')
}

export interface BorrowerSituation {
  studentStatus: 'ativo' | 'transferido'
  /** Empréstimos abertos do aluno. */
  activeLoans: number
  /** Dos abertos, quantos já passaram do prazo. */
  overdueLoans: number
}

export interface LoanPolicy {
  maxActiveLoans: number
  blockWhenOverdue: boolean
}

export interface BorrowCheck {
  allowed: boolean
  /** Motivos que impedem o empréstimo. */
  blocks: string[]
  /** Avisos que não impedem (atraso, quando a escola não bloqueia). */
  warnings: string[]
}

const livros = (n: number) => (n === 1 ? '1 livro' : `${n} livros`)

/**
 * T4.3 / US04-CA3: o balcão avisa quando o aluno está em atraso ou no limite de livros.
 * No limite, bloqueia. Em atraso, bloqueia se a escola configurou `blockWhenOverdue`; senão só avisa.
 * Aluno transferido não pega empréstimo (US06-CA2).
 */
export function canBorrow(situation: BorrowerSituation, policy: LoanPolicy): BorrowCheck {
  const blocks: string[] = []
  const warnings: string[] = []
  if (situation.studentStatus === 'transferido') blocks.push('Aluno transferido não pode pegar livros.')
  if (situation.activeLoans >= policy.maxActiveLoans)
    blocks.push(
      `Aluno já está com ${livros(situation.activeLoans)} (limite da escola: ${livros(policy.maxActiveLoans)}).`,
    )
  if (situation.overdueLoans > 0) {
    const text = `Aluno com ${livros(situation.overdueLoans)} em atraso.`
    if (policy.blockWhenOverdue) blocks.push(`${text} Regularize a devolução antes de um novo empréstimo.`)
    else warnings.push(text)
  }
  return { allowed: blocks.length === 0, blocks, warnings }
}

/** US04-CA4: só exemplar disponível pode ser emprestado. Devolve o motivo quando não pode. */
export function copyUnavailableReason(status: CopyStatus): string | null {
  if (status === 'disponivel') return null
  if (status === 'emprestado') return 'Este exemplar já está emprestado. Registre a devolução antes.'
  return `Este exemplar está ${COPY_STATUS_LABEL[status]} e não pode ser emprestado.`
}
