import type { PgDatabase, PgQueryResultHKT } from 'drizzle-orm/pg-core'
import type * as schema from './schema'

/** Banco ou transação: serviços aceitam os dois, então podem ser compostos dentro de uma transação maior. */
export type Db = PgDatabase<PgQueryResultHKT, typeof schema>
