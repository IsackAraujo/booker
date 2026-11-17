import { ForbiddenError, UnauthenticatedError } from './errors'

export type Role = 'bibliotecaria' | 'professor' | 'coordenacao'

export interface SessionUser {
  id: number
  name: string
  role: Role
}

/**
 * Fonte da sessão atual. O login (Auth.js) é a T3.1 (SEB-32): ela deve registrar aqui o provedor real
 * com `setSessionProvider`. Até lá o provedor padrão não autentica ninguém e os testes injetam o usuário.
 */
type SessionProvider = () => Promise<SessionUser | null>

let provider: SessionProvider = async () => null

export function setSessionProvider(p: SessionProvider) {
  provider = p
}

export async function currentUser(): Promise<SessionUser | null> {
  return provider()
}

/** Exige sessão e um dos perfis. Use no início de toda Server Action (ARCHITECTURE.md §6). */
export async function requireRole(...roles: Role[]): Promise<SessionUser> {
  const user = await provider()
  if (!user) throw new UnauthenticatedError()
  if (!roles.includes(user.role)) throw new ForbiddenError()
  return user
}
