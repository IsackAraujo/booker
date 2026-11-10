import { afterEach, vi } from 'vitest'
import { setSessionProvider } from '@/lib/session'
import { getTestDeps, resetTestDeps } from './deps'

// `server-only` quebra fora do Next; nos testes é inofensivo.
vi.mock('server-only', () => ({}))
vi.mock('next/cache', () => ({ revalidatePath: vi.fn(), revalidateTag: vi.fn() }))
// Server Actions usam o banco de teste definido com setTestDeps.
vi.mock('@/lib/deps', () => ({ getDeps: () => getTestDeps() }))

afterEach(() => {
  setSessionProvider(async () => null)
  resetTestDeps()
})
