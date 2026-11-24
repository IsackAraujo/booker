import 'server-only'
import { cookies } from 'next/headers'
import { SESSION_HOURS, signSession, verifySession, type SessionPayload } from './token'

export const SESSION_COOKIE = 'booker_session'

/** Grava o cookie de sessão depois do login (T3.1). */
export async function createSessionCookie(payload: SessionPayload, now: Date) {
  const token = await signSession(payload, now)
  ;(await cookies()).set(SESSION_COOKIE, token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax',
    path: '/',
    expires: new Date(now.getTime() + SESSION_HOURS * 3600 * 1000),
  })
}

export async function deleteSessionCookie() {
  ;(await cookies()).delete(SESSION_COOKIE)
}

/** Sessão do cookie, se válida. Não confere o banco: quem chama confere se o usuário segue ativo. */
export async function readSessionCookie(now: Date): Promise<SessionPayload | null> {
  return verifySession((await cookies()).get(SESSION_COOKIE)?.value, now)
}
