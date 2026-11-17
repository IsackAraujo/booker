import { eq } from 'drizzle-orm'
import { createTestDb, type TestDb } from '@tests/support/db'
import { makeBook, makeClassReservation, makeCopy, makeLoan, makeUser } from '@tests/factories'
import { auditLog, classReservations } from '@/db/schema'
import { fixedClock } from '@/lib/clock'
import { ForbiddenError } from '@/lib/errors'
import * as service from './service'

const clock = fixedClock('2026-03-10')
const DATE = '2026-03-20'

let db: TestDb
let teacherId: number
beforeEach(async () => {
  db = await createTestDb()
  teacherId = (await makeUser(db, { role: 'professor', name: 'Genilse' })).id
})

async function bookWithCopies(n: number) {
  const book = await makeBook(db, { title: 'Meu Pé de Laranja Lima' })
  const list = []
  for (let i = 0; i < n; i++) list.push(await makeCopy(db, { book }))
  return { book, copies: list }
}

const input = (bookId: number, quantity = 2, activityDate = DATE) => ({
  bookId,
  className: '5a',
  quantity,
  activityDate,
})

describe('US10 Disponibilidade na data', () => {
  it('[US10-CA2] desconta emprestados que ainda estarão fora e reservas do mesmo dia', async () => {
    const { book, copies: cs } = await bookWithCopies(6)
    await makeLoan(db, { copy: cs[0], dueDate: '2026-03-25' }) // fora na data
    await makeLoan(db, { copy: cs[1], dueDate: '2026-03-15' }) // volta antes
    await makeLoan(db, { copy: cs[2], dueDate: '2026-03-05' }) // atrasado
    await makeClassReservation(db, { book, quantity: 1, activityDate: DATE })
    await makeClassReservation(db, { book, quantity: 2, activityDate: '2026-03-21' }) // outro dia
    await makeClassReservation(db, { book, quantity: 2, activityDate: DATE, status: 'cancelada' })

    expect(await service.availableForDate(db, clock, book.id, DATE)).toBe(6 - 2 - 1)
  })

  it('[US10-CA2] exemplares perdidos, danificados ou separados para a fila não contam', async () => {
    const book = await makeBook(db)
    await makeCopy(db, { book })
    await makeCopy(db, { book, status: 'perdido' })
    await makeCopy(db, { book, status: 'danificado' })
    await makeCopy(db, { book, status: 'separado' })

    expect(await service.availableForDate(db, clock, book.id, DATE)).toBe(1)
  })
})

describe('US10 Criar reserva', () => {
  it('[US10-CA1] cria a reserva com turma normalizada e registra no histórico', async () => {
    const { book } = await bookWithCopies(3)

    const r = await service.createReservation(db, clock, teacherId, input(book.id, 3))

    expect(r).toMatchObject({
      teacherId,
      bookId: book.id,
      className: '5A',
      quantity: 3,
      activityDate: DATE,
      status: 'ativa',
    })
    const [log] = await db.select().from(auditLog)
    expect(log).toMatchObject({ userId: teacherId, action: 'reserva_turma.criar', entityId: r.id })
  })

  it('[US10-CA1] não reserva sem quantidade ou sem data', async () => {
    const { book } = await bookWithCopies(3)

    await expect(
      service.createReservation(db, clock, teacherId, {
        bookId: book.id,
        className: '5A',
        quantity: null,
        activityDate: null,
      }),
    ).rejects.toThrow('Informe a quantidade de exemplares; Informe a data da atividade')
    expect(await db.select().from(classReservations)).toHaveLength(0)
  })

  it('[US10-CA2] não reserva mais do que o disponível na data', async () => {
    const { book } = await bookWithCopies(3)
    await makeClassReservation(db, { book, quantity: 2, activityDate: DATE })

    await expect(service.createReservation(db, clock, teacherId, input(book.id, 2))).rejects.toThrow(
      'Só 1 exemplar está disponível na data escolhida.',
    )
  })

  it('[US10-CA2] pode reservar exatamente o disponível', async () => {
    const { book } = await bookWithCopies(3)
    await makeClassReservation(db, { book, quantity: 1, activityDate: DATE })

    await expect(service.createReservation(db, clock, teacherId, input(book.id, 2))).resolves.toBeDefined()
  })

  it('[US10-CA2] sem nenhum disponível', async () => {
    const { book, copies: cs } = await bookWithCopies(1)
    await makeLoan(db, { copy: cs[0], dueDate: '2026-03-30' })

    await expect(service.createReservation(db, clock, teacherId, input(book.id, 1))).rejects.toMatchObject({
      code: 'RESERVATION_UNAVAILABLE',
      message: 'Não há exemplares disponíveis deste livro na data escolhida.',
    })
  })

  it('livro inativo ou inexistente', async () => {
    const book = await makeBook(db, { active: false })
    await makeCopy(db, { book })

    await expect(service.createReservation(db, clock, teacherId, input(book.id, 1))).rejects.toThrow(
      'Livro não encontrado',
    )
    await expect(service.createReservation(db, clock, teacherId, input(9999, 1))).rejects.toThrow(
      'Livro não encontrado',
    )
  })
})

describe('US10 Cancelar reserva', () => {
  it('[US10-CA4] professora cancela antes da data e o exemplar volta a ficar disponível', async () => {
    const { book } = await bookWithCopies(2)
    const r = await service.createReservation(db, clock, teacherId, input(book.id, 2))

    await service.cancelReservation(db, fixedClock('2026-03-19'), teacherId, r.id)

    const [saved] = await db.select().from(classReservations).where(eq(classReservations.id, r.id))
    expect(saved!.status).toBe('cancelada')
    expect(saved!.cancelledAt).not.toBeNull()
    expect(await service.availableForDate(db, clock, book.id, DATE)).toBe(2)
  })

  it('[US10-CA4] não cancela no dia da atividade', async () => {
    const { book } = await bookWithCopies(2)
    const r = await service.createReservation(db, clock, teacherId, input(book.id, 1))

    await expect(service.cancelReservation(db, fixedClock(DATE), teacherId, r.id)).rejects.toMatchObject({
      code: 'RESERVATION_TOO_LATE',
    })
  })

  it('[US10-CA4] outra professora não cancela a reserva', async () => {
    const other = await makeUser(db, { role: 'professor' })
    const { book } = await bookWithCopies(2)
    const r = await service.createReservation(db, clock, teacherId, input(book.id, 1))

    await expect(service.cancelReservation(db, clock, other.id, r.id)).rejects.toBeInstanceOf(ForbiddenError)
  })

  it('não cancela duas vezes nem reserva inexistente', async () => {
    const { book } = await bookWithCopies(2)
    const r = await service.createReservation(db, clock, teacherId, input(book.id, 1))
    await service.cancelReservation(db, clock, teacherId, r.id)

    await expect(service.cancelReservation(db, clock, teacherId, r.id)).rejects.toMatchObject({
      code: 'RESERVATION_NOT_ACTIVE',
    })
    await expect(service.cancelReservation(db, clock, teacherId, 999)).rejects.toThrow(
      'Reserva não encontrado',
    )
  })

  it('registra o cancelamento no histórico', async () => {
    const { book } = await bookWithCopies(2)
    const r = await service.createReservation(db, clock, teacherId, input(book.id, 1))

    await service.cancelReservation(db, clock, teacherId, r.id)

    const logs = await db.select().from(auditLog)
    expect(logs.map((l) => l.action)).toEqual(['reserva_turma.criar', 'reserva_turma.cancelar'])
  })
})

describe('US10 Listas', () => {
  it('[US10-CA3] bibliotecária vê as reservas ativas do dia, com professora e turma', async () => {
    const { book } = await bookWithCopies(5)
    await service.createReservation(db, clock, teacherId, input(book.id, 2))
    const outro = await service.createReservation(db, clock, teacherId, {
      ...input(book.id, 1),
      className: '4B',
    })
    await service.cancelReservation(db, clock, teacherId, outro.id)
    await service.createReservation(db, clock, teacherId, input(book.id, 1, '2026-03-21'))

    const day = await service.listReservationsForDay(db, DATE)

    expect(day).toEqual([
      expect.objectContaining({
        bookTitle: 'Meu Pé de Laranja Lima',
        className: '5A',
        quantity: 2,
        teacherName: 'Genilse',
      }),
    ])
  })

  it('professora vê só as próprias reservas de hoje em diante', async () => {
    const other = await makeUser(db, { role: 'professor' })
    const { book } = await bookWithCopies(5)
    await service.createReservation(db, clock, teacherId, input(book.id, 1, '2026-03-12'))
    await service.createReservation(db, clock, other.id, input(book.id, 1))
    await makeClassReservation(db, { teacher: { id: teacherId } as never, book, activityDate: '2026-03-01' })

    const mine = await service.listTeacherReservations(db, clock, teacherId)

    expect(mine.map((r) => r.activityDate)).toEqual(['2026-03-12'])
  })

  it('lista só livros ativos para reservar', async () => {
    await makeBook(db, { title: 'B ativo' })
    await makeBook(db, { title: 'A inativo', active: false })

    expect((await service.listBooksForReservation(db)).map((b) => b.title)).toEqual(['B ativo'])
  })
})
