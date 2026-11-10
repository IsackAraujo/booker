import { guardPage } from '@/components/guard'
import { ReturnDesk } from './return-desk'

export default async function DevolucaoPage() {
  const { denied } = await guardPage('bibliotecaria')
  if (denied) return denied

  return (
    <section className="space-y-4">
      <h1 className="text-2xl font-semibold">Devolução</h1>
      <ReturnDesk />
    </section>
  )
}
