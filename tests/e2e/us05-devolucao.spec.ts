import { expect, test } from '@playwright/test'

test('US05 bibliotecária confere e registra devolução atrasada', async ({ page }) => {
  await page.goto('/balcao/devolucao')

  await page.getByLabel('Código do exemplar').fill('e2e-atrasado')
  await page.getByRole('button', { name: 'Buscar' }).click()

  await expect(page.getByText('Raissa E2E — 5A')).toBeVisible()
  await expect(page.getByText('Livro E2E')).toBeVisible()
  await expect(page.getByText('3 dias de atraso')).toBeVisible()

  await page.getByRole('button', { name: 'Confirmar devolução' }).click()

  await expect(page.getByRole('status')).toContainText('Registrada com 3 dia(s) de atraso')

  await page.getByLabel('Código do exemplar').fill('E2E-ATRASADO')
  await page.getByRole('button', { name: 'Buscar' }).click()
  await expect(page.getByRole('main').getByRole('alert')).toHaveText('Este exemplar não está emprestado.')
})

test('US05 registra exemplar danificado', async ({ page }) => {
  await page.goto('/balcao/devolucao')

  await page.getByLabel('Código do exemplar').fill('E2E-NOPRAZO')
  await page.getByRole('button', { name: 'Buscar' }).click()
  await page.getByLabel('Danificado').check()
  await page.getByRole('button', { name: 'Confirmar devolução' }).click()

  await expect(page.getByRole('status')).toContainText('marcado como danificado')
})
