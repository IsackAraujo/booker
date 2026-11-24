import { expect, test } from '@playwright/test'

// US07-CA4: lembrete que falhou aparece para a bibliotecária, com o motivo. Usa "Hugo E2E" (sem Telegram).
test('US07 bibliotecária vê o lembrete que não foi enviado e o motivo', async ({ page }) => {
  await page.goto('/avisos')

  const row = page.getByRole('row', { name: /Hugo E2E/ })
  await expect(row).toContainText('Lembrete')
  await expect(row).toContainText('Livro Ciclo E2E')
  await expect(row).toContainText('sem Telegram vinculado')

  // Sem vínculo, tentar de novo continua falhando e explica por quê.
  await row.getByRole('button', { name: 'Tentar de novo: Hugo E2E' }).click()
  await expect(row.getByRole('alert')).toContainText('Não enviado de novo')
})
