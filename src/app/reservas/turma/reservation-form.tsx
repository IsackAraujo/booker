'use client'

import { useActionState, useState, useTransition } from 'react'
import { FormMessage } from '@/components/form-message'
import { keepValues } from '@/components/keep-values'
import { idle } from '@/lib/action'
import {
  availabilityAction,
  cancelReservationAction,
  createReservationAction,
} from '@/modules/reservations/actions'

interface Book {
  id: number
  title: string
  author: string
}

export function ReservationForm({ books, today }: { books: Book[]; today: string }) {
  const [state, action, pending] = useActionState(createReservationAction, idle)
  const [bookId, setBookId] = useState('')
  const [date, setDate] = useState('')
  const [available, setAvailable] = useState<number | null>(null)
  const [checking, startCheck] = useTransition()

  function refresh(nextBook: string, nextDate: string) {
    setAvailable(null)
    if (!nextBook || !nextDate) return
    startCheck(async () => setAvailable(await availabilityAction(Number(nextBook), nextDate)))
  }

  return (
    <form onSubmit={keepValues(action)} className="card max-w-lg space-y-3">
      <label className="block text-sm">
        <span className="mb-1 block font-medium">Livro</span>
        <select
          name="bookId"
          className="input"
          value={bookId}
          onChange={(e) => {
            setBookId(e.target.value)
            refresh(e.target.value, date)
          }}
          required
        >
          <option value="">Escolha…</option>
          {books.map((b) => (
            <option key={b.id} value={b.id}>
              {b.title} — {b.author}
            </option>
          ))}
        </select>
      </label>
      <label className="block text-sm">
        <span className="mb-1 block font-medium">Data da atividade</span>
        <input
          type="date"
          name="activityDate"
          min={today}
          className="input"
          value={date}
          onChange={(e) => {
            setDate(e.target.value)
            refresh(bookId, e.target.value)
          }}
          required
        />
      </label>
      <p className="text-sm text-slate-600" aria-live="polite">
        {checking
          ? 'Consultando disponibilidade…'
          : available !== null && `Disponíveis nesta data: ${available}`}
      </p>
      <label className="block text-sm">
        <span className="mb-1 block font-medium">Quantidade de exemplares</span>
        <input
          type="number"
          name="quantity"
          min={1}
          max={available ?? undefined}
          className="input"
          required
        />
      </label>
      <label className="block text-sm">
        <span className="mb-1 block font-medium">Turma</span>
        <input name="className" className="input" placeholder="5A" required />
      </label>
      <FormMessage state={state} />
      <button className="btn" disabled={pending}>
        {pending ? 'Reservando…' : 'Reservar'}
      </button>
    </form>
  )
}

export function CancelButton({ id, label }: { id: number; label: string }) {
  const [state, action, pending] = useActionState(cancelReservationAction, idle)
  return (
    <form action={action} className="flex items-center gap-2">
      <input type="hidden" name="id" value={id} />
      {state.status === 'error' && <span className="text-sm text-red-700">{state.message}</span>}
      <button className="btn-secondary py-1" disabled={pending} aria-label={label}>
        Cancelar
      </button>
    </form>
  )
}
