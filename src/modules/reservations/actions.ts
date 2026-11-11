'use server'

import { revalidatePath } from 'next/cache'
import { runAction, type ActionState } from '@/lib/action'
import { getDeps } from '@/lib/deps'
import { requireRole } from '@/lib/session'
import * as service from './service'

function numberOrNull(value: FormDataEntryValue | null): number | null {
  if (value === null || String(value).trim() === '') return null
  const n = Number(value)
  return Number.isFinite(n) ? n : null
}

export async function createReservationAction(
  _prev: ActionState<service.ClassReservation>,
  form: FormData,
): Promise<ActionState<service.ClassReservation>> {
  return runAction(async () => {
    const user = await requireRole('professor')
    const { db, clock } = await getDeps()
    const created = await service.createReservation(db, clock, user.id, {
      bookId: numberOrNull(form.get('bookId')),
      className: String(form.get('className') ?? ''),
      quantity: numberOrNull(form.get('quantity')),
      activityDate: String(form.get('activityDate') ?? '') || null,
    })
    revalidatePath('/reservas/turma')
    return created
  }, 'Reserva registrada.')
}

export async function cancelReservationAction(
  _prev: ActionState<null>,
  form: FormData,
): Promise<ActionState<null>> {
  return runAction(async () => {
    const user = await requireRole('professor')
    const { db, clock } = await getDeps()
    await service.cancelReservation(db, clock, user.id, Number(form.get('id')))
    revalidatePath('/reservas/turma')
    return null
  }, 'Reserva cancelada.')
}

/** Consulta de disponibilidade para o formulário, antes de reservar. */
export async function availabilityAction(bookId: number, activityDate: string): Promise<number | null> {
  await requireRole('professor')
  if (!bookId || !/^\d{4}-\d{2}-\d{2}$/.test(activityDate)) return null
  const { db, clock } = await getDeps()
  return service.availableForDate(db, clock, bookId, activityDate)
}
