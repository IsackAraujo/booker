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

// ---------------------------------------------------------------------------------------------------------
// US04 Registrar empréstimo
// ---------------------------------------------------------------------------------------------------------

/** T4.1: busca do aluno no balcão. */
export async function searchBorrowersAction(
  _prev: ActionState<service.Borrower[]>,
  form: FormData,
): Promise<ActionState<service.Borrower[]>> {
  return runAction(async () => {
    await requireRole('bibliotecaria')
    const { db, clock } = await getDeps()
    return service.searchBorrowers(db, clock, String(form.get('q') ?? ''))
  })
}

/** T4.1: busca do exemplar no balcão (código ou título). */
export async function searchCopiesAction(
  _prev: ActionState<service.LoanableCopy[]>,
  form: FormData,
): Promise<ActionState<service.LoanableCopy[]>> {
  return runAction(async () => {
    await requireRole('bibliotecaria')
    const { db } = await getDeps()
    return service.searchLoanableCopies(db, String(form.get('q') ?? ''))
  })
}

const loanInput = z.object({
  studentId: z.coerce.number().int().positive().nullable().catch(null),
  copyId: z.coerce.number().int().positive().nullable().catch(null),
})

function readLoanInput(form: FormData) {
  return loanInput.parse({ studentId: form.get('studentId') || null, copyId: form.get('copyId') || null })
}

/** T4.2: conferência com a data de devolução calculada e os avisos, antes de confirmar. */
export async function previewLoanAction(
  _prev: ActionState<service.LoanPreview>,
  form: FormData,
): Promise<ActionState<service.LoanPreview>> {
  return runAction(async () => {
    await requireRole('bibliotecaria')
    const { db, clock } = await getDeps()
    return service.previewLoan(db, clock, readLoanInput(form))
  })
}

export async function registerLoanAction(
  _prev: ActionState<service.LoanResult>,
  form: FormData,
): Promise<ActionState<service.LoanResult>> {
  return runAction(async () => {
    const user = await requireRole('bibliotecaria')
    const { db, clock } = await getDeps()
    const result = await service.registerLoan(db, clock, user.id, readLoanInput(form))
    revalidatePath('/balcao/emprestimo')
    return result
  }, 'Empréstimo registrado.')
}
