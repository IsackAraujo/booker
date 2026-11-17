import { guardPage } from '@/components/guard'
import { BookForm } from '../book-form'

export default async function NovoLivroPage() {
  const { denied } = await guardPage('bibliotecaria')
  if (denied) return denied

  return (
    <section className="space-y-4">
      <h1 className="text-2xl font-semibold">Novo livro</h1>
      <p className="text-sm text-slate-600">
        Depois de salvar, cadastre os exemplares com o código de cada um.
      </p>
      <BookForm />
    </section>
  )
}
