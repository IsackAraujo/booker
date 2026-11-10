import type { Deps } from '@/lib/deps'
import { FakeMessageSender } from '@/modules/notifications/sender'

let current: Deps | undefined

/** Faz as Server Actions usarem o banco de teste, o relógio e o envio indicados (envio falso por padrão). */
export function setTestDeps(deps: Omit<Deps, 'sender'> & { sender?: Deps['sender'] }) {
  current = { sender: new FakeMessageSender(), ...deps }
}

export function resetTestDeps() {
  current = undefined
}

export async function getTestDeps(): Promise<Deps> {
  if (!current) throw new Error('Chame setTestDeps(...) antes de usar uma Server Action no teste.')
  return current
}
