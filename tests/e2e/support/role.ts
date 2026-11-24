import type { BrowserContext } from '@playwright/test'

/** Troca o perfil da sessão de desenvolvimento (cookie dev_role); 'none' simula quem não entrou no sistema. */
export async function useRole(
  context: BrowserContext,
  role: 'bibliotecaria' | 'professor' | 'coordenacao' | 'none',
) {
  await context.addCookies([{ name: 'dev_role', value: role, url: 'http://localhost:3100' }])
}
