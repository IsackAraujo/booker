import { expect, test } from '@playwright/test'
import { useRole } from './support/role'

// US03: login de verdade (sem a sessão de desenvolvimento). Usuários do seed, senha "booker123".

test('US03 sem login vai para a tela de entrada e volta para onde queria depois de entrar', async ({
  page,
  context,
}) => {
  await useRole(context, 'none')
  await page.goto('/alunos')

  await expect(page).toHaveURL(/\/login\?next=%2Falunos/)
  await page.getByLabel('E-mail').fill('roseli@booker.test')
  await page.getByLabel('Senha').fill('booker123')
  await page.getByRole('button', { name: 'Entrar' }).click()

  await expect(page).toHaveURL(/\/alunos$/)
  await expect(page.getByTestId('user-name')).toContainText('Roseli (Bibliotecária)')
  await expect(page.getByRole('link', { name: 'Usuários' })).toBeVisible()

  await page.getByRole('button', { name: 'Sair' }).click()
  await expect(page).toHaveURL(/\/login$/)
})

test('US03 senha errada mostra mensagem e não entra', async ({ page, context }) => {
  await useRole(context, 'none')
  await page.goto('/login')

  await page.getByLabel('E-mail').fill('roseli@booker.test')
  await page.getByLabel('Senha').fill('errada')
  await page.getByRole('button', { name: 'Entrar' }).click()

  await expect(page.getByRole('main').getByRole('alert')).toHaveText('E-mail ou senha incorretos.')
  await expect(page.getByLabel('E-mail')).toHaveValue('roseli@booker.test')
})

test('US03 professora só vê as funções do perfil dela @mobile', async ({ page, context }) => {
  await useRole(context, 'none')
  await page.goto('/login')
  await page.getByLabel('E-mail').fill('genilse@booker.test')
  await page.getByLabel('Senha').fill('booker123')
  await page.getByRole('button', { name: 'Entrar' }).click()

  await expect(page.getByTestId('user-name')).toContainText('Genilse')
  await expect(page.getByRole('main').getByRole('link', { name: 'Reservas de turma' })).toBeVisible()
  await expect(page.getByRole('link', { name: 'Alunos' })).toHaveCount(0)

  await page.goto('/alunos')
  await expect(page.getByText('Seu perfil não tem acesso a esta função.')).toBeVisible()
})

test('US03 histórico mostra quem entrou, filtrado por usuário', async ({ page, context }) => {
  await useRole(context, 'none')
  await page.goto('/login')
  await page.getByLabel('E-mail').fill('mariana@booker.test')
  await page.getByLabel('Senha').fill('booker123')
  await page.getByRole('button', { name: 'Entrar' }).click()
  await expect(page.getByTestId('user-name')).toContainText('Mariana')

  await page.goto('/historico')
  await page.getByLabel('Usuário').selectOption({ label: 'Mariana' })
  await page.getByRole('button', { name: 'Filtrar' }).click()

  await expect(page.getByRole('row', { name: /Mariana .*Entrou no sistema/ }).first()).toBeVisible()
})
