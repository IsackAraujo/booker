import { getDb } from '@/db/client'
import type { Db } from '@/db/types'
import { getMessageSender, type MessageSender } from '@/modules/notifications/sender'
import { systemClock, type Clock } from './clock'

export interface Deps {
  db: Db
  clock: Clock
  sender: MessageSender
}

/** Dependências das Server Actions. Os testes substituem este módulo com vi.mock para usar o banco de teste. */
export async function getDeps(): Promise<Deps> {
  return { db: await getDb(), clock: systemClock, sender: getMessageSender() }
}
