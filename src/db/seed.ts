import bcrypt from 'bcryptjs'
import * as schema from './schema'
import type { Db } from './types'

/** Usuários e parâmetros mínimos para desenvolvimento e E2E. Senha de todos: "booker123". Idempotente. */
export async function seed(db: Db) {
  const passwordHash = await bcrypt.hash('booker123', 10)
  await db
    .insert(schema.users)
    .values([
      { name: 'Roseli', email: 'roseli@booker.test', passwordHash, role: 'bibliotecaria' },
      { name: 'Genilse', email: 'genilse@booker.test', passwordHash, role: 'professor' },
      { name: 'Mariana', email: 'mariana@booker.test', passwordHash, role: 'coordenacao' },
    ])
    .onConflictDoNothing()
  await db.insert(schema.settings).values({ id: 1 }).onConflictDoNothing()
}
