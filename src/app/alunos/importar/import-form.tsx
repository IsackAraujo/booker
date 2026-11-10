'use client'

import { useActionState } from 'react'
import { FormMessage } from '@/components/form-message'
import { idle } from '@/lib/action'
import { importStudentsAction } from '@/modules/students/actions'

export function ImportForm() {
  const [state, action, pending] = useActionState(importStudentsAction, idle)

  return (
    <div className="space-y-4">
      <form action={action} className="card flex flex-wrap items-end gap-3">
        <label className="flex-1 text-sm">
          <span className="mb-1 block font-medium">Arquivo da planilha</span>
          <input type="file" name="file" accept=".xlsx,.csv" className="input" required />
        </label>
        <button className="btn" disabled={pending}>
          {pending ? 'Importando…' : 'Importar'}
        </button>
      </form>
      <FormMessage state={state} />
      {state.status === 'ok' && (
        <div className="card space-y-3" aria-live="polite">
          <h2 className="text-lg font-semibold">Resultado da importação</h2>
          <ul className="text-sm">
            <li>
              Importados: <strong>{state.data.created + state.data.updated}</strong> ({state.data.created}{' '}
              novos, {state.data.updated} atualizados)
            </li>
            <li>
              Recusados: <strong>{state.data.rejected.length}</strong>
            </li>
          </ul>
          {state.data.rejected.length > 0 && (
            <table className="w-full text-left text-sm">
              <caption className="mb-1 text-left font-medium">Registros recusados</caption>
              <thead className="text-slate-500">
                <tr>
                  <th className="py-1">Linha</th>
                  <th>Matrícula</th>
                  <th>Nome</th>
                  <th>Motivo</th>
                </tr>
              </thead>
              <tbody>
                {state.data.rejected.map((r) => (
                  <tr key={r.line} className="border-t border-slate-200">
                    <td className="py-1">{r.line}</td>
                    <td>{r.registration || '—'}</td>
                    <td>{r.name || '—'}</td>
                    <td>{r.reasons.join('; ')}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      )}
    </div>
  )
}
