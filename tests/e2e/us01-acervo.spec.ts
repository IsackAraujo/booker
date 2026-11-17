import { expect, test } from '@playwright/test'

test('US01 bibliotecária cadastra livro e exemplares', async ({ page }) => {
  const suffix = Date.now().toString().slice(-6)
  await page.goto('/acervo/novo')

  await page.getByLabel('Título').fill(`Livro Acervo ${suffix}`)
  await page.getByLabel('Autor').fill('Autora E2E')
  await page.getByLabel('Categoria').fill('Literatura')
  await page.getByLabel('Faixa etária').fill('8-10')
  await page.getByRole('button', { name: 'Salvar livro' }).click()

  await expect(page.getByRole('heading', { name: `Livro Acervo ${suffix}` })).toBeVisible()
  await page.getByLabel('Novos exemplares').fill(`AC${suffix}-1\nAC${suffix}-2`)
  await page.getByRole('button', { name: 'Cadastrar exemplares' }).click()

  await expect(page.getByRole('status')).toContainText('2 exemplares cadastrados')
  await expect(page.getByText(`AC${suffix}-1`)).toBeVisible()
  await expect(page.getByLabel(`Situação do exemplar AC${suffix}-1`)).toHaveValue('disponivel')

  // US01-CA2: código repetido é recusado.
  await page.getByLabel('Novos exemplares').fill(`ac${suffix}-1`)
  await page.getByRole('button', { name: 'Cadastrar exemplares' }).click()
  await expect(page.getByRole('main').getByRole('alert')).toContainText('Já existe exemplar com o código')

  // Sem histórico de empréstimo, pode ser excluído (US01-CA4).
  page.once('dialog', (d) => d.accept())
  await page.getByRole('button', { name: 'Excluir livro' }).click()
  await expect(page).toHaveURL(/\/acervo$/)
})

test('US01 livro com empréstimo só pode ser inativado', async ({ page }) => {
  await page.goto('/acervo?q=Livro+E2E')
  await page.getByRole('link', { name: 'Livro E2E', exact: true }).click()

  await expect(page.getByText('não pode ser excluído, só inativado')).toBeVisible()
  await expect(page.getByRole('button', { name: 'Inativar livro' })).toBeVisible()
  await expect(page.getByRole('button', { name: 'Excluir livro' })).toHaveCount(0)
})
