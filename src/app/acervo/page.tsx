import Link from 'next/link'
import { guardPage } from '@/components/guard'
import { getDb } from '@/db/client'
import { searchBooks } from '@/modules/catalog/service'

export const dynamic = 'force-dynamic'

export default async function AcervoPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string; inativos?: string }>
}) {
  const { denied } = await guardPage('bibliotecaria')
  if (denied) return denied
  const { q = '', inativos } = await searchParams
  const list = await searchBooks(await getDb(), q, { includeInactive: inativos === '1' })

  return (
    <section className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h1 className="text-2xl font-semibold">Acervo</h1>
        <Link href="/acervo/novo" className="btn">
          Novo livro
        </Link>
      </div>
      <form className="flex flex-wrap items-center gap-2" role="search">
        <input
          name="q"
          defaultValue={q}
          placeholder="Título, autor ou categoria"
          className="input max-w-md"
          aria-label="Buscar livro"
        />
        <label className="flex items-center gap-1 text-sm text-slate-600">
          <input type="checkbox" name="inativos" value="1" defaultChecked={inativos === '1'} />
          Mostrar inativos
        </label>
        <button className="btn-secondary">Buscar</button>
      </form>
      {list.length === 0 ? (
        <p className="text-slate-600">Nenhum livro encontrado.</p>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-left text-sm">
            <thead className="text-slate-500">
              <tr>
                <th className="py-2">Título</th>
                <th>Autor</th>
                <th>Categoria</th>
                <th>Faixa etária</th>
                <th>Exemplares</th>
                <th>Disponíveis</th>
              </tr>
            </thead>
            <tbody>
              {list.map((b) => (
                <tr key={b.id} className="border-t border-slate-200">
                  <td className="py-2">
                    <Link href={`/acervo/${b.id}`} className="text-emerald-800 underline">
                      {b.title}
                    </Link>
                    {!b.active && (
                      <span className="ml-2 rounded bg-slate-200 px-2 py-0.5 text-xs text-slate-700">
                        Inativo
                      </span>
                    )}
                  </td>
                  <td>{b.author}</td>
                  <td>{b.category}</td>
                  <td>{b.ageRange}</td>
                  <td>{b.totalCopies}</td>
                  <td>{b.availableCopies}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </section>
  )
}
