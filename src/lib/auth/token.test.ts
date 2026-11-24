import { SignJWT } from 'jose'
import { SESSION_HOURS, signSession, verifySession } from './token'

const now = new Date('2026-11-24T12:00:00Z')
const payload = { userId: 7, role: 'bibliotecaria' as const, name: 'Roseli' }

describe('T3.1 Token de sessão', () => {
  it('assina e lê de volta quem está logado', async () => {
    const token = await signSession(payload, now)

    expect(await verifySession(token, now)).toEqual(payload)
  })

  it('expira depois de um turno de trabalho', async () => {
    const token = await signSession(payload, now)
    const later = new Date(now.getTime() + (SESSION_HOURS * 3600 + 1) * 1000)

    expect(await verifySession(token, later)).toBeNull()
  })

  it('token adulterado não vale (troca de perfil no cookie)', async () => {
    const token = await signSession(payload, now)
    const [h, , s] = token.split('.')
    const forged = Buffer.from(
      JSON.stringify({ sub: '7', role: 'coordenacao', name: 'X', exp: 9999999999 }),
    ).toString('base64url')

    expect(await verifySession(`${h}.${forged}.${s}`, now)).toBeNull()
  })

  it('token assinado com outro segredo não vale', async () => {
    const other = await new SignJWT({ role: 'bibliotecaria', name: 'X' })
      .setProtectedHeader({ alg: 'HS256' })
      .setSubject('1')
      .setExpirationTime('1h')
      .sign(new TextEncoder().encode('outro-segredo-qualquer-com-32-caracteres!!'))

    expect(await verifySession(other, now)).toBeNull()
  })

  it.each([undefined, '', 'lixo'])('sem token ou token inválido: %s', async (token) => {
    expect(await verifySession(token, now)).toBeNull()
  })

  it('em produção exige AUTH_SECRET com 32 caracteres ou mais', async () => {
    const previous = { env: process.env.NODE_ENV, secret: process.env.AUTH_SECRET }
    ;(process.env as Record<string, string>).NODE_ENV = 'production'
    process.env.AUTH_SECRET = 'curto'
    try {
      await expect(signSession(payload, now)).rejects.toThrow('AUTH_SECRET')
    } finally {
      ;(process.env as Record<string, string | undefined>).NODE_ENV = previous.env
      if (previous.secret) process.env.AUTH_SECRET = previous.secret
      else delete process.env.AUTH_SECRET
    }
  })
})
