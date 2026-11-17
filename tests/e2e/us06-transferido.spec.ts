import { expect, test } from '@playwright/test'

test('US06 ao transferir aluno com livro, a bibliotecária é alertada e a pendência fica na consulta', async ({
  page,
}) => {
  await page.goto('/alunos?q=Fabio')
  await page.getByRole('link', { name: 'Fabio E2E' }).click()

  page.once('dialog', (d) => d.accept())
  await page.getByRole('button', { name: 'Marcar como transferido' }).click()

  const alerta = page.getByRole('main').getByRole('alert')
  await expect(alerta).toContainText('ainda está com 1 livro')
  await expect(page.getByText('Não pode pegar livros.')).toBeVisible()
  await expect(alerta).toContainText('Livro Empréstimo E2E (E2E-TRF-1)')

  // US06-CA3: a pendência continua disponível para consulta.
  await page.goto('/alunos/transferidos')
  await expect(page.getByText('E2E-TRF-1')).toBeVisible()

  // US06-CA2: não pega novo empréstimo.
  await page.goto('/balcao/emprestimo')
  await page.getByLabel('Buscar aluno').fill('Fabio')
  await page.getByRole('button', { name: 'Buscar aluno' }).click()
  await page.getByRole('button', { name: 'Escolher Fabio E2E' }).click()
  await page.getByLabel('Buscar exemplar').fill('E2E-EMP-2')
  await page.getByRole('button', { name: 'Buscar exemplar' }).click()
  await expect(
    page.getByRole('form', { name: 'Confira antes de registrar' }).getByRole('alert'),
  ).toContainText('Aluno transferido não pode pegar livros.')
})
