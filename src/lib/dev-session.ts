import { and, eq } from 'drizzle-orm'
import { getDb } from '@/db/client'
import { users } from '@/db/schema'
import type { Role, SessionUser } from './session'

/** Usuário do seed com o perfil pedido. Só para desenvolvimento e E2E, enquanto o login (T3.1) não existe. */
export async function devUser(role: Role): Promise<SessionUser | null> {
  const db = await getDb()
  const [u] = await db
    .select({ id: users.id, name: users.name, role: users.role })
    .from(users)
    .where(and(eq(users.role, role), eq(users.active, true)))
    .limit(1)
  return u ?? null
}
