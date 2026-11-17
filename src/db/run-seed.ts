import { PGlite } from '@electric-sql/pglite'
import { drizzle } from 'drizzle-orm/pglite'
import { drizzle as drizzlePg } from 'drizzle-orm/node-postgres'
import * as schema from './schema'
import { seed } from './seed'
import type { Db } from './types'

const db = process.env.DATABASE_URL
  ? drizzlePg(process.env.DATABASE_URL, { schema, casing: 'snake_case' })
  : drizzle(new PGlite(process.env.PGLITE_DIR || './.pglite'), { schema, casing: 'snake_case' })

await seed(db as unknown as Db)
console.log('Seed aplicado.')
process.exit(0)
