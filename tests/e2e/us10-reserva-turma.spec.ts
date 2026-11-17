import { expect, test } from '@playwright/test'
import { useRole } from './support/role'

function isoInDays(n: number) {
  const d = new Date()
  d.setDate(d.getDate() + n)
  return d.toLocaleDateString('sv-SE', { timeZone: 'America/Sao_Paulo' })
}
const dateBr = (iso: string) => iso.split('-').reverse().join('/')

// Usa o livro exclusivo "Livro Reserva E2E" (3 exemplares) de src/db/seed-e2e.ts.
// Roda nos projetos desktop e mobile ao mesmo tempo: cada um usa um dia diferente para não disputar exemplares.
test('US10 professora reserva para a turma e a bibliotecária vê no dia @mobile', async ({
  page,
  context,
}) => {
  const day = isoInDays(test.info().project.name === 'mobile' ? 6 : 5)
  await useRole(context, 'professor')
  await page.goto('/reservas/turma')

  await page.getByLabel('Livro').selectOption({ label: 'Livro Reserva E2E — Autor E2E' })
  await page.getByLabel('Data da atividade').fill(day)
  await expect(page.getByText('Disponíveis nesta data: 3')).toBeVisible()

  await page.getByLabel('Quantidade de exemplares').fill('4')
  await page.getByLabel('Turma').fill('5a')
  await page.getByLabel('Quantidade de exemplares').evaluate((el) => el.removeAttribute('max'))
  await page.getByRole('button', { name: 'Reservar' }).click()
  await expect(page.getByRole('main').getByRole('alert')).toHaveText(
    'Só 3 exemplares estão disponíveis na data escolhida.',
  )

  await page.getByLabel('Quantidade de exemplares').fill('2')
  await page.getByRole('button', { name: 'Reservar' }).click()
  await expect(page.getByRole('status')).toHaveText('Reserva registrada.')
  const mine = page.getByRole('listitem').filter({ hasText: dateBr(day) })
  await expect(mine).toContainText('2 × Livro Reserva E2E (turma 5A)')

  await useRole(context, 'bibliotecaria')
  await page.goto(`/reservas/turma?data=${day}`)
  await expect(page.getByRole('listitem').filter({ hasText: 'Livro Reserva E2E' })).toContainText(
    'Turma 5A — Prof. Genilse',
  )

  await useRole(context, 'professor')
  await page.goto('/reservas/turma')
  await page.getByRole('button', { name: `Cancelar reserva de Livro Reserva E2E em ${dateBr(day)}` }).click()
  await expect(page.getByRole('listitem').filter({ hasText: dateBr(day) })).toContainText('Cancelada')
})
