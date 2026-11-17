import { expect, test } from '@playwright/test'

// Usa o cenário exclusivo "Clara E2E" (turma 7C) de src/db/seed-e2e.ts.
test('US08 lista atrasados, filtra por turma e envia aviso ao responsável', async ({ page }) => {
  await page.goto('/atrasos')

  const row = page.getByRole('row', { name: /Clara E2E/ })
  await expect(row).toContainText('7C')
  await expect(row).toContainText('Livro E2E')
  await expect(row).toContainText('4 dias')
  await expect(page.getByRole('row', { name: /Bruno E2E/ })).toHaveCount(0)

  await page.getByLabel('Turma').selectOption('7C')
  await page.getByRole('button', { name: 'Filtrar' }).click()
  await expect(page).toHaveURL(/turma=7C/)
  await expect(page.getByRole('row', { name: /E2E/ })).toHaveCount(1)

  await page.getByRole('button', { name: 'Avisar responsável de Clara E2E' }).click()

  await expect(page.getByRole('status')).toContainText('1 aviso enviado')
  await page.reload()
  await expect(
    page
      .getByRole('row', { name: /Clara E2E/ })
      .getByRole('cell')
      .nth(5),
  ).not.toHaveText('—')
})
