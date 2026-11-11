'use client'

import { startTransition, type FormEvent } from 'react'

/**
 * Envia o formulário para a Server Action sem o reset automático do React 19 (que apagaria o que a pessoa
 * digitou quando a operação falha). Use em `onSubmit` no lugar de `action`.
 */
export function keepValues(dispatch: (form: FormData) => void) {
  return (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    const submitter = (event.nativeEvent as SubmitEvent).submitter
    const form = new FormData(event.currentTarget, submitter)
    startTransition(() => dispatch(form))
  }
}
