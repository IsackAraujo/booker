import { createTestDb, type TestDb } from '@tests/support/db'
import { setTestDeps } from '@tests/support/deps'
import { asSession, makeBook, makeCopy, makeUser } from '@tests/factories'
import { fakeUser, loginAs, rolesExcept } from '@tests/support/session'
import { classReservations } from '@/db/schema'
import { idle } from '@/lib/action'
import { fixedClock } from '@/lib/clock'
import { availabilityAction, cancelReservationAction, createReservationAction } from './actions'

let db: TestDb
beforeEach(async () => {
  db = await createTestDb()
  setTestDeps({ db, clock: fixedClock('2026-03-10') })
})

function form(fields: Record<string, string>) {
  const f = new FormData()
  for (const [k, v] of Object.entries(fields)) f.set(k, v)
  return f
}

async function bookWith(n: number) {
  const book = await makeBook(db)
  for (let i = 0; i < n; i++) await makeCopy(db, { book })
  return book
}

describe('US10 Reserva para a turma — Server Actions', () => {
  it('[US03-CA1] sem sessão não reserva', async () => {
    const book = await bookWith(2)

    expect(
      await createReservationAction(
        idle,
        form({ bookId: String(book.id), className: '5A', quantity: '1', activityDate: '2026-03-20' }),
      ),
    ).toMatchObject({ status: 'error', message: 'É preciso entrar no sistema.' })
  })

  it.each(rolesExcept('professor'))('[US03-CA2] perfil %s não reserva para turma', async (role) => {
    loginAs(fakeUser(role))
    const book = await bookWith(2)

    expect(
      await createReservationAction(
        idle,
        form({ bookId: String(book.id), className: '5A', quantity: '1', activityDate: '2026-03-20' }),
      ),
    ).toMatchObject({ status: 'error', message: 'Seu perfil não tem acesso a esta função.' })
    await expect(availabilityAction(book.id, '2026-03-20')).rejects.toThrow()
  })

  it('[US10-CA1] [US10-CA2] professora reserva, consulta disponibilidade e cancela', async () => {
    loginAs(asSession(await makeUser(db, { role: 'professor' })))
    const book = await bookWith(3)

    expect(await availabilityAction(book.id, '2026-03-20')).toBe(3)
    const created = await createReservationAction(
      idle,
      form({ bookId: String(book.id), className: '5A', quantity: '2', activityDate: '2026-03-20' }),
    )
    expect(created).toMatchObject({ status: 'ok', message: 'Reserva registrada.' })
    expect(await availabilityAction(book.id, '2026-03-20')).toBe(1)

    const id = (created as { data: { id: number } }).data.id
    expect(await cancelReservationAction(idle, form({ id: String(id) }))).toMatchObject({
      status: 'ok',
      message: 'Reserva cancelada.',
    })
  })

  it('[US10-CA1] campos vazios viram mensagens', async () => {
    loginAs(asSession(await makeUser(db, { role: 'professor' })))
    const book = await bookWith(1)

    expect(
      await createReservationAction(
        idle,
        form({ bookId: String(book.id), className: '5A', quantity: '', activityDate: '' }),
      ),
    ).toEqual({ status: 'error', message: 'Informe a quantidade de exemplares; Informe a data da atividade' })
    expect(await db.select().from(classReservations)).toHaveLength(0)
  })

  it('disponibilidade com data inválida devolve null', async () => {
    loginAs(asSession(await makeUser(db, { role: 'professor' })))

    expect(await availabilityAction(1, '')).toBeNull()
  })
})
