import { ForbiddenError, UnauthenticatedError } from './errors'

export type Role = 'bibliotecaria' | 'professor' | 'coordenacao'

export interface SessionUser {
  id: number
  name: string
  role: Role
}

/**
 * Fonte da sessão atual. O login (Auth.js) é a T3.1 (SEB-32): ela deve registrar aqui o provedor real
 * com `setSessionProvider`. Até lá, só existe a sessão de desenvolvimento (DEV_SESSION_ROLE, nunca em produção).
 */
type SessionProvider = () => Promise<SessionUser | null>

async function devProvider(): Promise<SessionUser | null> {
  const role = process.env.DEV_SESSION_ROLE as Role | undefined
  if (!role || process.env.NODE_ENV === 'production') return null
  const { devUser } = await import('./dev-session')
  return devUser(role)
}

let provider: SessionProvider = devProvider

export function setSessionProvider(p: SessionProvider) {
  provider = p
}

export async function currentUser(): Promise<SessionUser | null> {
  return provider()
}

/** Exige sessão e um dos perfis. Use no início de toda Server Action e página (ARCHITECTURE.md §6). */
export async function requireRole(...roles: Role[]): Promise<SessionUser> {
  const user = await provider()
  if (!user) throw new UnauthenticatedError()
  if (!roles.includes(user.role)) throw new ForbiddenError()
  return user
}
