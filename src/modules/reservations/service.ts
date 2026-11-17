import { and, asc, count, eq, gte, inArray, isNull, lt, or, sum } from 'drizzle-orm'
import { books, classReservations, copies, loans, users } from '@/db/schema'
import type { Db } from '@/db/types'
import type { Clock, IsoDate } from '@/lib/clock'
import { BusinessError, ForbiddenError, NotFoundError } from '@/lib/errors'
import * as audit from '@/modules/audit/service'
import { availableOn, canCancel, validateReservation, type ClassReservationInput } from './rules'

export type ClassReservation = typeof classReservations.$inferSelect

/**
 * Exemplares que contam para reserva de turma: disponíveis ou emprestados (podem voltar até a data).
 * Perdidos e danificados não contam; "separado" é da fila de reserva do aluno (US12) e também não.
 */
const USABLE: ('disponivel' | 'emprestado')[] = ['disponivel', 'emprestado']

/**
 * Quantos exemplares do livro podem ser reservados na data (US10-CA2).
 */
export async function availableForDate(
  db: Db,
  clock: Clock,
  bookId: number,
  activityDate: IsoDate,
): Promise<number> {
  const today = clock.today()
  const [usable] = await db
    .select({ n: count() })
    .from(copies)
    .where(and(eq(copies.bookId, bookId), inArray(copies.status, USABLE)))
  const [out] = await db
    .select({ n: count() })
    .from(loans)
    .innerJoin(copies, eq(copies.id, loans.copyId))
    .where(
      and(
        eq(copies.bookId, bookId),
        isNull(loans.returnedAt),
        // Mesmo critério de rules.loanStillOutOn: vence na data ou depois, ou já está atrasado.
        or(gte(loans.dueDate, activityDate), lt(loans.dueDate, today)),
      ),
    )
  const [reserved] = await db
    .select({ n: sum(classReservations.quantity).mapWith(Number) })
    .from(classReservations)
    .where(
      and(
        eq(classReservations.bookId, bookId),
        eq(classReservations.activityDate, activityDate),
        eq(classReservations.status, 'ativa'),
      ),
    )
  return availableOn({
    usableCopies: usable?.n ?? 0,
    outOnDate: out?.n ?? 0,
    reservedOnDate: reserved?.n ?? 0,
  })
}

/** Cria a reserva da professora (US10-CA1, CA2). Trava o livro para duas reservas simultâneas não passarem do total. */
export async function createReservation(
  db: Db,
  clock: Clock,
  teacherId: number,
  input: ClassReservationInput,
): Promise<ClassReservation> {
  const errors = validateReservation(input, clock.today())
  if (errors.length) throw new BusinessError(errors.join('; '), 'RESERVATION_INVALID')
  const bookId = input.bookId!
  const quantity = input.quantity!
  const activityDate = input.activityDate!

  return db.transaction(async (tx) => {
    const [book] = await tx.select().from(books).where(eq(books.id, bookId)).for('update')
    if (!book || !book.active) throw new NotFoundError('Livro')
    const available = await availableForDate(tx, clock, bookId, activityDate)
    if (quantity > available) {
      throw new BusinessError(
        available === 0
          ? 'Não há exemplares disponíveis deste livro na data escolhida.'
          : `Só ${available} ${available === 1 ? 'exemplar está disponível' : 'exemplares estão disponíveis'} na data escolhida.`,
        'RESERVATION_UNAVAILABLE',
      )
    }
    const [row] = await tx
      .insert(classReservations)
      .values({
        teacherId,
        bookId,
        className: input.className.trim().toUpperCase(),
        quantity,
        activityDate,
        createdAt: clock.now(),
      })
      .returning()
    await audit.append(tx, {
      userId: teacherId,
      action: 'reserva_turma.criar',
      entity: 'class_reservation',
      entityId: row!.id,
      payload: { bookId, quantity, activityDate, className: row!.className },
    })
    return row!
  })
}

/** Cancelamento pela própria professora, antes da data da atividade (US10-CA4). */
export async function cancelReservation(db: Db, clock: Clock, teacherId: number, id: number): Promise<void> {
  await db.transaction(async (tx) => {
    const [r] = await tx.select().from(classReservations).where(eq(classReservations.id, id)).for('update')
    if (!r) throw new NotFoundError('Reserva')
    if (r.teacherId !== teacherId) throw new ForbiddenError()
    if (r.status !== 'ativa')
      throw new BusinessError('Esta reserva já foi cancelada.', 'RESERVATION_NOT_ACTIVE')
    if (!canCancel(r.activityDate, clock.today())) {
      throw new BusinessError(
        'A reserva só pode ser cancelada antes da data da atividade.',
        'RESERVATION_TOO_LATE',
      )
    }
    await tx
      .update(classReservations)
      .set({ status: 'cancelada', cancelledAt: clock.now() })
      .where(eq(classReservations.id, id))
    await audit.append(tx, {
      userId: teacherId,
      action: 'reserva_turma.cancelar',
      entity: 'class_reservation',
      entityId: id,
    })
  })
}

const reservationColumns = {
  id: classReservations.id,
  bookTitle: books.title,
  className: classReservations.className,
  quantity: classReservations.quantity,
  activityDate: classReservations.activityDate,
  status: classReservations.status,
  teacherName: users.name,
}

/** Reservas da professora, de hoje em diante, ordenadas pela data. */
export async function listTeacherReservations(db: Db, clock: Clock, teacherId: number) {
  return db
    .select(reservationColumns)
    .from(classReservations)
    .innerJoin(books, eq(books.id, classReservations.bookId))
    .innerJoin(users, eq(users.id, classReservations.teacherId))
    .where(
      and(eq(classReservations.teacherId, teacherId), gte(classReservations.activityDate, clock.today())),
    )
    .orderBy(asc(classReservations.activityDate), asc(classReservations.id))
}

/** US10-CA3: reservas ativas do dia, para a bibliotecária separar os exemplares. */
export async function listReservationsForDay(db: Db, date: IsoDate) {
  return db
    .select(reservationColumns)
    .from(classReservations)
    .innerJoin(books, eq(books.id, classReservations.bookId))
    .innerJoin(users, eq(users.id, classReservations.teacherId))
    .where(and(eq(classReservations.activityDate, date), eq(classReservations.status, 'ativa')))
    .orderBy(asc(classReservations.className), asc(books.title))
}

/** Livros ativos para o formulário de reserva. */
export async function listBooksForReservation(db: Db) {
  return db
    .select({ id: books.id, title: books.title, author: books.author })
    .from(books)
    .where(eq(books.active, true))
    .orderBy(asc(books.title))
}
