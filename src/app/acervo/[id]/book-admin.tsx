'use client'

import { useActionState } from 'react'
import { FormMessage } from '@/components/form-message'
import { keepValues } from '@/components/keep-values'
import { idle } from '@/lib/action'
import {
  addCopiesAction,
  reactivateBookAction,
  removeBookAction,
  setCopyStatusAction,
} from '@/modules/catalog/actions'
import { COPY_STATUS_LABEL, MANUAL_COPY_STATUSES, type CopyStatus } from '@/modules/catalog/rules'

/** Cadastro de exemplares (T1.3): um código por linha; leitor de código de barras funciona direto no campo. */
export function AddCopiesForm({ bookId }: { bookId: number }) {
  const [state, action, pending] = useActionState(addCopiesAction, idle)

  return (
    <form action={action} className="card space-y-3">
      <input type="hidden" name="bookId" value={bookId} />
      <label className="block text-sm">
        <span className="mb-1 block font-medium">Novos exemplares (um código por linha)</span>
        <textarea name="codes" rows={3} className="input font-mono" required />
      </label>
      <FormMessage state={state} />
      {state.status === 'ok' && (
        <p role="status" className="rounded-md bg-emerald-50 px-3 py-2 text-sm text-emerald-800">
          {state.data.length === 1 ? '1 exemplar cadastrado' : `${state.data.length} exemplares cadastrados`},
          disponíveis para empréstimo.
        </p>
      )}
      <button className="btn-secondary" disabled={pending}>
        {pending ? 'Cadastrando…' : 'Cadastrar exemplares'}
      </button>
    </form>
  )
}

export function CopyStatusForm({
  copyId,
  code,
  status,
}: {
  copyId: number
  code: string
  status: CopyStatus
}) {
  const [state, action, pending] = useActionState(setCopyStatusAction, idle)
  const locked = status === 'emprestado' || status === 'separado'

  if (locked) return <span className="text-sm text-slate-600">{COPY_STATUS_LABEL[status]}</span>

  return (
    <form onSubmit={keepValues(action)} className="flex items-center gap-2">
      <input type="hidden" name="copyId" value={copyId} />
      <select
        name="status"
        defaultValue={status}
        className="input w-auto py-1"
        aria-label={`Situação do exemplar ${code}`}
      >
        {MANUAL_COPY_STATUSES.map((s) => (
          <option key={s} value={s}>
            {COPY_STATUS_LABEL[s]}
          </option>
        ))}
      </select>
      <button
        className="btn-secondary px-2 py-1"
        disabled={pending}
        aria-label={`Salvar situação de ${code}`}
      >
        Salvar
      </button>
      {state.status === 'error' && (
        <span role="alert" className="text-sm text-red-700">
          {state.message}
        </span>
      )}
    </form>
  )
}

/** Excluir ou inativar (US01-CA4). O servidor decide: livro com histórico é sempre inativado. */
export function RemoveBook({
  bookId,
  active,
  hasLoanHistory,
}: {
  bookId: number
  active: boolean
  hasLoanHistory: boolean
}) {
  const [removed, remove, removing] = useActionState(removeBookAction, idle)
  const [reactivated, reactivate, reactivating] = useActionState(reactivateBookAction, idle)
  if (!active)
    return (
      <form action={reactivate} className="card space-y-2">
        <input type="hidden" name="bookId" value={bookId} />
        <p className="text-sm text-slate-700">
          Livro inativo: não aparece no acervo nem no balcão, mas o histórico de empréstimos continua.
        </p>
        <FormMessage state={reactivated} />
        <button className="btn-secondary" disabled={reactivating}>
          Reativar livro
        </button>
      </form>
    )

  return (
    <form
      action={remove}
      onSubmit={(e) => {
        const text = hasLoanHistory
          ? 'Este livro já teve empréstimos e será inativado (o histórico é mantido). Continuar?'
          : 'Excluir este livro e todos os exemplares?'
        if (!window.confirm(text)) e.preventDefault()
      }}
      className="card space-y-2"
    >
      <input type="hidden" name="bookId" value={bookId} />
      <p className="text-sm text-slate-700">
        {hasLoanHistory
          ? 'Este livro já teve empréstimos: ele não pode ser excluído, só inativado.'
          : 'Este livro nunca foi emprestado e pode ser excluído.'}
      </p>
      <FormMessage state={removed} />
      <button className="btn-secondary text-red-700" disabled={removing}>
        {hasLoanHistory ? 'Inativar livro' : 'Excluir livro'}
      </button>
    </form>
  )
}
