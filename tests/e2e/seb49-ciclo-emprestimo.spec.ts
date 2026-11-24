import { expect, type Page, test } from '@playwright/test'

// SEB-49: devolução (US05) de ponta a ponta com o registro de empréstimo (US04), tudo pela tela.
// Usa o livro "Livro Ciclo E2E" e a aluna "Gabi E2E" (turma 3C), exclusivos deste spec em src/db/seed-e2e.ts.
// O atraso na devolução não é testado aqui porque o servidor usa a data real; ele está em loans/cycle.test.ts.

async function emprestar(page: Page, code: string) {
  await page.goto('/balcao/emprestimo')
  await page.getByLabel('Buscar aluno').fill('Gabi E2E')
  await page.getByRole('button', { name: 'Buscar aluno' }).click()
  await page.getByRole('button', { name: 'Escolher Gabi E2E' }).click()
  await page.getByLabel('Buscar exemplar').fill(code)
  await page.getByRole('button', { name: 'Buscar exemplar' }).click()
  const conferencia = page.getByRole('form', { name: 'Confira antes de registrar' })
  await conferencia.getByRole('button', { name: 'Registrar empréstimo' }).click()
  await expect(page.getByRole('status')).toContainText(`Empréstimo registrado: Livro Ciclo E2E (${code})`)
}

async function devolver(page: Page, code: string, situacao?: 'Perdido' | 'Danificado') {
  await page.goto('/balcao/devolucao')
  await page.getByLabel('Código do exemplar').fill(code)
  await page.getByRole('button', { name: 'Buscar' }).click()
  await expect(page.getByText('Gabi E2E — 3C')).toBeVisible()
  await expect(page.getByText('Livro Ciclo E2E')).toBeVisible()
  if (situacao) await page.getByLabel(situacao).check()
  await page.getByRole('button', { name: 'Confirmar devolução' }).click()
}

test('SEB-49 empresta pela tela, devolve no prazo e o exemplar pode ser emprestado de novo', async ({
  page,
}) => {
  await emprestar(page, 'E2E-CIC-1')

  await devolver(page, 'E2E-CIC-1')
  const status = page.getByRole('status')
  await expect(status).toContainText('Devolução registrada: Livro Ciclo E2E (E2E-CIC-1) — Gabi E2E.')
  await expect(status).not.toContainText('atraso')

  // A devolução libera o exemplar e o limite da aluna: ela leva o mesmo livro de novo.
  await emprestar(page, 'E2E-CIC-1')
  await devolver(page, 'E2E-CIC-1')
  await expect(page.getByRole('status')).toContainText('Devolução registrada')
})

test('SEB-49 exemplar devolvido como perdido não pode ser emprestado de novo', async ({ page }) => {
  await emprestar(page, 'E2E-CIC-2')

  await devolver(page, 'E2E-CIC-2', 'Perdido')
  await expect(page.getByRole('status')).toContainText('Exemplar marcado como perdido.')

  await page.goto('/balcao/emprestimo')
  await page.getByLabel('Buscar aluno').fill('Gabi E2E')
  await page.getByRole('button', { name: 'Buscar aluno' }).click()
  await page.getByRole('button', { name: 'Escolher Gabi E2E' }).click()
  await page.getByLabel('Buscar exemplar').fill('E2E-CIC-2')
  await page.getByRole('button', { name: 'Buscar exemplar' }).click()
  await expect(page.getByRole('button', { name: 'Escolher exemplar E2E-CIC-2' })).toBeDisabled()
})
