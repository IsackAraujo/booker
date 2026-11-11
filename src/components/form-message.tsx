import type { ActionState } from '@/lib/action'

export function FormMessage({ state }: { state: ActionState<unknown> }) {
  if (state.status === 'error')
    return (
      <p role="alert" className="rounded-md bg-red-50 px-3 py-2 text-sm text-red-800">
        {state.message}
      </p>
    )
  if (state.status === 'ok' && state.message)
    return (
      <p role="status" className="rounded-md bg-emerald-50 px-3 py-2 text-sm text-emerald-800">
        {state.message}
      </p>
    )
  return null
}
