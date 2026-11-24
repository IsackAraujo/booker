'use server'

import { revalidatePath } from 'next/cache'
import { runAction, type ActionState } from '@/lib/action'
import { getDeps } from '@/lib/deps'
import { BusinessError } from '@/lib/errors'
import { requireRole } from '@/lib/session'
import { retryNotice } from './reminders'
import * as service from './service'

/**
 * Envia aviso aos responsáveis dos empréstimos marcados (US08-CA3). O formulário manda um ou vários `loanId`:
 * o botão de cada linha envia um; "Avisar todos da lista" envia todos os exibidos (respeitando o filtro de turma).
 */
export async function sendOverdueNoticesAction(
  _prev: ActionState<service.NoticeResult>,
  form: FormData,
): Promise<ActionState<service.NoticeResult>> {
  return runAction(async () => {
    const user = await requireRole('bibliotecaria')
    const { db, clock, sender } = await getDeps()
    const ids = form.getAll('loanId').map((v) => Number(v))
    const result = await service.sendOverdueNotices(db, clock, sender, user.id, ids)
    revalidatePath('/atrasos')
    return result
  })
}

/** US07-CA4: tenta de novo um aviso que falhou, a partir da tela de avisos. */
export async function retryNoticeAction(
  _prev: ActionState<null>,
  form: FormData,
): Promise<ActionState<null>> {
  return runAction(async () => {
    const user = await requireRole('bibliotecaria')
    const { db, clock, sender } = await getDeps()
    const r = await retryNotice(db, clock, sender, user.id, Number(form.get('notificationId')))
    if (!r.ok) throw new BusinessError(`Não enviado de novo: ${r.error}`, 'RETRY_FAILED')
    revalidatePath('/avisos')
    return null
  }, 'Aviso enviado.')
}
