import { createTestDb, type TestDb } from '@tests/support/db'
import { setTestDeps } from '@tests/support/deps'
import { makeCopy, makeLoan, makeStudent } from '@tests/factories'
import { fakeUser, loginAs } from '@tests/support/session'
import { fixedClock } from '@/lib/clock'
import { ForbiddenError, UnauthenticatedError } from '@/lib/errors'
import { loadDashboard } from './queries'

let db: TestDb
beforeEach(async () => {
  db = await createTestDb()
  setTestDeps({ db, clock: fixedClock('2026-03-18') })
})

describe('US13 Painel — acesso e carregamento', () => {
  it.each(['coordenacao', 'bibliotecaria'] as const)('[US13-CA4] perfil %s acessa o painel', async (role) => {
    loginAs(fakeUser(role))
    await makeCopy(db)

    const data = await loadDashboard({})

    expect(data.totals.disponiveis).toBe(1)
    expect(data.filter).toMatchObject({ from: '2026-03-01', to: '2026-03-18' })
    expect(data.details).toBeNull()
  })

  it('[US13-CA4] professor não acessa o painel', async () => {
    loginAs(fakeUser('professor'))

    await expect(loadDashboard({})).rejects.toBeInstanceOf(ForbiddenError)
  })

  it('[US03-CA1] sem sessão não acessa', async () => {
    await expect(loadDashboard({})).rejects.toBeInstanceOf(UnauthenticatedError)
  })

  it('[US13-CA2] [US13-CA3] aplica filtro e traz a relação pedida', async () => {
    loginAs(fakeUser('coordenacao'))
    const student = await makeStudent(db, { className: '5A' })
    await makeLoan(db, { student, loanedAt: new Date('2026-03-05T13:00:00Z'), dueDate: '2026-03-10' })
    await makeLoan(db, { loanedAt: new Date('2026-03-05T13:00:00Z'), dueDate: '2026-03-10' }) // aluno padrão, turma 5A
    const other = await makeStudent(db, { className: '9Z' })
    await makeLoan(db, { student: other, loanedAt: new Date('2026-03-05T13:00:00Z'), dueDate: '2026-03-10' })

    const data = await loadDashboard({ turma: '9z', ver: 'atrasados' })

    expect(data.totals.atrasados).toBe(1)
    expect(data.kind).toBe('atrasados')
    expect(data.details).toHaveLength(1)
    expect(data.classes).toEqual(['5A', '9Z'])
  })

  it('tipo de relação desconhecido é ignorado', async () => {
    loginAs(fakeUser('coordenacao'))

    expect((await loadDashboard({ ver: 'qualquer' })).kind).toBeNull()
  })
})
