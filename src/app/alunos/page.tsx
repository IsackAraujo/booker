import Link from 'next/link'
import { guardPage } from '@/components/guard'
import { getDb } from '@/db/client'
import { searchStudents } from '@/modules/students/service'

export const dynamic = 'force-dynamic'

export default async function AlunosPage({ searchParams }: { searchParams: Promise<{ q?: string }> }) {
  const { denied } = await guardPage('bibliotecaria')
  if (denied) return denied
  const { q = '' } = await searchParams
  const list = await searchStudents(await getDb(), q)

  return (
    <section className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h1 className="text-2xl font-semibold">Alunos</h1>
        <div className="flex gap-2">
          <Link href="/alunos/importar" className="btn-secondary">
            Importar planilha
          </Link>
          <Link href="/alunos/novo" className="btn">
            Novo aluno
          </Link>
        </div>
      </div>
      <form className="flex gap-2" role="search">
        <input
          name="q"
          defaultValue={q}
          placeholder="Nome, matrícula ou turma"
          className="input"
          aria-label="Buscar aluno"
        />
        <button className="btn-secondary">Buscar</button>
      </form>
      {list.length === 0 ? (
        <p className="text-slate-600">Nenhum aluno encontrado.</p>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-left text-sm">
            <thead className="text-slate-500">
              <tr>
                <th className="py-2">Matrícula</th>
                <th>Nome</th>
                <th>Turma</th>
                <th>Telefone do responsável</th>
                <th>Situação</th>
              </tr>
            </thead>
            <tbody>
              {list.map((s) => (
                <tr key={s.id} className="border-t border-slate-200">
                  <td className="py-2">{s.registration}</td>
                  <td>
                    <Link href={`/alunos/${s.id}`} className="text-emerald-800 underline">
                      {s.name}
                    </Link>
                  </td>
                  <td>{s.className}</td>
                  <td>{s.guardianPhone}</td>
                  <td>{s.status}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </section>
  )
}
