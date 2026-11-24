'use client'

import { useActionState } from 'react'
import { FormMessage } from '@/components/form-message'
import { keepValues } from '@/components/keep-values'
import { idle } from '@/lib/action'
import { loginAction } from '@/modules/users/actions'

export function LoginForm({ next }: { next: string }) {
  const [state, action, pending] = useActionState(loginAction, idle)
  return (
    <form onSubmit={keepValues(action)} className="card space-y-3">
      <input type="hidden" name="next" value={next} />
      <label className="block text-sm">
        <span className="mb-1 block font-medium">E-mail</span>
        <input name="email" type="email" autoComplete="username" className="input" required autoFocus />
      </label>
      <label className="block text-sm">
        <span className="mb-1 block font-medium">Senha</span>
        <input name="password" type="password" autoComplete="current-password" className="input" required />
      </label>
      <FormMessage state={state} />
      <button className="btn w-full" disabled={pending}>
        {pending ? 'Entrando…' : 'Entrar'}
      </button>
    </form>
  )
}
