import { drizzle } from 'drizzle-orm/node-postgres'
import { migrate } from 'drizzle-orm/node-postgres/migrator'
import { PGlite } from '@electric-sql/pglite'
import { drizzle as drizzlePglite } from 'drizzle-orm/pglite'
import { migrate as migratePglite } from 'drizzle-orm/pglite/migrator'

const migrationsFolder = './src/db/migrations'

if (process.env.DATABASE_URL) {
  const db = drizzle(process.env.DATABASE_URL)
  await migrate(db, { migrationsFolder })
  await db.$client.end()
} else {
  const client = new PGlite(process.env.PGLITE_DIR || './.pglite')
  await migratePglite(drizzlePglite(client), { migrationsFolder })
  await client.close()
}
console.log('Migrações aplicadas.')
