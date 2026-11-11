import { guardPage } from '@/components/guard'
import { TEMPLATE_COLUMNS } from '@/modules/students/rules'
import { ImportForm } from './import-form'

export default async function ImportarAlunosPage() {
  const { denied } = await guardPage('bibliotecaria')
  if (denied) return denied

  return (
    <section className="space-y-4">
      <h1 className="text-2xl font-semibold">Importar alunos da secretaria</h1>
      <div className="card space-y-2 text-sm text-slate-700">
        <p>
          A planilha precisa ter as colunas:{' '}
          <strong>{TEMPLATE_COLUMNS.map((c) => c.header).join(', ')}</strong>. Aceita .xlsx ou .csv.
        </p>
        <p>
          Alunos com matrícula já cadastrada têm os dados atualizados. Linhas sem nome, sem turma ou com
          telefone inválido são recusadas e listadas ao final.
        </p>
        {/* Download de arquivo (route handler), não navegação: <a> é o correto aqui. */}
        <a href="/alunos/modelo" download className="text-emerald-800 underline">
          Baixar modelo da planilha
        </a>
      </div>
      <ImportForm />
    </section>
  )
}
