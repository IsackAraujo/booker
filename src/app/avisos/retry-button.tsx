'use client'

import { useActionState } from 'react'
import { idle } from '@/lib/action'
import { retryNoticeAction } from '@/modules/notifications/actions'

export function RetryButton({ notificationId, label }: { notificationId: number; label: string }) {
  const [state, action, pending] = useActionState(retryNoticeAction, idle)
  return (
    <form action={action} className="flex flex-col items-end gap-1">
      <input type="hidden" name="notificationId" value={notificationId} />
      <button className="btn-secondary py-1" disabled={pending} aria-label={label}>
        Tentar de novo
      </button>
      {state.status === 'error' && (
        <span role="alert" className="max-w-56 text-right text-xs text-red-700">
          {state.message}
        </span>
      )}
      {state.status === 'ok' && (
        <span role="status" className="text-xs text-emerald-800">
          {state.message}
        </span>
      )}
    </form>
  )
}
