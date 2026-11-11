import { afterEach, vi } from 'vitest'
import { setSessionProvider } from '@/lib/session'

// `server-only` quebra fora do Next; nos testes é inofensivo.
vi.mock('server-only', () => ({}))

afterEach(() => {
  setSessionProvider(async () => null)
})
