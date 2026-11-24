'use client'

import { useActionState } from 'react'
import { FormMessage } from '@/components/form-message'
import { keepValues } from '@/components/keep-values'
import { idle } from '@/lib/action'
import { createUserAction, resetPasswordAction, setUserActiveAction } from '@/modules/users/actions'
import { MIN_PASSWORD, ROLE_LABEL } from '@/modules/users/rules'

export function NewUserForm() {
  const [state, action, pending] = useActionState(createUserAction, idle)
  return (
    <form onSubmit={keepValues(action)} className="card max-w-lg space-y-3">
      <label className="block text-sm">
        <span className="mb-1 block font-medium">Nome</span>
        <input name="name" className="input" required />
      </label>
      <label className="block text-sm">
        <span className="mb-1 block font-medium">E-mail</span>
        <input name="email" type="email" className="input" required />
      </label>
      <label className="block text-sm">
        <span className="mb-1 block font-medium">Perfil</span>
        <select name="role" className="input" required defaultValue="">
          <option value="" disabled>
            Escolha…
          </option>
          {Object.entries(ROLE_LABEL).map(([value, label]) => (
            <option key={value} value={value}>
              {label}
            </option>
          ))}
        </select>
      </label>
      <label className="block text-sm">
        <span className="mb-1 block font-medium">Senha inicial (mínimo {MIN_PASSWORD} caracteres)</span>
        <input name="password" type="password" autoComplete="new-password" className="input" required />
      </label>
      <FormMessage state={state} />
      <button className="btn" disabled={pending}>
        Cadastrar
      </button>
    </form>
  )
}

export function ToggleActive({ userId, name, active }: { userId: number; name: string; active: boolean }) {
  const [state, action, pending] = useActionState(setUserActiveAction, idle)
  return (
    <form action={action}>
      <input type="hidden" name="userId" value={userId} />
      <input type="hidden" name="active" value={String(!active)} />
      <button
        className="btn-secondary py-1"
        disabled={pending}
        aria-label={`${active ? 'Desativar' : 'Reativar'} ${name}`}
      >
        {active ? 'Desativar' : 'Reativar'}
      </button>
      {state.status === 'error' && (
        <p role="alert" className="text-xs text-red-700">
          {state.message}
        </p>
      )}
    </form>
  )
}

export function ResetPassword({ userId, name }: { userId: number; name: string }) {
  const [state, action, pending] = useActionState(resetPasswordAction, idle)
  return (
    <form onSubmit={keepValues(action)} className="flex flex-wrap justify-end gap-1">
      <input type="hidden" name="userId" value={userId} />
      <input
        name="password"
        type="password"
        autoComplete="new-password"
        placeholder="Nova senha"
        aria-label={`Nova senha de ${name}`}
        className="input w-36 py-1"
        required
      />
      <button className="btn-secondary py-1" disabled={pending} aria-label={`Redefinir senha de ${name}`}>
        Redefinir
      </button>
      {state.status !== 'idle' && (
        <p className="w-full text-xs">
          <FormMessage state={state} />
        </p>
      )}
    </form>
  )
}
