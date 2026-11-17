import type { Deps } from '@/lib/deps'

let current: Deps | undefined

/** Faz as Server Actions usarem o banco de teste e o relógio indicado. */
export function setTestDeps(deps: Deps) {
  current = deps
}

export function resetTestDeps() {
  current = undefined
}

export async function getTestDeps(): Promise<Deps> {
  if (!current) throw new Error('Chame setTestDeps(...) antes de usar uma Server Action no teste.')
  return current
}
