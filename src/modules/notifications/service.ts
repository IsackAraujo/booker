import { and, asc, desc, eq, inArray, isNull, lt, max } from 'drizzle-orm'
import { books, copies, loans, notifications, students } from '@/db/schema'
import type { Db } from '@/db/types'
import type { Clock, IsoDate } from '@/lib/clock'
import { BusinessError } from '@/lib/errors'
import * as audit from '@/modules/audit/service'
import { daysLate } from '@/modules/loans/rules'
import { overdueNoticeText } from './rules'
import type { MessageSender } from './sender'

export interface OverdueLoan {
  loanId: number
  studentName: string
  className: string
  guardianPhone: string
  bookTitle: string
  copyCode: string
  dueDate: IsoDate
  daysLate: number
  /** Último aviso de cobrança enviado com sucesso. */
  lastNoticeAt: Date | null
}

/**
 * Empréstimos atrasados (US08): abertos e com prazo anterior a hoje. Devolvidos nunca aparecem (CA5).
 * Ordem: mais atrasados primeiro. Filtro opcional por turma (CA2).
 */
export async function listOverdue(
  db: Db,
  clock: Clock,
  filter: { className?: string } = {},
): Promise<OverdueLoan[]> {
  const today = clock.today()
  const lastNotice = db
    .select({ loanId: notifications.loanId, at: max(notifications.createdAt).as('at') })
    .from(notifications)
    .where(and(eq(notifications.kind, 'cobranca'), eq(notifications.status, 'enviado')))
    .groupBy(notifications.loanId)
    .as('last_notice')
  const rows = await db
    .select({
      loanId: loans.id,
      studentName: students.name,
      className: students.className,
      guardianPhone: students.guardianPhone,
      bookTitle: books.title,
      copyCode: copies.code,
      dueDate: loans.dueDate,
      lastNoticeAt: lastNotice.at,
    })
    .from(loans)
    .innerJoin(students, eq(students.id, loans.studentId))
    .innerJoin(copies, eq(copies.id, loans.copyId))
    .innerJoin(books, eq(books.id, copies.bookId))
    .leftJoin(lastNotice, eq(lastNotice.loanId, loans.id))
    .where(
      and(
        isNull(loans.returnedAt),
        lt(loans.dueDate, today),
        filter.className ? eq(students.className, filter.className.trim().toUpperCase()) : undefined,
      ),
    )
    .orderBy(asc(loans.dueDate), asc(students.className), asc(students.name))
  return rows.map((r) => ({
    ...r,
    daysLate: daysLate(r.dueDate, today),
    lastNoticeAt: r.lastNoticeAt ?? null,
  }))
}

/** Turmas que têm algum atraso, para o filtro da tela. */
export async function overdueClasses(db: Db, clock: Clock): Promise<string[]> {
  const rows = await db
    .selectDistinct({ className: students.className })
    .from(loans)
    .innerJoin(students, eq(students.id, loans.studentId))
    .where(and(isNull(loans.returnedAt), lt(loans.dueDate, clock.today())))
    .orderBy(asc(students.className))
  return rows.map((r) => r.className)
}

export interface NoticeResult {
  sent: number
  failed: { loanId: number; studentName: string; error: string }[]
  /** Empréstimos ignorados porque já foram devolvidos ou não estão mais atrasados. */
  skipped: number
}

/**
 * Envia aviso de atraso aos responsáveis (US08-CA3), para um aluno ou para vários. Cada tentativa fica
 * registrada em `notifications` com data e situação (CA4). Só envia para empréstimos que continuam atrasados.
 */
export async function sendOverdueNotices(
  db: Db,
  clock: Clock,
  sender: MessageSender,
  userId: number,
  loanIds: number[],
): Promise<NoticeResult> {
  const ids = [...new Set(loanIds)].filter((id) => Number.isInteger(id) && id > 0)
  if (ids.length === 0) throw new BusinessError('Selecione ao menos um empréstimo atrasado.', 'NOTICE_EMPTY')

  const overdue = (await listOverdue(db, clock)).filter((o) => ids.includes(o.loanId))
  const result: NoticeResult = { sent: 0, failed: [], skipped: ids.length - overdue.length }

  for (const loan of overdue) {
    const body = overdueNoticeText(loan)
    const sendResult = await sender.send(loan.guardianPhone, body)
    await db.insert(notifications).values({
      kind: 'cobranca',
      loanId: loan.loanId,
      phone: loan.guardianPhone,
      body,
      status: sendResult.ok ? 'enviado' : 'falhou',
      error: sendResult.ok ? null : sendResult.error,
      createdBy: userId,
      createdAt: clock.now(),
    })
    if (sendResult.ok) result.sent++
    else result.failed.push({ loanId: loan.loanId, studentName: loan.studentName, error: sendResult.error })
  }

  await audit.append(db, {
    userId,
    action: 'cobranca.enviar',
    entity: 'loan',
    payload: { loanIds: overdue.map((o) => o.loanId), sent: result.sent, failed: result.failed.length },
  })
  return result
}

/** Histórico de avisos de um empréstimo, mais recentes primeiro. */
export async function noticesForLoan(db: Db, loanId: number) {
  return db
    .select()
    .from(notifications)
    .where(and(eq(notifications.loanId, loanId), inArray(notifications.kind, ['cobranca'])))
    .orderBy(desc(notifications.createdAt), desc(notifications.id))
}
