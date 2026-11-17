'use client'

import { useRouter } from 'next/navigation'
import { useActionState, useEffect } from 'react'
import { FormMessage } from '@/components/form-message'
import { keepValues } from '@/components/keep-values'
import { idle } from '@/lib/action'
import { saveBookAction } from '@/modules/catalog/actions'

interface Props {
  book?: { id: number; title: string; author: string; category: string; ageRange: string }
}

export function BookForm({ book }: Props) {
  const [state, action, pending] = useActionState(saveBookAction, idle)
  const router = useRouter()

  // Livro novo: segue para a página dele, onde se cadastram os exemplares.
  useEffect(() => {
    if (!book && state.status === 'ok') router.push(`/acervo/${state.data.id}`)
  }, [book, state, router])

  return (
    <form onSubmit={keepValues(action)} className="card max-w-lg space-y-3">
      {book && <input type="hidden" name="id" value={book.id} />}
      <Field label="Título" name="title" defaultValue={book?.title} />
      <Field label="Autor" name="author" defaultValue={book?.author} />
      <Field
        label="Categoria"
        name="category"
        defaultValue={book?.category}
        placeholder="Literatura, Ciências…"
      />
      <Field label="Faixa etária" name="ageRange" defaultValue={book?.ageRange} placeholder="8-10" />
      <FormMessage state={state} />
      <button className="btn" disabled={pending}>
        {pending ? 'Salvando…' : 'Salvar livro'}
      </button>
    </form>
  )
}

function Field({
  label,
  name,
  defaultValue,
  placeholder,
}: {
  label: string
  name: string
  defaultValue?: string
  placeholder?: string
}) {
  return (
    <label className="block text-sm">
      <span className="mb-1 block font-medium">{label}</span>
      <input name={name} defaultValue={defaultValue} placeholder={placeholder} className="input" required />
    </label>
  )
}
