import { eq } from 'drizzle-orm'
import { settings } from '@/db/schema'
import type { Db } from '@/db/types'

export type Settings = typeof settings.$inferSelect

/** Parâmetros da escola (ARCHITECTURE.md §5). Cria a linha com os padrões se ainda não existir. */
export async function getSettings(db: Db): Promise<Settings> {
  const [row] = await db.select().from(settings).where(eq(settings.id, 1))
  if (row) return row
  await db.insert(settings).values({ id: 1 }).onConflictDoNothing()
  const [created] = await db.select().from(settings).where(eq(settings.id, 1))
  return created!
}
