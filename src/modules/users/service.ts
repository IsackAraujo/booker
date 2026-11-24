import bcrypt from 'bcryptjs'
import { and, asc, eq, ne } from 'drizzle-orm'
import { users } from '@/db/schema'
import type { Db } from '@/db/types'
import { BusinessError, NotFoundError } from '@/lib/errors'
import type { Role, SessionUser } from '@/lib/session'
import * as audit from '@/modules/audit/service'
import { normalizeEmail, validatePassword, validateUser, type UserInput } from './rules'

export const LOGIN_FAILED = 'E-mail ou senha incorretos.'

// Hash usado quando o e-mail não existe, para a resposta levar o mesmo tempo (não revela quem tem conta).
let dummyHash: string | undefined
const getDummyHash = () => (dummyHash ??= bcrypt.hashSync('senha-que-ninguem-usa', 10))

/** T3.1: confere e-mail e senha. Usuário desativado não entra. Mensagem única para qualquer falha. */
export async function authenticate(db: Db, email: string, password: string): Promise<SessionUser | null> {
  const [u] = await db
    .select()
    .from(users)
    .where(eq(users.email, normalizeEmail(email)))
  const ok = await bcrypt.compare(password, u?.passwordHash ?? getDummyHash())
  if (!u || !ok || !u.active) return null
  return { id: u.id, name: u.name, role: u.role }
}

/** Usuário ativo da sessão (o cookie pode ser de alguém desativado depois do login). */
export async function activeUser(db: Db, id: number): Promise<SessionUser | null> {
  const [u] = await db
    .select({ id: users.id, name: users.name, role: users.role })
    .from(users)
    .where(and(eq(users.id, id), eq(users.active, true)))
  return u ?? null
}

export async function listUsers(db: Db) {
  return db
    .select({ id: users.id, name: users.name, email: users.email, role: users.role, active: users.active })
    .from(users)
    .orderBy(asc(users.name))
}

/** Cadastro de usuário pela bibliotecária (cada pessoa com seu acesso, inclusive substitutos). */
export async function createUser(db: Db, actorId: number, input: UserInput) {
  const errors = validateUser(input)
  if (errors.length) throw new BusinessError(errors.join('; '), 'USER_INVALID')
  const email = normalizeEmail(input.email)
  return db.transaction(async (tx) => {
    const [exists] = await tx.select({ id: users.id }).from(users).where(eq(users.email, email))
    if (exists) throw new BusinessError('Já existe usuário com este e-mail.', 'USER_DUPLICATE')
    const [u] = await tx
      .insert(users)
      .values({
        name: input.name.trim(),
        email,
        role: input.role as Role,
        passwordHash: await bcrypt.hash(input.password, 10),
      })
      .returning({ id: users.id, name: users.name, email: users.email, role: users.role })
    await audit.append(tx, {
      userId: actorId,
      action: 'usuario.cadastrar',
      entity: 'user',
      entityId: u!.id,
      payload: { email, role: input.role },
    })
    return u!
  })
}

/** Ativa ou desativa um acesso. Ninguém desativa a si mesmo, e sempre sobra uma bibliotecária ativa. */
export async function setUserActive(db: Db, actorId: number, userId: number, active: boolean) {
  if (userId === actorId && !active)
    throw new BusinessError('Você não pode desativar o seu próprio acesso.', 'USER_SELF')
  await db.transaction(async (tx) => {
    const [u] = await tx.select().from(users).where(eq(users.id, userId))
    if (!u) throw new NotFoundError('Usuário')
    if (!active && u.role === 'bibliotecaria') {
      const others = await tx
        .select({ id: users.id })
        .from(users)
        .where(and(eq(users.role, 'bibliotecaria'), eq(users.active, true), ne(users.id, userId)))
      if (others.length === 0)
        throw new BusinessError('É preciso manter ao menos uma bibliotecária ativa.', 'USER_LAST_ADMIN')
    }
    await tx.update(users).set({ active }).where(eq(users.id, userId))
    await audit.append(tx, {
      userId: actorId,
      action: active ? 'usuario.ativar' : 'usuario.desativar',
      entity: 'user',
      entityId: userId,
    })
  })
}

/** A bibliotecária define uma senha nova para alguém que esqueceu. */
export async function resetPassword(db: Db, actorId: number, userId: number, password: string) {
  const error = validatePassword(password)
  if (error) throw new BusinessError(error, 'USER_INVALID')
  await db.transaction(async (tx) => {
    const [u] = await tx
      .update(users)
      .set({ passwordHash: await bcrypt.hash(password, 10) })
      .where(eq(users.id, userId))
      .returning({ id: users.id })
    if (!u) throw new NotFoundError('Usuário')
    await audit.append(tx, {
      userId: actorId,
      action: 'usuario.redefinir_senha',
      entity: 'user',
      entityId: userId,
    })
  })
}

/** Registra a entrada no histórico (US03: quem usou o sistema e quando). */
export async function recordLogin(db: Db, userId: number) {
  await audit.append(db, { userId, action: 'usuario.entrar', entity: 'user', entityId: userId })
}
