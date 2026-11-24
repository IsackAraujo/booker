'use server'

import { revalidatePath } from 'next/cache'
import { runAction, type ActionState } from '@/lib/action'
import { getDeps } from '@/lib/deps'
import { requireRole } from '@/lib/session'
import * as audit from '@/modules/audit/service'
import { unlinkTelegram } from './telegram'

/** Remove o vínculo do Telegram do aluno e gera um link novo (o antigo deixa de valer). */
export async function unlinkTelegramAction(
  _prev: ActionState<null>,
  form: FormData,
): Promise<ActionState<null>> {
  return runAction(async () => {
    const user = await requireRole('bibliotecaria')
    const studentId = Number(form.get('studentId'))
    const { db, clock } = await getDeps()
    await db.transaction(async (tx) => {
      await unlinkTelegram(tx, clock, studentId)
      await audit.append(tx, {
        userId: user.id,
        action: 'aluno.telegram.desvincular',
        entity: 'student',
        entityId: studentId,
      })
    })
    revalidatePath(`/alunos/${studentId}`)
    return null
  }, 'Vínculo removido. Envie o novo link ao responsável.')
}
