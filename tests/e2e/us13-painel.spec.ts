import { expect, test } from '@playwright/test'
import { useRole } from './support/role'

// Os outros specs alteram o cenário em paralelo; aqui conferimos estrutura e coerência, não números fixos.
test('US13 coordenação vê os totais e a relação de cada um', async ({ page, context }) => {
  await useRole(context, 'coordenacao')
  await page.goto('/painel')

  for (const label of ['Disponíveis', 'Emprestados', 'Atrasados', 'Perdidos']) {
    await expect(page.getByRole('link', { name: new RegExp(`^${label}: [0-9]+`) })).toBeVisible()
  }

  await page.getByRole('link', { name: /^Disponíveis: \d+/ }).click()
  await expect(page).toHaveURL(/ver=disponiveis/)
  const total = Number(await page.getByTestId('total-disponiveis').textContent())
  await expect(
    page.getByRole('heading', { name: new RegExp(`^Disponíveis: ${total} exemplar`) }),
  ).toBeVisible()
  await expect(page.getByRole('row', { name: /E2E-LIVRE/ })).toBeVisible()
})

test('US13 filtro por turma e período', async ({ page, context }) => {
  await useRole(context, 'coordenacao')
  await page.goto('/painel')

  await page.getByLabel('Turma').selectOption('6B')
  await page.getByRole('button', { name: 'Aplicar' }).click()

  await expect(page).toHaveURL(/turma=6B/)
  await expect(page.getByText('Turma 6B', { exact: false })).toBeVisible()
})

test('US13 professor não acessa o painel', async ({ page, context }) => {
  await useRole(context, 'professor')
  await page.goto('/painel')

  await expect(page.getByText('Seu perfil não tem acesso a esta função.')).toBeVisible()
})
