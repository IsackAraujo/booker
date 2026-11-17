'use client'

import { useActionState } from 'react'
import { FormMessage } from '@/components/form-message'
import { idle } from '@/lib/action'
import { sendOverdueNoticesAction } from '@/modules/notifications/actions'

interface Row {
  loanId: number
  studentName: string
  className: string
  bookTitle: string
  copyCode: string
  dueDate: string
  daysLate: number
  lastNoticeAt: string | null
}

const dateBr = (iso: string) => iso.split('-').reverse().join('/')
const dateTimeBr = (iso: string) =>
  new Date(iso).toLocaleString('pt-BR', {
    timeZone: 'America/Sao_Paulo',
    dateStyle: 'short',
    timeStyle: 'short',
  })

export function OverdueTable({ rows }: { rows: Row[] }) {
  const [state, send, pending] = useActionState(sendOverdueNoticesAction, idle)

  return (
    <div className="space-y-3">
      <form action={send} className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-sm text-slate-600">
          {rows.length} {rows.length === 1 ? 'empréstimo atrasado' : 'empréstimos atrasados'}
        </p>
        {rows.map((r) => (
          <input key={r.loanId} type="hidden" name="loanId" value={r.loanId} />
        ))}
        <button className="btn" disabled={pending}>
          Avisar todos da lista
        </button>
      </form>

      {state.status === 'error' && <FormMessage state={state} />}
      {state.status === 'ok' && (
        <div role="status" className="rounded-md bg-emerald-50 px-3 py-2 text-sm text-emerald-900">
          <p>
            {state.data.sent} {state.data.sent === 1 ? 'aviso enviado' : 'avisos enviados'}.
            {state.data.skipped > 0 && ` ${state.data.skipped} já não estavam atrasados.`}
          </p>
          {state.data.failed.length > 0 && (
            <ul className="mt-1 list-disc pl-5 text-red-800">
              {state.data.failed.map((f) => (
                <li key={f.loanId}>
                  Não enviado para o responsável de {f.studentName}: {f.error}
                </li>
              ))}
            </ul>
          )}
        </div>
      )}

      <div className="overflow-x-auto">
        <table className="w-full text-left text-sm">
          <thead className="text-slate-500">
            <tr>
              <th className="py-2">Aluno</th>
              <th>Turma</th>
              <th>Título</th>
              <th>Previsto</th>
              <th>Atraso</th>
              <th>Último aviso</th>
              <th className="sr-only">Ação</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.loanId} className="border-t border-slate-200">
                <td className="py-2">{r.studentName}</td>
                <td>{r.className}</td>
                <td>
                  {r.bookTitle} <span className="text-slate-400">({r.copyCode})</span>
                </td>
                <td>{dateBr(r.dueDate)}</td>
                <td>
                  {r.daysLate} {r.daysLate === 1 ? 'dia' : 'dias'}
                </td>
                <td>{r.lastNoticeAt ? dateTimeBr(r.lastNoticeAt) : '—'}</td>
                <td className="text-right">
                  <form action={send}>
                    <input type="hidden" name="loanId" value={r.loanId} />
                    <button
                      className="btn-secondary py-1"
                      disabled={pending}
                      aria-label={`Avisar responsável de ${r.studentName}`}
                    >
                      Avisar
                    </button>
                  </form>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  )
}
