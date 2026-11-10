import 'server-only'
import { PGlite } from '@electric-sql/pglite'
import { drizzle as drizzlePglite } from 'drizzle-orm/pglite'
import { migrate as migratePglite } from 'drizzle-orm/pglite/migrator'
import { drizzle as drizzlePg } from 'drizzle-orm/node-postgres'
import path from 'node:path'
import * as schema from './schema'
import type { Db } from './types'

export const migrationsFolder = path.join(process.cwd(), 'src/db/migrations')

let instance: Promise<Db> | undefined

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
  return db as unknown as Db
}

/** Conexão única por processo. */
export function getDb(): Promise<Db> {
  instance ??= connect()
  return instance
}
