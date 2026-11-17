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

const ROLES: Role[] = ['bibliotecaria', 'professor', 'coordenacao']

async function devProvider(): Promise<SessionUser | null> {
  if (!process.env.DEV_SESSION_ROLE || process.env.NODE_ENV === 'production') return null
  // O cookie `dev_role` troca o perfil sem reiniciar o servidor (usado pelos E2E de professora e coordenação).
  let role = process.env.DEV_SESSION_ROLE as Role
  try {
    const { cookies } = await import('next/headers')
    const fromCookie = (await cookies()).get('dev_role')?.value as Role | undefined
    if (fromCookie && ROLES.includes(fromCookie)) role = fromCookie
  } catch {
    // Fora de uma requisição do Next (ex.: scripts): fica o perfil da variável de ambiente.
  }
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
