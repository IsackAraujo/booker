'use server'

import { revalidatePath } from 'next/cache'
import { z } from 'zod'
import { runAction, type ActionState } from '@/lib/action'
import { getDeps } from '@/lib/deps'
import { BusinessError } from '@/lib/errors'
import { requireRole } from '@/lib/session'
import * as service from './service'

export async function findLoanForReturnAction(
  _prev: ActionState<service.OpenLoanDetails>,
  form: FormData,
): Promise<ActionState<service.OpenLoanDetails>> {
  return runAction(async () => {
    await requireRole('bibliotecaria')
    const { db, clock } = await getDeps()
    return service.findOpenLoanByCopyCode(db, clock, String(form.get('code') ?? ''))
  })
}

const returnInput = z.object({
  loanId: z.coerce.number().int().positive(),
  condition: z.enum(['ok', 'perdido', 'danificado']),
})

export async function registerReturnAction(
  _prev: ActionState<service.ReturnResult>,
  form: FormData,
): Promise<ActionState<service.ReturnResult>> {
  return runAction(async () => {
    const user = await requireRole('bibliotecaria')
    const parsed = returnInput.safeParse({
      loanId: form.get('loanId'),
      condition: form.get('condition') ?? 'ok',
    })
    if (!parsed.success)
      throw new BusinessError('Identifique o exemplar antes de confirmar.', 'RETURN_NO_COPY')
    const { db, clock } = await getDeps()
    const result = await service.registerReturn(db, clock, user.id, parsed.data)
    revalidatePath('/balcao/devolucao')
    return result
  }, 'Devolução registrada.')
}
