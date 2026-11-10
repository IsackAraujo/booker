import 'server-only'
import { PGlite } from '@electric-sql/pglite'
import { drizzle as drizzlePglite } from 'drizzle-orm/pglite'
import { migrate as migratePglite } from 'drizzle-orm/pglite/migrator'
import { drizzle as drizzlePg } from 'drizzle-orm/node-postgres'
import path from 'node:path'
import * as schema from './schema'
import type { Db } from './types'

export const migrationsFolder = path.join(process.cwd(), 'src/db/migrations')

// Guardado no globalThis: no Next, páginas e Server Actions podem carregar cópias diferentes deste módulo,
// e com PGlite em memória cada cópia teria um banco próprio.
const globalForDb = globalThis as unknown as { __bookerDb?: Promise<Db> }

async function connect(): Promise<Db> {
  const url = process.env.DATABASE_URL
  if (url) return drizzlePg(url, { schema, casing: 'snake_case' }) as unknown as Db

  // Sem DATABASE_URL: Postgres embarcado (PGlite), migrado na inicialização.
  const client = new PGlite(process.env.PGLITE_DIR || './.pglite')
  const db = drizzlePglite(client, { schema, casing: 'snake_case' })
  await migratePglite(db, { migrationsFolder })
  // Banco local de desenvolvimento/E2E: garante os usuários do seed (idempotente).
  const { seed } = await import('./seed')
  await seed(db as unknown as Db)
  if (process.env.E2E_FIXTURES) {
    const { seedE2E } = await import('./seed-e2e')
    await seedE2E(db as unknown as Db)
  }
  return db as unknown as Db
}

/** Conexão única por processo. */
export function getDb(): Promise<Db> {
  globalForDb.__bookerDb ??= connect()
  return globalForDb.__bookerDb
}
