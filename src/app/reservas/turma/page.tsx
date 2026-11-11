import { guardPage } from '@/components/guard'
import { getDb } from '@/db/client'
import { systemClock } from '@/lib/clock'
import {
  listBooksForReservation,
  listReservationsForDay,
  listTeacherReservations,
} from '@/modules/reservations/service'
import { CancelButton, ReservationForm } from './reservation-form'

export const dynamic = 'force-dynamic'

const dateBr = (iso: string) => iso.split('-').reverse().join('/')

export default async function ReservasTurmaPage({
  searchParams,
}: {
  searchParams: Promise<{ data?: string }>
}) {
  const { user, denied } = await guardPage('professor', 'bibliotecaria')
  if (denied) return denied
  const db = await getDb()
  const today = systemClock.today()

  if (user.role === 'bibliotecaria') {
    const { data } = await searchParams
    const day = data && /^\d{4}-\d{2}-\d{2}$/.test(data) ? data : today
    const list = await listReservationsForDay(db, day)
    return (
      <section className="space-y-4">
        <h1 className="text-2xl font-semibold">Reservas das turmas</h1>
        <form className="flex flex-wrap items-end gap-2">
          <label className="text-sm">
            <span className="mb-1 block font-medium">Dia</span>
            <input type="date" name="data" defaultValue={day} className="input" />
          </label>
          <button className="btn-secondary">Ver</button>
        </form>
        <h2 className="text-lg font-semibold">
          {day === today ? 'Hoje' : dateBr(day)}: separar para as turmas
        </h2>
        {list.length === 0 ? (
          <p className="card text-slate-700">Nenhuma reserva para este dia.</p>
        ) : (
          <ul className="space-y-2">
            {list.map((r) => (
              <li key={r.id} className="card flex flex-wrap justify-between gap-2">
                <span>
                  <strong>{r.quantity}</strong> × {r.bookTitle}
                </span>
                <span className="text-slate-600">
                  Turma {r.className} — Prof. {r.teacherName}
                </span>
              </li>
            ))}
          </ul>
        )}
      </section>
    )
  }

  const [books, mine] = await Promise.all([
    listBooksForReservation(db),
    listTeacherReservations(db, systemClock, user.id),
  ])
  return (
    <section className="space-y-6">
      <h1 className="text-2xl font-semibold">Reservar livros para a turma</h1>
      <ReservationForm books={books} today={today} />
      <div className="space-y-2">
        <h2 className="text-lg font-semibold">Minhas reservas</h2>
        {mine.length === 0 ? (
          <p className="text-slate-600">Você não tem reservas de hoje em diante.</p>
        ) : (
          <ul className="space-y-2">
            {mine.map((r) => (
              <li key={r.id} className="card flex flex-wrap items-center justify-between gap-2">
                <span>
                  {dateBr(r.activityDate)} — <strong>{r.quantity}</strong> × {r.bookTitle} (turma{' '}
                  {r.className})
                </span>
                {r.status === 'ativa' ? (
                  r.activityDate > today ? (
                    <CancelButton
                      id={r.id}
                      label={`Cancelar reserva de ${r.bookTitle} em ${dateBr(r.activityDate)}`}
                    />
                  ) : (
                    <span className="text-sm text-slate-500">Hoje</span>
                  )
                ) : (
                  <span className="text-sm text-slate-500">Cancelada</span>
                )}
              </li>
            ))}
          </ul>
        )}
      </div>
    </section>
  )
}
