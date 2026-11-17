import { createTestDb, type TestDb } from '@tests/support/db'
import { setTestDeps } from '@tests/support/deps'
import { asSession, makeCopy, makeLoan, makeStudent, makeUser } from '@tests/factories'
import { fakeUser, loginAs, rolesExcept } from '@tests/support/session'
import { auditLog, loans } from '@/db/schema'
import { fixedClock } from '@/lib/clock'
import { idle } from '@/lib/action'
import { previewLoanAction, registerLoanAction, searchBorrowersAction, searchCopiesAction } from './actions'

let db: TestDb
beforeEach(async () => {
  db = await createTestDb()
  setTestDeps({ db, clock: fixedClock('2026-03-10') })
})

function formOf(fields: Record<string, string | number>) {
  const form = new FormData()
  for (const [k, v] of Object.entries(fields)) form.set(k, String(v))
  return form
}

describe('US04 Registrar empréstimo — Server Actions', () => {
  it('[US03-CA1] sem sessão não registra empréstimo', async () => {
    const copy = await makeCopy(db)
    const student = await makeStudent(db)

    const result = await registerLoanAction(idle, formOf({ studentId: student.id, copyId: copy.id }))

    expect(result).toEqual({ status: 'error', message: 'É preciso entrar no sistema.' })
    expect(await db.select().from(loans)).toHaveLength(0)
  })

  it.each(rolesExcept('bibliotecaria'))(
    '[US03-CA2] perfil %s não usa o balcão de empréstimo',
    async (role) => {
      loginAs(fakeUser(role))
      const deny = { status: 'error', message: 'Seu perfil não tem acesso a esta função.' }

      expect(await searchBorrowersAction(idle, formOf({ q: 'a' }))).toEqual(deny)
      expect(await searchCopiesAction(idle, formOf({ q: 'a' }))).toEqual(deny)
      expect(await previewLoanAction(idle, formOf({ studentId: 1, copyId: 1 }))).toEqual(deny)
      expect(await registerLoanAction(idle, formOf({ studentId: 1, copyId: 1 }))).toEqual(deny)
    },
  )

  it('[US04-CA2] bibliotecária busca, confere e registra o empréstimo', async () => {
    const user = await makeUser(db)
    loginAs(asSession(user))
    const copy = await makeCopy(db, { code: 'DC-1' })
    const student = await makeStudent(db, { name: 'Raissa' })

    const students = await searchBorrowersAction(idle, formOf({ q: 'raissa' }))
    const copies = await searchCopiesAction(idle, formOf({ q: 'dc-1' }))
    const preview = await previewLoanAction(idle, formOf({ studentId: student.id, copyId: copy.id }))
    const result = await registerLoanAction(idle, formOf({ studentId: student.id, copyId: copy.id }))

    expect(students).toMatchObject({ status: 'ok', data: [{ id: student.id }] })
    expect(copies).toMatchObject({ status: 'ok', data: [{ id: copy.id, unavailable: null }] })
    expect(preview).toMatchObject({ status: 'ok', data: { dueDate: '2026-03-24', check: { allowed: true } } })
    expect(result).toMatchObject({
      status: 'ok',
      message: 'Empréstimo registrado.',
      data: { dueDate: '2026-03-24', copyCode: 'DC-1', studentName: 'Raissa' },
    })
    const [log] = await db.select().from(auditLog)
    expect(log).toMatchObject({ userId: user.id, action: 'emprestimo.registrar' })
  })

  it('[US04-CA1] sem aluno ou sem exemplar mostra o que falta', async () => {
    loginAs(asSession(await makeUser(db)))
    const copy = await makeCopy(db)

    expect(await registerLoanAction(idle, formOf({ copyId: copy.id }))).toEqual({
      status: 'error',
      message: 'Identifique o aluno.',
    })
    expect(await registerLoanAction(idle, formOf({ studentId: 'abc', copyId: '' }))).toEqual({
      status: 'error',
      message: 'Identifique o aluno.',
    })
  })

  it('[US04-CA3] aluno em atraso: conferência avisa e o registro é recusado', async () => {
    loginAs(asSession(await makeUser(db)))
    const student = await makeStudent(db)
    await makeLoan(db, { student, dueDate: '2026-03-01' })
    const copy = await makeCopy(db)

    const preview = await previewLoanAction(idle, formOf({ studentId: student.id, copyId: copy.id }))
    const result = await registerLoanAction(idle, formOf({ studentId: student.id, copyId: copy.id }))

    expect(preview).toMatchObject({ status: 'ok', data: { check: { allowed: false } } })
    expect(result).toMatchObject({ status: 'error', message: expect.stringContaining('em atraso') })
  })
})
