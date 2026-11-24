import { expect, test } from '@playwright/test'

// SEB-35 / ADR 8: link e QR code de vínculo do responsável com o bot do Telegram.
test('SEB-35 cadastro do aluno mostra o vínculo do Telegram e o link de vínculo', async ({ page }) => {
  await page.goto('/alunos?q=E2E-G')
  await page.getByRole('link', { name: 'Gabi E2E' }).click()

  await expect(page.getByRole('heading', { name: 'Avisos pelo Telegram' })).toBeVisible()
  await expect(page.getByText('Responsável vinculado')).toBeVisible()
  await expect(page.getByTestId('telegram-link')).toHaveText(
    /^https:\/\/t\.me\/biblioteca_e2e_bot\?start=[A-Za-z0-9_-]{16}$/,
  )
  await expect(page.getByLabel('QR code de vínculo').locator('svg')).toBeVisible()
})

test('SEB-35 links da turma para imprimir', async ({ page }) => {
  await page.goto('/alunos/telegram')

  await page.getByLabel('Turma').selectOption('3C')
  await page.getByRole('button', { name: 'Ver' }).click()

  await expect(page.getByText('1 de 1 responsáveis já vinculados')).toBeVisible()
  await expect(page.getByRole('listitem').filter({ hasText: 'Gabi E2E' })).toContainText(
    'https://t.me/biblioteca_e2e_bot?start=',
  )
})
