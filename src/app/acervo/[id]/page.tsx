import Link from 'next/link'
import { notFound } from 'next/navigation'
import { guardPage } from '@/components/guard'
import { getDb } from '@/db/client'
import { getBookDetails } from '@/modules/catalog/service'
import { BookForm } from '../book-form'
import { AddCopiesForm, CopyStatusForm, RemoveBook } from './book-admin'

export const dynamic = 'force-dynamic'

export default async function LivroPage({ params }: { params: Promise<{ id: string }> }) {
  const { denied } = await guardPage('bibliotecaria')
  if (denied) return denied
  const { id } = await params
  const book = await getBookDetails(await getDb(), Number(id))
  if (!book) notFound()

  return (
    <section className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h1 className="text-2xl font-semibold">
          {book.title}
          {!book.active && (
            <span className="ml-2 rounded bg-slate-200 px-2 py-0.5 align-middle text-sm text-slate-700">
              Inativo
            </span>
          )}
        </h1>
        <Link href="/acervo" className="text-sm text-emerald-800 underline">
          Voltar ao acervo
        </Link>
      </div>

      <div className="grid gap-6 md:grid-cols-2">
        <div className="space-y-2">
          <h2 className="text-lg font-semibold">Dados do livro</h2>
          <BookForm book={book} />
        </div>

        <div className="space-y-2">
          <h2 className="text-lg font-semibold">Exemplares ({book.copies.length})</h2>
          {book.copies.length === 0 ? (
            <p className="text-sm text-slate-600">Nenhum exemplar cadastrado.</p>
          ) : (
            <ul className="card divide-y divide-slate-200 p-0">
              {book.copies.map((c) => (
                <li key={c.id} className="flex flex-wrap items-center justify-between gap-2 px-4 py-2">
                  <span className="font-mono text-sm">{c.code}</span>
                  <CopyStatusForm copyId={c.id} code={c.code} status={c.status} />
                </li>
              ))}
            </ul>
          )}
          {book.active && <AddCopiesForm bookId={book.id} />}
        </div>
      </div>

      <RemoveBook bookId={book.id} active={book.active} hasLoanHistory={book.hasLoanHistory} />
    </section>
  )
}
