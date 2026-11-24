'use client'

import { useActionState } from 'react'
import { FormMessage } from '@/components/form-message'
import { idle } from '@/lib/action'
import { unlinkTelegramAction } from '@/modules/students/telegram-actions'

export function UnlinkTelegram({ studentId }: { studentId: number }) {
  const [state, action, pending] = useActionState(unlinkTelegramAction, idle)
  return (
    <form action={action} className="space-y-2">
      <input type="hidden" name="studentId" value={studentId} />
      <p className="text-slate-600">
        Use se o responsável trocou de celular ou não quer mais receber avisos.
      </p>
      <FormMessage state={state} />
      <button className="btn-secondary" disabled={pending}>
        Desvincular Telegram
      </button>
    </form>
  )
}
