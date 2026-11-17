import { guardPage } from '@/components/guard'
import { LoanDesk } from './loan-desk'

export default async function EmprestimoPage() {
  const { denied } = await guardPage('bibliotecaria')
  if (denied) return denied

  return (
    <section className="space-y-4">
      <h1 className="text-2xl font-semibold">Empréstimo</h1>
      <LoanDesk />
    </section>
  )
}
