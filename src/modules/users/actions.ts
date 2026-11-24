'use server'

import { revalidatePath } from 'next/cache'
import { redirect } from 'next/navigation'
import { runAction, type ActionState } from '@/lib/action'
import { createSessionCookie, deleteSessionCookie } from '@/lib/auth/cookie'
import { getDeps } from '@/lib/deps'
import { BusinessError } from '@/lib/errors'
import { requireRole } from '@/lib/session'
import * as service from './service'

/** Destino depois do login: só caminhos internos, para o link de login não servir de redirecionamento aberto. */
function safeNext(value: FormDataEntryValue | null): string {
  const next = String(value ?? '')
  return next.startsWith('/') && !next.startsWith('//') && !next.startsWith('/login') ? next : '/'
}

/** T3.1: entrada com e-mail e senha. */
export async function loginAction(_prev: ActionState<null>, form: FormData): Promise<ActionState<null>> {
  const result = await runAction(async () => {
    const { db, clock } = await getDeps()
    const user = await service.authenticate(
      db,
      clock,
      String(form.get('email') ?? ''),
      String(form.get('password') ?? ''),
    )
    if (!user) throw new BusinessError(service.LOGIN_FAILED, 'LOGIN_FAILED')
    await createSessionCookie({ userId: user.id, role: user.role, name: user.name }, clock.now())
    await service.recordLogin(db, user.id)
    return null
  })
  if (result.status === 'ok') redirect(safeNext(form.get('next')))
  return result
}

export async function logoutAction() {
  await deleteSessionCookie()
  redirect('/login')
}

export async function createUserAction(_prev: ActionState<null>, form: FormData): Promise<ActionState<null>> {
  return runAction(async () => {
    const actor = await requireRole('bibliotecaria')
    const { db } = await getDeps()
    await service.createUser(db, actor.id, {
      name: String(form.get('name') ?? ''),
      email: String(form.get('email') ?? ''),
      role: String(form.get('role') ?? ''),
      password: String(form.get('password') ?? ''),
    })
    revalidatePath('/usuarios')
    return null
  }, 'Usuário cadastrado. Passe o e-mail e a senha inicial para a pessoa.')
}

export async function setUserActiveAction(
  _prev: ActionState<null>,
  form: FormData,
): Promise<ActionState<null>> {
  return runAction(async () => {
    const actor = await requireRole('bibliotecaria')
    const { db } = await getDeps()
    await service.setUserActive(db, actor.id, Number(form.get('userId')), form.get('active') === 'true')
    revalidatePath('/usuarios')
    return null
  })
}

export async function resetPasswordAction(
  _prev: ActionState<null>,
  form: FormData,
): Promise<ActionState<null>> {
  return runAction(async () => {
    const actor = await requireRole('bibliotecaria')
    const { db } = await getDeps()
    await service.resetPassword(db, actor.id, Number(form.get('userId')), String(form.get('password') ?? ''))
    return null
  }, 'Senha redefinida.')
}
