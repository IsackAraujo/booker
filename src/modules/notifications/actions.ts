'use server'

import { revalidatePath } from 'next/cache'
import { runAction, type ActionState } from '@/lib/action'
import { getDeps } from '@/lib/deps'
import { requireRole } from '@/lib/session'
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
