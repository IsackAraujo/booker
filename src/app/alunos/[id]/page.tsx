import Link from 'next/link'
import { notFound } from 'next/navigation'
import { guardPage } from '@/components/guard'
import { getDb } from '@/db/client'
import { systemClock } from '@/lib/clock'
import { getStudent, pendingLoans } from '@/modules/students/service'
import { StudentForm } from '../student-form'
import { PendingList, TransferStudent } from './transfer-student'

export const dynamic = 'force-dynamic'

const dateTimeBr = (d: Date) => d.toLocaleDateString('pt-BR', { timeZone: 'America/Sao_Paulo' })

export default async function EditarAlunoPage({ params }: { params: Promise<{ id: string }> }) {
  const { denied } = await guardPage('bibliotecaria')
  if (denied) return denied
  const { id } = await params
  const db = await getDb()
  const student = await getStudent(db, Number(id))
  if (!student) notFound()
  const pending = await pendingLoans(db, systemClock, student.id)

  return (
    <section className="space-y-6">
      <h1 className="text-2xl font-semibold">Editar aluno</h1>
      <StudentForm student={student} />

      <div className="card max-w-lg space-y-3">
        <h2 className="text-lg font-semibold">Transferência</h2>
        {student.status === 'transferido' ? (
          <div className="space-y-2 text-sm">
            <p>
              Aluno transferido{student.transferredAt && ` em ${dateTimeBr(student.transferredAt)}`}. Não pode
              pegar livros.
            </p>
            {pending.length > 0 ? (
              <div role="alert" className="space-y-1 rounded-md bg-amber-100 px-3 py-2 text-amber-900">
                <p className="font-medium">
                  {student.name} está transferido e ainda está com{' '}
                  {pending.length === 1 ? '1 livro' : `${pending.length} livros`}. Recupere os exemplares:
                </p>
                <PendingList pending={pending} />
              </div>
            ) : (
              <p className="text-slate-600">Nenhum livro pendente.</p>
            )}
          </div>
        ) : (
          <>
            <p className="text-sm text-slate-600">
              Use quando o aluno sair da escola. Os livros que estiverem com ele continuam aparecendo em{' '}
              <Link href="/alunos/transferidos" className="text-emerald-800 underline">
                Transferidos com pendência
              </Link>{' '}
              até serem devolvidos.
            </p>
            <TransferStudent studentId={student.id} name={student.name} pendingCount={pending.length} />
          </>
        )}
      </div>
    </section>
  )
}
