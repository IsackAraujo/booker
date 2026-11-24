import { and, asc, desc, eq, gte, inArray, isNull, lte, notExists, sql } from 'drizzle-orm'
import { books, copies, loans, notifications, students } from '@/db/schema'
import type { Db } from '@/db/types'
import type { Clock } from '@/lib/clock'
import { BusinessError, NotFoundError } from '@/lib/errors'
import { getSettings } from '@/lib/settings'
import { reminderText, reminderWindow } from './rules'
import type { MessageSender } from './sender'
import { deliver, sendOverdueNotices } from './service'

// US07: lembrete pelo Telegram antes do prazo (T7.2 rotina diária, T7.3 mensagem, registro e falhas).

export interface ReminderRunResult {
  sent: number
  failed: { loanId: number; studentName: string; error: string }[]
  /** Já tinham lembrete enviado (outra execução no mesmo dia, por exemplo). */
  skipped: number
}

/** Empréstimos abertos com prazo na janela de lembrete e sem lembrete enviado com sucesso. */
async function loansToRemind(db: Db, clock: Clock) {
  const settings = await getSettings(db)
  const { from, to } = reminderWindow(clock.today(), settings.reminderDaysBefore)
  return db
    .select({
      loanId: loans.id,
      dueDate: loans.dueDate,
      studentName: students.name,
      chatId: students.telegramChatId,
      bookTitle: books.title,
    })
    .from(loans)
    .innerJoin(students, eq(students.id, loans.studentId))
    .innerJoin(copies, eq(copies.id, loans.copyId))
    .innerJoin(books, eq(books.id, copies.bookId))
    .where(
      and(
        isNull(loans.returnedAt), // US07-CA3: nada para empréstimo devolvido
        gte(loans.dueDate, from),
        lte(loans.dueDate, to),
        notExists(
          db
            .select({ one: sql`1` })
            .from(notifications)
            .where(
              and(
                eq(notifications.loanId, loans.id),
                eq(notifications.kind, 'lembrete'),
                eq(notifications.status, 'enviado'),
              ),
            ),
        ),
      ),
    )
    .orderBy(asc(loans.dueDate), asc(loans.id))
}

function isUniqueViolation(err: unknown) {
  const e = err as { code?: string; cause?: { code?: string } }
  return (e?.cause ?? e)?.code === '23505'
}

/**
 * T7.2: rotina diária. Envia o lembrete uma única vez por empréstimo (CA1), com aluno, título e prazo (CA2), nunca
 * para devolvidos (CA3), e registra cada tentativa; as falhas aparecem para a bibliotecária (CA4) e são tentadas de
 * novo na próxima execução. Pode rodar mais de uma vez por dia sem duplicar: o índice único do banco segura
 * duas execuções simultâneas.
 */
export async function sendDueReminders(
  db: Db,
  clock: Clock,
  sender: MessageSender,
): Promise<ReminderRunResult> {
  const result: ReminderRunResult = { sent: 0, failed: [], skipped: 0 }
  for (const loan of await loansToRemind(db, clock)) {
    try {
      const r = await deliver(db, clock, sender, {
        kind: 'lembrete',
        loanId: loan.loanId,
        chatId: loan.chatId,
        body: reminderText(loan),
      })
      if (r.ok) result.sent++
      else result.failed.push({ loanId: loan.loanId, studentName: loan.studentName, error: r.error })
    } catch (err) {
      if (!isUniqueViolation(err)) throw err
      result.skipped++
    }
  }
  return result
}

export interface FailedNotice {
  notificationId: number
  kind: 'lembrete' | 'cobranca' | 'reserva_disponivel'
  loanId: number | null
  studentId: number | null
  studentName: string | null
  className: string | null
  bookTitle: string | null
  error: string | null
  createdAt: Date
}

/**
 * US07-CA4: tentativas que falharam e ainda não foram resolvidas (sem envio com sucesso registrado depois, para o mesmo
 * empréstimo e tipo), dos últimos `days` dias. Empréstimos já devolvidos saem da lista.
 */
export async function listUnresolvedFailures(db: Db, clock: Clock, days = 30): Promise<FailedNotice[]> {
  const since = new Date(clock.now().getTime() - days * 24 * 60 * 60 * 1000)
  const rows = await db
    .select({
      notificationId: notifications.id,
      kind: notifications.kind,
      loanId: notifications.loanId,
      studentId: students.id,
      studentName: students.name,
      className: students.className,
      bookTitle: books.title,
      error: notifications.error,
      createdAt: notifications.createdAt,
    })
    .from(notifications)
    .leftJoin(loans, eq(loans.id, notifications.loanId))
    .leftJoin(students, eq(students.id, loans.studentId))
    .leftJoin(copies, eq(copies.id, loans.copyId))
    .leftJoin(books, eq(books.id, copies.bookId))
    .where(
      and(
        eq(notifications.status, 'falhou'),
        gte(notifications.createdAt, since),
        isNull(loans.returnedAt),
        inArray(notifications.kind, ['lembrete', 'cobranca']),
        notExists(
          db
            .select({ one: sql`1` })
            .from(sql`notifications later`)
            .where(
              sql`later.loan_id = ${notifications.loanId} and later.kind = ${notifications.kind} and later.status = 'enviado' and later.id > ${notifications.id}`,
            ),
        ),
      ),
    )
    .orderBy(desc(notifications.createdAt), desc(notifications.id))
  // Uma linha por empréstimo e tipo: a falha mais recente.
  const seen = new Set<string>()
  return rows.filter((r) => {
    const key = `${r.kind}:${r.loanId}`
    if (seen.has(key)) return false
    seen.add(key)
    return true
  })
}

/** Tenta de novo um envio que falhou (US07-CA4). Lembrete só para empréstimo aberto; cobrança só se ainda atrasado. */
export async function retryNotice(
  db: Db,
  clock: Clock,
  sender: MessageSender,
  userId: number,
  notificationId: number,
): Promise<{ ok: boolean; error?: string }> {
  const [n] = await db.select().from(notifications).where(eq(notifications.id, notificationId))
  if (!n || !n.loanId) throw new NotFoundError('Aviso')
  if (n.kind === 'cobranca') {
    const r = await sendOverdueNotices(db, clock, sender, userId, [n.loanId])
    if (r.skipped) throw new BusinessError('Este empréstimo não está mais atrasado.', 'RETRY_NOT_NEEDED')
    return r.sent ? { ok: true } : { ok: false, error: r.failed[0]?.error }
  }
  const [loan] = await db
    .select({
      returnedAt: loans.returnedAt,
      dueDate: loans.dueDate,
      studentName: students.name,
      chatId: students.telegramChatId,
      bookTitle: books.title,
    })
    .from(loans)
    .innerJoin(students, eq(students.id, loans.studentId))
    .innerJoin(copies, eq(copies.id, loans.copyId))
    .innerJoin(books, eq(books.id, copies.bookId))
    .where(eq(loans.id, n.loanId))
  if (!loan || loan.returnedAt) throw new BusinessError('Este livro já foi devolvido.', 'RETRY_NOT_NEEDED')
  const [already] = await db
    .select({ id: notifications.id })
    .from(notifications)
    .where(
      and(
        eq(notifications.loanId, n.loanId),
        eq(notifications.kind, 'lembrete'),
        eq(notifications.status, 'enviado'),
      ),
    )
  if (already) throw new BusinessError('O lembrete deste empréstimo já foi enviado.', 'RETRY_NOT_NEEDED')
  const r = await deliver(db, clock, sender, {
    kind: 'lembrete',
    loanId: n.loanId,
    chatId: loan.chatId,
    body: reminderText(loan),
    userId,
  })
  return r.ok ? { ok: true } : { ok: false, error: r.error }
}
