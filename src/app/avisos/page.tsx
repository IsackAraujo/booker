import Link from 'next/link'
import { guardPage } from '@/components/guard'
import { getDb } from '@/db/client'
import { systemClock } from '@/lib/clock'
import { listUnresolvedFailures } from '@/modules/notifications/reminders'
import { RetryButton } from './retry-button'

export const dynamic = 'force-dynamic'

const KIND_LABEL = { lembrete: 'Lembrete', cobranca: 'Cobrança', reserva_disponivel: 'Reserva' } as const
const dateTimeBr = (d: Date) =>
  d.toLocaleString('pt-BR', { timeZone: 'America/Sao_Paulo', dateStyle: 'short', timeStyle: 'short' })

/** US07-CA4: avisos pelo Telegram que não chegaram, para a bibliotecária resolver. */
export default async function AvisosPage() {
  const { denied } = await guardPage('bibliotecaria')
  if (denied) return denied
  const failures = await listUnresolvedFailures(await getDb(), systemClock)

  return (
    <section className="space-y-4">
      <h1 className="text-2xl font-semibold">Avisos não enviados</h1>
      <p className="text-sm text-slate-600">
        Lembretes e cobranças pelo Telegram que falharam nos últimos 30 dias. Lembretes são tentados de novo
        automaticamente na rotina do dia seguinte; você também pode tentar agora.
      </p>
      {failures.length === 0 ? (
        <p className="card text-slate-700">Nenhum aviso pendente.</p>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-left text-sm">
            <thead className="text-slate-500">
              <tr>
                <th className="py-2">Quando</th>
                <th>Tipo</th>
                <th>Aluno</th>
                <th>Livro</th>
                <th>Motivo</th>
                <th className="sr-only">Ação</th>
              </tr>
            </thead>
            <tbody>
              {failures.map((f) => (
                <tr key={f.notificationId} className="border-t border-slate-200 align-top">
                  <td className="py-2">{dateTimeBr(f.createdAt)}</td>
                  <td>{KIND_LABEL[f.kind]}</td>
                  <td>
                    {f.studentId ? (
                      <Link href={`/alunos/${f.studentId}`} className="text-emerald-800 underline">
                        {f.studentName}
                      </Link>
                    ) : (
                      '—'
                    )}{' '}
                    <span className="text-slate-500">{f.className}</span>
                  </td>
                  <td>{f.bookTitle ?? '—'}</td>
                  <td className="max-w-xs">{f.error}</td>
                  <td className="text-right">
                    <RetryButton
                      notificationId={f.notificationId}
                      label={`Tentar de novo: ${f.studentName}`}
                    />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </section>
  )
}
