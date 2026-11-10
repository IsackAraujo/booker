import { and, eq, isNull, sql } from 'drizzle-orm'
import { books, copies, loans, students } from '@/db/schema'
import type { Db } from '@/db/types'
import { toSchoolDate, type Clock, type IsoDate } from '@/lib/clock'
import { BusinessError, NotFoundError } from '@/lib/errors'
import * as audit from '@/modules/audit/service'
import { copyStatusAfterReturn, daysLate, isLate, type ReturnCondition } from './rules'

export interface OpenLoanDetails {
  loanId: number
  copyId: number
  copyCode: string
  bookTitle: string
  studentId: number
  studentName: string
  className: string
  dueDate: IsoDate
  loanedAt: Date
  /** Dias de atraso em relação a hoje (0 = no prazo). */
  daysLate: number
}

function normalizeCode(code: string) {
  return code.trim().toUpperCase()
}

/**
 * Empréstimo aberto do exemplar, com aluno e título, para conferência antes de confirmar (US05-CA2).
 * Código não encontrado ou exemplar sem empréstimo aberto viram erro com mensagem para o balcão.
 */
export async function findOpenLoanByCopyCode(db: Db, clock: Clock, code: string): Promise<OpenLoanDetails> {
  const normalized = normalizeCode(code)
  if (!normalized) throw new BusinessError('Informe o código do exemplar.', 'RETURN_NO_COPY')
  const [copy] = await db
    .select({ id: copies.id, status: copies.status })
    .from(copies)
    .where(sql`upper(${copies.code}) = ${normalized}`)
  if (!copy) throw new NotFoundError('Exemplar')
  const [row] = await db
    .select({
      loanId: loans.id,
      copyId: copies.id,
      copyCode: copies.code,
      bookTitle: books.title,
      studentId: students.id,
      studentName: students.name,
      className: students.className,
      dueDate: loans.dueDate,
      loanedAt: loans.loanedAt,
    })
    .from(loans)
    .innerJoin(copies, eq(copies.id, loans.copyId))
    .innerJoin(books, eq(books.id, copies.bookId))
    .innerJoin(students, eq(students.id, loans.studentId))
    .where(and(eq(loans.copyId, copy.id), isNull(loans.returnedAt)))
  if (!row) throw new BusinessError('Este exemplar não está emprestado.', 'RETURN_NOT_LOANED')
  return { ...row, daysLate: daysLate(row.dueDate, clock.today()) }
}

export interface ReturnResult {
  loanId: number
  copyCode: string
  bookTitle: string
  studentName: string
  returnedLate: boolean
  daysLate: number
  condition: ReturnCondition
}

/**
 * Registra a devolução (US05): dá baixa no empréstimo, marca atraso (CA3), registra perdido/danificado (CA4),
 * atualiza a situação do exemplar e grava no histórico quem fez (US03-CA3). Tudo na mesma transação.
 *
 * Integração pendente: quando o título tiver fila de reserva (US12, SEB-17), o exemplar devolvido em bom
 * estado deve ficar "separado" e o primeiro da fila ser avisado. Esse passo entra aqui na US12.
 */
export async function registerReturn(
  db: Db,
  clock: Clock,
  userId: number,
  input: { loanId: number; condition: ReturnCondition },
): Promise<ReturnResult> {
  return db.transaction(async (tx) => {
    const [loan] = await tx
      .select({
        id: loans.id,
        copyId: loans.copyId,
        dueDate: loans.dueDate,
        returnedAt: loans.returnedAt,
        copyCode: copies.code,
        bookTitle: books.title,
        studentName: students.name,
      })
      .from(loans)
      .innerJoin(copies, eq(copies.id, loans.copyId))
      .innerJoin(books, eq(books.id, copies.bookId))
      .innerJoin(students, eq(students.id, loans.studentId))
      .where(eq(loans.id, input.loanId))
      .for('update', { of: loans })
    if (!loan) throw new NotFoundError('Empréstimo')
    if (loan.returnedAt) throw new BusinessError('Este empréstimo já foi devolvido.', 'RETURN_ALREADY_DONE')

    const now = clock.now()
    const returnDate = toSchoolDate(now)
    const late = isLate(loan.dueDate, returnDate)
    await tx
      .update(loans)
      .set({ returnedAt: now, returnedBy: userId, returnCondition: input.condition, returnedLate: late })
      .where(eq(loans.id, loan.id))
    await tx
      .update(copies)
      .set({ status: copyStatusAfterReturn(input.condition) })
      .where(eq(copies.id, loan.copyId))
    const result: ReturnResult = {
      loanId: loan.id,
      copyCode: loan.copyCode,
      bookTitle: loan.bookTitle,
      studentName: loan.studentName,
      returnedLate: late,
      daysLate: daysLate(loan.dueDate, returnDate),
      condition: input.condition,
    }
    await audit.append(tx, {
      userId,
      action: 'emprestimo.devolver',
      entity: 'loan',
      entityId: loan.id,
      payload: { copyCode: loan.copyCode, condition: input.condition, late, daysLate: result.daysLate },
    })
    return result
  })
}
