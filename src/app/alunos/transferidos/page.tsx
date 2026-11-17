import Link from 'next/link'
import { guardPage } from '@/components/guard'
import { getDb } from '@/db/client'
import { systemClock } from '@/lib/clock'
import { transferredWithPending } from '@/modules/students/service'
import { PendingList } from '../[id]/transfer-student'

export const dynamic = 'force-dynamic'

/** US06-CA3: pendências de alunos transferidos, até serem resolvidas na devolução. */
export default async function TransferidosPage() {
  const { denied } = await guardPage('bibliotecaria')
  if (denied) return denied
  const list = await transferredWithPending(await getDb(), systemClock)

  return (
    <section className="space-y-4">
      <h1 className="text-2xl font-semibold">Transferidos com pendência</h1>
      <p className="text-sm text-slate-600">
        Alunos que saíram da escola com livro da biblioteca. A pendência sai daqui quando o livro é devolvido
        (ou registrado como perdido) no balcão.
      </p>
      {list.length === 0 ? (
        <p className="text-slate-600">Nenhuma pendência de aluno transferido.</p>
      ) : (
        <ul className="space-y-3">
          {list.map((s) => (
            <li key={s.studentId} className="card space-y-2 text-sm">
              <p>
                <Link href={`/alunos/${s.studentId}`} className="font-semibold text-emerald-800 underline">
                  {s.name}
                </Link>{' '}
                — {s.className} · matrícula {s.registration} · responsável {s.guardianPhone}
              </p>
              <PendingList pending={s.pending} />
            </li>
          ))}
        </ul>
      )}
    </section>
  )
}
