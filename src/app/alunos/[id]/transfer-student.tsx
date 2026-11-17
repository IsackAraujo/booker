'use client'

import { useActionState } from 'react'
import { FormMessage } from '@/components/form-message'
import { idle } from '@/lib/action'
import { markTransferredAction } from '@/modules/students/actions'
import type { PendingLoan } from '@/modules/students/service'

const dateBr = (iso: string) => iso.split('-').reverse().join('/')

/** Lista de livros que ficaram com o aluno (US06-CA1 e CA3). */
export function PendingList({ pending }: { pending: PendingLoan[] }) {
  return (
    <ul className="list-disc pl-5">
      {pending.map((p) => (
        <li key={p.loanId}>
          {p.bookTitle} ({p.copyCode}) — devolução prevista em {dateBr(p.dueDate)}
          {p.daysLate > 0 && ` (${p.daysLate} ${p.daysLate === 1 ? 'dia' : 'dias'} de atraso)`}
        </li>
      ))}
    </ul>
  )
}

/** US06: marcar como transferido. O alerta com os livros pendentes aparece logo depois de confirmar. */
export function TransferStudent({
  studentId,
  name,
  pendingCount,
}: {
  studentId: number
  name: string
  pendingCount: number
}) {
  const [state, action, pending] = useActionState(markTransferredAction, idle)

  if (state.status === 'ok')
    return state.data.pending.length > 0 ? (
      <div role="alert" className="space-y-2 rounded-md bg-amber-100 px-4 py-3 text-sm text-amber-900">
        <p className="font-semibold">
          {name} foi marcado como transferido e ainda está com{' '}
          {state.data.pending.length === 1 ? '1 livro' : `${state.data.pending.length} livros`}:
        </p>
        <PendingList pending={state.data.pending} />
        <p>Recupere os exemplares antes que se percam. A pendência fica em “Transferidos com pendência”.</p>
      </div>
    ) : (
      <p role="status" className="rounded-md bg-emerald-50 px-3 py-2 text-sm text-emerald-800">
        {name} foi marcado como transferido. Não há livros pendentes com ele.
      </p>
    )

  return (
    <form
      action={action}
      onSubmit={(e) => {
        const text =
          pendingCount > 0
            ? `${name} ainda tem ${pendingCount} livro(s) com ele. Marcar como transferido mesmo assim?`
            : `Marcar ${name} como transferido? Ele não poderá mais pegar livros.`
        if (!window.confirm(text)) e.preventDefault()
      }}
      className="space-y-2"
    >
      <input type="hidden" name="studentId" value={studentId} />
      <FormMessage state={state} />
      <button className="btn-secondary text-red-700" disabled={pending}>
        Marcar como transferido
      </button>
    </form>
  )
}
