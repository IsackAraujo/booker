import { and, asc, desc, eq, gte, lt } from 'drizzle-orm'
import { auditLog, users } from '@/db/schema'
import type { Db } from '@/db/types'
import { schoolDayRange, type IsoDate } from '@/lib/clock'
import { ROLE_LABEL } from '@/modules/users/rules'

// T3.3: consulta do histórico de operações (US03-CA4), somente leitura.

export const ACTION_LABEL: Record<string, string> = {
  'emprestimo.registrar': 'Registrou empréstimo',
  'emprestimo.devolver': 'Registrou devolução',
  'livro.cadastrar': 'Cadastrou livro',
  'livro.editar': 'Editou livro',
  'livro.inativar': 'Inativou livro',
  'livro.excluir': 'Excluiu livro',
  'livro.reativar': 'Reativou livro',
  'exemplar.cadastrar': 'Cadastrou exemplar',
  'exemplar.situacao': 'Mudou a situação de exemplar',
  'aluno.cadastrar': 'Cadastrou aluno',
  'aluno.editar': 'Editou aluno',
  'aluno.transferir': 'Marcou aluno como transferido',
  'aluno.telegram.desvincular': 'Desvinculou o Telegram do aluno',
  'alunos.importar': 'Importou planilha de alunos',
  'cobranca.enviar': 'Enviou cobrança de atraso',
  'reserva_turma.criar': 'Reservou livros para a turma',
  'reserva_turma.cancelar': 'Cancelou reserva da turma',
  'usuario.entrar': 'Entrou no sistema',
  'usuario.cadastrar': 'Cadastrou usuário',
  'usuario.ativar': 'Reativou usuário',
  'usuario.desativar': 'Desativou usuário',
  'usuario.redefinir_senha': 'Redefiniu senha de usuário',
}

export function actionLabel(action: string): string {
  return ACTION_LABEL[action] ?? action
}

export interface HistoryFilter {
  from: IsoDate
  to: IsoDate
  userId?: number
}

/** Período padrão do histórico: últimos 7 dias, incluindo hoje. */
export function defaultHistoryPeriod(today: IsoDate): { from: IsoDate; to: IsoDate } {
  const d = new Date(`${today}T12:00:00Z`)
  d.setUTCDate(d.getUTCDate() - 6)
  return { from: d.toISOString().slice(0, 10), to: today }
}

const ISO = /^\d{4}-\d{2}-\d{2}$/

export function parseHistoryFilter(
  params: { de?: string; ate?: string; usuario?: string },
  today: IsoDate,
): HistoryFilter {
  const fallback = defaultHistoryPeriod(today)
  let from = params.de && ISO.test(params.de) ? params.de : fallback.from
  let to = params.ate && ISO.test(params.ate) ? params.ate : fallback.to
  if (from > to) [from, to] = [to, from]
  const userId = Number(params.usuario)
  return { from, to, userId: Number.isInteger(userId) && userId > 0 ? userId : undefined }
}

export interface HistoryRow {
  id: number
  createdAt: Date
  userName: string
  userRole: string
  action: string
  actionLabel: string
  entity: string
  entityId: number | null
  payload: Record<string, unknown> | null
}

/** Histórico por período e usuário (US03-CA4), mais recentes primeiro, limitado para a tela não pesar. */
export async function history(db: Db, filter: HistoryFilter, limit = 500): Promise<HistoryRow[]> {
  const { start, end } = schoolDayRange(filter.from, filter.to)
  const rows = await db
    .select({
      id: auditLog.id,
      createdAt: auditLog.createdAt,
      userName: users.name,
      role: users.role,
      action: auditLog.action,
      entity: auditLog.entity,
      entityId: auditLog.entityId,
      payload: auditLog.payload,
    })
    .from(auditLog)
    .innerJoin(users, eq(users.id, auditLog.userId))
    .where(
      and(
        gte(auditLog.createdAt, start),
        lt(auditLog.createdAt, end),
        filter.userId ? eq(auditLog.userId, filter.userId) : undefined,
      ),
    )
    .orderBy(desc(auditLog.createdAt), desc(auditLog.id))
    .limit(limit)
  return rows.map(({ role, ...r }) => ({
    ...r,
    userRole: ROLE_LABEL[role],
    actionLabel: actionLabel(r.action),
  }))
}

/** Usuários para o filtro (inclusive desativados, que podem ter histórico). */
export async function historyUsers(db: Db) {
  return db.select({ id: users.id, name: users.name }).from(users).orderBy(asc(users.name))
}
