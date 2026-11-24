import { jwtVerify, SignJWT } from 'jose'
import type { Role } from '@/lib/session'

// Sessão sem estado em cookie assinado (ADR 9), como no guia de autenticação do Next.js 16.

export interface SessionPayload {
  userId: number
  role: Role
  name: string
}

/** Duração da sessão: um turno de trabalho. */
export const SESSION_HOURS = 10

const DEV_SECRET = 'booker-dev-secret-nao-use-em-producao-0123456789'

function secretKey(): Uint8Array {
  const secret = process.env.AUTH_SECRET
  if (secret && secret.length >= 32) return new TextEncoder().encode(secret)
  if (process.env.NODE_ENV === 'production') {
    throw new Error('AUTH_SECRET precisa ter pelo menos 32 caracteres em produção.')
  }
  return new TextEncoder().encode(DEV_SECRET)
}

export async function signSession(payload: SessionPayload, now: Date): Promise<string> {
  const iat = Math.floor(now.getTime() / 1000)
  return new SignJWT({ role: payload.role, name: payload.name })
    .setProtectedHeader({ alg: 'HS256' })
    .setSubject(String(payload.userId))
    .setIssuedAt(iat)
    .setExpirationTime(iat + SESSION_HOURS * 3600)
    .sign(secretKey())
}

/** Devolve o conteúdo da sessão, ou null se o token for inválido, adulterado ou expirado. */
export async function verifySession(token: string | undefined, now: Date): Promise<SessionPayload | null> {
  if (!token) return null
  try {
    const { payload } = await jwtVerify(token, secretKey(), {
      algorithms: ['HS256'],
      currentDate: now,
    })
    const userId = Number(payload.sub)
    if (!Number.isInteger(userId) || typeof payload.role !== 'string' || typeof payload.name !== 'string')
      return null
    return { userId, role: payload.role as Role, name: payload.name }
  } catch {
    return null
  }
}
