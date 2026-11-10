'use client'

import { useActionState, useEffect, useRef } from 'react'
import { FormMessage } from '@/components/form-message'
import { idle } from '@/lib/action'
import { findLoanForReturnAction, registerReturnAction } from '@/modules/loans/actions'
import { RETURN_CONDITION_LABEL, type ReturnCondition } from '@/modules/loans/rules'

const dateBr = (iso: string) => iso.split('-').reverse().join('/')

export function ReturnDesk() {
  const [found, find, finding] = useActionState(findLoanForReturnAction, idle)
  const [done, confirm, confirming] = useActionState(registerReturnAction, idle)
  const codeRef = useRef<HTMLInputElement>(null)
  const confirmedLoan = done.status === 'ok' ? done.data.loanId : null

  // Depois de confirmar, volta o foco para o código: o próximo livro pode ser lido em seguida.
  useEffect(() => {
    if (done.status === 'ok') codeRef.current?.select()
  }, [done])

  const loan = found.status === 'ok' && found.data.loanId !== confirmedLoan ? found.data : null

  return (
    <div className="space-y-4">
      <form action={find} className="card flex flex-wrap items-end gap-3">
        <label className="flex-1 text-sm">
          <span className="mb-1 block font-medium">Código do exemplar</span>
          <input ref={codeRef} name="code" className="input" autoFocus autoComplete="off" required />
        </label>
        <button className="btn-secondary" disabled={finding}>
          Buscar
        </button>
      </form>

      {found.status === 'error' && <FormMessage state={found} />}

      {loan && (
        <form action={confirm} className="card space-y-3">
          <input type="hidden" name="loanId" value={loan.loanId} />
          <h2 className="text-lg font-semibold">Confira antes de confirmar</h2>
          <dl className="grid grid-cols-[max-content_1fr] gap-x-4 gap-y-1 text-sm">
            <dt className="text-slate-500">Título</dt>
            <dd>{loan.bookTitle}</dd>
            <dt className="text-slate-500">Exemplar</dt>
            <dd>{loan.copyCode}</dd>
            <dt className="text-slate-500">Aluno</dt>
            <dd>
              {loan.studentName} — {loan.className}
            </dd>
            <dt className="text-slate-500">Devolução prevista</dt>
            <dd>
              {dateBr(loan.dueDate)}
              {loan.daysLate > 0 && (
                <span className="ml-2 rounded bg-amber-100 px-2 py-0.5 text-amber-900">
                  {loan.daysLate} {loan.daysLate === 1 ? 'dia' : 'dias'} de atraso
                </span>
              )}
            </dd>
          </dl>
          <fieldset className="space-y-1 text-sm">
            <legend className="mb-1 font-medium">Situação do exemplar</legend>
            {(Object.keys(RETURN_CONDITION_LABEL) as ReturnCondition[]).map((c) => (
              <label key={c} className="flex items-center gap-2">
                <input type="radio" name="condition" value={c} defaultChecked={c === 'ok'} />
                {RETURN_CONDITION_LABEL[c]}
              </label>
            ))}
          </fieldset>
          <button className="btn" disabled={confirming}>
            {confirming ? 'Registrando…' : 'Confirmar devolução'}
          </button>
        </form>
      )}

      {done.status === 'error' && <FormMessage state={done} />}
      {done.status === 'ok' && (
        <p role="status" className="rounded-md bg-emerald-50 px-3 py-2 text-sm text-emerald-800">
          Devolução registrada: {done.data.bookTitle} ({done.data.copyCode}) — {done.data.studentName}.
          {done.data.returnedLate && ` Registrada com ${done.data.daysLate} dia(s) de atraso.`}
          {done.data.condition !== 'ok' &&
            ` Exemplar marcado como ${RETURN_CONDITION_LABEL[done.data.condition].toLowerCase()}.`}
        </p>
      )}
    </div>
  )
}
