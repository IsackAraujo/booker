import { PGlite } from '@electric-sql/pglite'
import { drizzle } from 'drizzle-orm/pglite'
import { migrate } from 'drizzle-orm/pglite/migrator'
import path from 'node:path'
import * as schema from '@/db/schema'
import type { Db } from '@/db/types'

export type TestDb = Db

let template: Promise<PGlite> | undefined

/** Banco com as migrações aplicadas, criado uma vez por arquivo de teste e clonado para cada teste. */
async function getTemplate(): Promise<PGlite> {
  template ??= (async () => {
    const client = new PGlite()
    await migrate(drizzle(client), { migrationsFolder: path.resolve('src/db/migrations') })
    return client
  })()
  return template
}

/**
 * Banco PostgreSQL (PGlite) novo e vazio, com as mesmas migrações da produção (TESTING.md §4).
 * Cada chamada devolve uma cópia independente: testes não compartilham dados.
 */
export async function createTestDb(): Promise<TestDb> {
  const client = (await (await getTemplate()).clone()) as PGlite
  return drizzle(client, { schema, casing: 'snake_case' }) as unknown as TestDb
}
