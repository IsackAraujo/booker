import type { Role } from '@/lib/session'

const B: Role = 'bibliotecaria'
const P: Role = 'professor'
const C: Role = 'coordenacao'

/** Menu por perfil (ARCHITECTURE.md §6). Cada história acrescenta aqui a sua entrada. */
export const NAV: { href: string; label: string; roles: Role[] }[] = [
  { href: '/acervo', label: 'Acervo', roles: [B] },
  { href: '/alunos', label: 'Alunos', roles: [B] },
  { href: '/balcao/emprestimo', label: 'Empréstimo', roles: [B] },
  { href: '/balcao/devolucao', label: 'Devolução', roles: [B] },
  { href: '/atrasos', label: 'Atrasos', roles: [B] },
  { href: '/avisos', label: 'Avisos', roles: [B] },
  { href: '/reservas/turma', label: 'Reservas de turma', roles: [B, P] },
  { href: '/painel', label: 'Painel', roles: [B, C] },
  { href: '/historico', label: 'Histórico', roles: [B, C] },
  { href: '/usuarios', label: 'Usuários', roles: [B] },
]

export function navFor(role: Role) {
  return NAV.filter((item) => item.roles.includes(role))
}
