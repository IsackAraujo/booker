import path from 'node:path'
import { expect, test } from '@playwright/test'

test('US02 bibliotecária importa a planilha e vê importados e recusados', async ({ page }) => {
  await page.goto('/alunos/importar')

  await page.getByLabel('Arquivo da planilha').setInputFiles(path.resolve('tests/e2e/fixtures/alunos.csv'))
  await page.getByRole('button', { name: 'Importar' }).click()

  const result = page.getByRole('heading', { name: 'Resultado da importação' }).locator('..')
  await expect(result).toContainText('Importados: 1')
  await expect(result).toContainText('Recusados: 2')
  await expect(result.getByRole('row', { name: /Sem nome/ })).toBeVisible()
  await expect(result.getByRole('row', { name: /Telefone do responsável inválido/ })).toBeVisible()

  await page.goto('/alunos?q=E2E001')
  await expect(page.getByRole('link', { name: 'Ana Teste' })).toBeVisible()
})

test('US02 modelo da planilha pode ser baixado', async ({ page }) => {
  await page.goto('/alunos/importar')

  const download = page.waitForEvent('download')
  await page.getByRole('link', { name: 'Baixar modelo da planilha' }).click()

  expect((await download).suggestedFilename()).toBe('modelo-alunos.xlsx')
})
