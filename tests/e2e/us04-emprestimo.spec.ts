import { expect, test } from '@playwright/test'

test('US04 bibliotecária registra empréstimo com a data de devolução calculada', async ({ page }) => {
  await page.goto('/balcao/emprestimo')

  await page.getByLabel('Buscar aluno').fill('Diego')
  await page.getByRole('button', { name: 'Buscar aluno' }).click()
  await page.getByRole('button', { name: 'Escolher Diego E2E' }).click()

  // Leitor de código de barras: código exato de exemplar disponível já seleciona.
  await page.getByLabel('Buscar exemplar').fill('e2e-emp-1')
  await page.getByRole('button', { name: 'Buscar exemplar' }).click()

  const conferencia = page.getByRole('form', { name: 'Confira antes de registrar' })
  await expect(conferencia.getByText('Livro Empréstimo E2E (E2E-EMP-1)')).toBeVisible()
  await expect(conferencia.getByText(/^\d{2}\/\d{2}\/\d{4}$/)).toBeVisible()
  await conferencia.getByRole('button', { name: 'Registrar empréstimo' }).click()

  await expect(page.getByRole('status')).toContainText(
    'Empréstimo registrado: Livro Empréstimo E2E (E2E-EMP-1)',
  )
  await expect(page.getByRole('status')).toContainText('Devolver até')

  // US04-CA4: o mesmo exemplar não aparece mais como disponível.
  await page.getByLabel('Buscar exemplar').fill('E2E-EMP-1')
  await page.getByRole('button', { name: 'Buscar exemplar' }).click()
  await expect(page.getByRole('button', { name: 'Escolher exemplar E2E-EMP-1' })).toBeDisabled()
})

test('US04 aluno em atraso é avisado e não leva outro livro', async ({ page }) => {
  await page.goto('/balcao/emprestimo')

  await page.getByLabel('Buscar aluno').fill('Eva E2E')
  await page.getByRole('button', { name: 'Buscar aluno' }).click()
  await expect(page.getByText('1 em atraso')).toBeVisible()
  await page.getByRole('button', { name: 'Escolher Eva E2E' }).click()

  await page.getByLabel('Buscar exemplar').fill('E2E-EMP-2')
  await page.getByRole('button', { name: 'Buscar exemplar' }).click()

  const conferencia = page.getByRole('form', { name: 'Confira antes de registrar' })
  await expect(conferencia.getByRole('alert')).toContainText('1 livro em atraso')
  await expect(conferencia.getByText('6 dias de atraso')).toBeVisible()
  await expect(conferencia.getByRole('button', { name: 'Registrar empréstimo' })).toBeDisabled()
})
