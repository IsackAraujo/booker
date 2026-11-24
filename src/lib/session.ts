import { ForbiddenError, UnauthenticatedError } from './errors'

export type Role = 'bibliotecaria' | 'professor' | 'coordenacao'

export interface SessionUser {
  id: number
  name: string
  role: Role
}

/**
 * Fonte da sessão atual (ADR 9). Primeiro o cookie de login (T3.1), conferindo se o usuário continua ativo.
 * Sem login, e só fora de produção, vale a sessão de desenvolvimento (DEV_SESSION_ROLE), usada pelos E2E.
 * Os testes de integração trocam o provedor com `setSessionProvider`.
 */
type SessionProvider = () => Promise<SessionUser | null>

const ROLES: Role[] = ['bibliotecaria', 'professor', 'coordenacao']

async function loginProvider(): Promise<SessionUser | null> {
  try {
    const { readSessionCookie } = await import('./auth/cookie')
    const session = await readSessionCookie(new Date())
    if (!session) return null
    const { getDb } = await import('@/db/client')
    const { activeUser } = await import('@/modules/users/service')
    return activeUser(await getDb(), session.userId)
  } catch {
    // Fora de uma requisição do Next (scripts): sem cookie, sem sessão.
    return null
  }
}

async function devProvider(): Promise<SessionUser | null> {
  if (!process.env.DEV_SESSION_ROLE || process.env.NODE_ENV === 'production') return null
  // O cookie `dev_role` troca o perfil sem reiniciar o servidor; `none` simula quem não entrou (E2E do login).
  let role = process.env.DEV_SESSION_ROLE as Role
  try {
    const { cookies } = await import('next/headers')
    const fromCookie = (await cookies()).get('dev_role')?.value
    if (fromCookie === 'none') return null
    if (fromCookie && ROLES.includes(fromCookie as Role)) role = fromCookie as Role
  } catch {
    // Fora de uma requisição do Next (ex.: scripts): fica o perfil da variável de ambiente.
  }
  const { devUser } = await import('./dev-session')
  return devUser(role)
}

async function defaultProvider(): Promise<SessionUser | null> {
  return (await loginProvider()) ?? (await devProvider())
}

let provider: SessionProvider = defaultProvider

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
