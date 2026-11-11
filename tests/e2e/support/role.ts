import type { BrowserContext } from '@playwright/test'

/** Troca o perfil da sessão de desenvolvimento (cookie dev_role) até o login da T3.1 existir. */
export async function useRole(context: BrowserContext, role: 'bibliotecaria' | 'professor' | 'coordenacao') {
  await context.addCookies([{ name: 'dev_role', value: role, url: 'http://localhost:3100' }])
}
