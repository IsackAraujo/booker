import { expect, test } from '@playwright/test'

test('a página inicial abre @mobile', async ({ page }) => {
  await page.goto('/')

  await expect(page.getByRole('heading', { name: 'Biblioteca' })).toBeVisible()
})
