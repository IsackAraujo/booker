import { guardPage } from '@/components/guard'
import { StudentForm } from '../student-form'

export default async function NovoAlunoPage() {
  const { denied } = await guardPage('bibliotecaria')
  if (denied) return denied

  return (
    <section className="space-y-4">
      <h1 className="text-2xl font-semibold">Novo aluno</h1>
      <StudentForm />
    </section>
  )
}
