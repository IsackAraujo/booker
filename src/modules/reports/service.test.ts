import { createTestDb, type TestDb } from '@tests/support/db'
import { makeBook, makeCopy, makeLoan, makeStudent } from '@tests/factories'
import { fixedClock } from '@/lib/clock'
import * as service from './service'

const clock = fixedClock('2026-03-18')
const MARCH = { from: '2026-03-01', to: '2026-03-18' }
const at = (iso: string, time = '10:00') => new Date(`${iso}T${time}:00-03:00`)

let db: TestDb
beforeEach(async () => {
  db = await createTestDb()
})

async function loanFor(className: string, over: Parameters<typeof makeLoan>[1] = {}) {
  const student = await makeStudent(db, { className })
  return makeLoan(db, { student, ...over })
}

describe('US13 Painel — totais', () => {
  it('[US13-CA1] disponíveis: exemplares disponíveis agora', async () => {
    const book = await makeBook(db)
    await makeCopy(db, { book })
    await makeCopy(db, { book })
    await makeCopy(db, { book, status: 'perdido' })
    await makeLoan(db) // cria um exemplar emprestado

    expect((await service.dashboardTotals(db, clock, MARCH)).disponiveis).toBe(2)
  })

  it('[US13-CA1] [US13-CA2] emprestados: empréstimos feitos no período (limites no fuso da escola)', async () => {
    await loanFor('5A', { loanedAt: at('2026-03-01', '00:00') })
    await loanFor('5A', { loanedAt: at('2026-03-18', '23:59') })
    await loanFor('5A', { loanedAt: at('2026-02-28', '23:59') })
    await loanFor('5A', { loanedAt: at('2026-03-19', '00:00') })

    expect((await service.dashboardTotals(db, clock, MARCH)).emprestados).toBe(2)
  })

  it('[US13-CA1] atrasados: prazo no período, devolvido com atraso ou ainda vencido', async () => {
    await loanFor('5A', { dueDate: '2026-03-10' }) // aberto e vencido
    await loanFor('5A', { dueDate: '2026-03-05', returnedAt: at('2026-03-07'), returnedLate: true })
    await loanFor('5A', { dueDate: '2026-03-05', returnedAt: at('2026-03-05'), returnedLate: false })
    await loanFor('5A', { dueDate: '2026-03-25' }) // prazo fora do período
    await loanFor('5A', { dueDate: '2026-03-18' }) // vence hoje: ainda não atrasado

    expect((await service.dashboardTotals(db, clock, MARCH)).atrasados).toBe(2)
  })

  it('[US13-CA1] perdidos: devoluções registradas como perdido no período', async () => {
    await loanFor('5A', { returnedAt: at('2026-03-10'), returnCondition: 'perdido' })
    await loanFor('5A', { returnedAt: at('2026-02-10'), returnCondition: 'perdido' })
    await loanFor('5A', { returnedAt: at('2026-03-10'), returnCondition: 'danificado' })

    expect((await service.dashboardTotals(db, clock, MARCH)).perdidos).toBe(1)
  })

  it('[US13-CA2] turma filtra emprestados, atrasados e perdidos (disponíveis não dependem de turma)', async () => {
    await makeCopy(db)
    await loanFor('5A', { loanedAt: at('2026-03-02'), dueDate: '2026-03-10' })
    await loanFor('6B', { loanedAt: at('2026-03-02'), dueDate: '2026-03-10' })
    await loanFor('6B', {
      copy: await makeCopy(db, { status: 'perdido' }),
      loanedAt: at('2026-03-02'),
      returnedAt: at('2026-03-09'),
      returnCondition: 'perdido',
    })

    expect(await service.dashboardTotals(db, clock, { ...MARCH, className: '6B' })).toEqual({
      disponiveis: 1,
      emprestados: 2,
      atrasados: 1,
      perdidos: 1,
    })
  })
})

describe('US13 Painel — relação de cada total', () => {
  it('[US13-CA3] lista os exemplares que compõem o total, com os mesmos critérios', async () => {
    const book = await makeBook(db, { title: 'Iracema' })
    const copy = await makeCopy(db, { book, code: 'IR-1' })
    const student = await makeStudent(db, { name: 'Raissa', className: '5A' })
    await makeLoan(db, { copy, student, loanedAt: at('2026-03-02'), dueDate: '2026-03-10' })
    await loanFor('6B', { loanedAt: at('2026-03-02'), dueDate: '2026-03-25' })

    for (const kind of ['emprestados', 'atrasados', 'perdidos', 'disponiveis'] as const) {
      const totals = await service.dashboardTotals(db, clock, MARCH)
      const rows = await service.dashboardDetails(db, clock, kind, MARCH)
      expect(rows, kind).toHaveLength(totals[kind])
    }
    const [late] = await service.dashboardDetails(db, clock, 'atrasados', MARCH)
    expect(late).toMatchObject({
      copyCode: 'IR-1',
      bookTitle: 'Iracema',
      studentName: 'Raissa',
      className: '5A',
      dueDate: '2026-03-10',
    })
  })

  it('[US13-CA3] relação de disponíveis traz exemplar e título', async () => {
    await makeCopy(db, { book: await makeBook(db, { title: 'Iracema' }), code: 'IR-9' })

    expect(await service.dashboardDetails(db, clock, 'disponiveis', MARCH)).toEqual([
      expect.objectContaining({ copyCode: 'IR-9', bookTitle: 'Iracema', studentName: null }),
    ])
  })

  it('lista as turmas para o filtro', async () => {
    await makeStudent(db, { className: '6B' })
    await makeStudent(db, { className: '5A' })
    await makeStudent(db, { className: '5A' })

    expect(await service.allClasses(db)).toEqual(['5A', '6B'])
  })
})
