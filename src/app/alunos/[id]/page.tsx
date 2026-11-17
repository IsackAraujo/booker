import { notFound } from 'next/navigation'
import { guardPage } from '@/components/guard'
import { getDb } from '@/db/client'
import { getStudent } from '@/modules/students/service'
import { StudentForm } from '../student-form'

export const dynamic = 'force-dynamic'

export default async function EditarAlunoPage({ params }: { params: Promise<{ id: string }> }) {
  const { denied } = await guardPage('bibliotecaria')
  if (denied) return denied
  const { id } = await params
  const student = await getStudent(await getDb(), Number(id))
  if (!student) notFound()

  return (
    <section className="space-y-4">
      <h1 className="text-2xl font-semibold">Editar aluno</h1>
      <StudentForm student={student} />
    </section>
  )
}
