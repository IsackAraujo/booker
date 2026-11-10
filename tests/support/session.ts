import { setSessionProvider, type Role, type SessionUser } from '@/lib/session'

/** Define o usuário logado para as Server Actions chamadas a seguir. */
export function loginAs(user: SessionUser) {
  setSessionProvider(async () => user)
}

export function logout() {
  setSessionProvider(async () => null)
}

/** Usuário de sessão sem registro no banco, para testes de acesso negado. */
export function fakeUser(role: Role, id = 999): SessionUser {
  return { id, name: `Teste ${role}`, role }
}

export const ALL_ROLES: Role[] = ['bibliotecaria', 'professor', 'coordenacao']

/** Perfis que NÃO podem usar uma função, dado quem pode. */
export function rolesExcept(...allowed: Role[]): Role[] {
  return ALL_ROLES.filter((r) => !allowed.includes(r))
}
