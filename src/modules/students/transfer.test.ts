import { eq } from 'drizzle-orm'
import { createTestDb, type TestDb } from '@tests/support/db'
import { setTestDeps } from '@tests/support/deps'
import { asSession, makeBook, makeCopy, makeLoan, makeStudent, makeUser } from '@tests/factories'
import { fakeUser, loginAs, rolesExcept } from '@tests/support/session'
import { auditLog, students } from '@/db/schema'
import { fixedClock } from '@/lib/clock'
import { idle } from '@/lib/action'
import * as loanService from '@/modules/loans/service'
import { markTransferredAction } from './actions'
import * as service from './service'

const clock = fixedClock('2026-03-10')

let db: TestDb
let userId: number
beforeEach(async () => {
  db = await createTestDb()
  userId = (await makeUser(db)).id
  setTestDeps({ db, clock })
})

async function studentWithBooks() {
  const student = await makeStudent(db, { name: 'Raissa' })
  const book = await makeBook(db, { title: 'O Pequeno Príncipe' })
  await makeLoan(db, { student, copy: await makeCopy(db, { book, code: 'PP-2' }), dueDate: '2026-03-20' })
  await makeLoan(db, { student, copy: await makeCopy(db, { book, code: 'PP-1' }), dueDate: '2026-03-07' })
  await makeLoan(db, { student, returnedAt: new Date('2026-03-01T13:00:00Z') })
  return student
}

describe('US06 Alerta de aluno transferido', () => {
  it('[US06-CA1] ao marcar como transferido, mostra os livros ainda pendentes com o aluno', async () => {
    const student = await studentWithBooks()

    const result = await service.markTransferred(db, clock, userId, student.id)

    expect(result.student).toMatchObject({ status: 'transferido', transferredAt: clock.now() })
    expect(result.pending).toEqual([
      expect.objectContaining({
        copyCode: 'PP-1',
        bookTitle: 'O Pequeno Príncipe',
        dueDate: '2026-03-07',
        daysLate: 3,
      }),
      expect.objectContaining({ copyCode: 'PP-2', dueDate: '2026-03-20', daysLate: 0 }),
    ])
  })

  it('[US06-CA1] aluno sem livro pendente é transferido sem alerta', async () => {
    const student = await makeStudent(db)

    const result = await service.markTransferred(db, clock, userId, student.id)

    expect(result.pending).toEqual([])
  })

  it('[US03-CA3] grava no histórico quem transferiu e quais livros ficaram pendentes', async () => {
    const student = await studentWithBooks()

    await service.markTransferred(db, clock, userId, student.id)

    const [log] = await db.select().from(auditLog)
    expect(log).toMatchObject({
      userId,
      action: 'aluno.transferir',
      entity: 'student',
      entityId: student.id,
      payload: { pendentes: ['PP-1', 'PP-2'] },
    })
  })

  it('não transfere duas vezes nem aluno inexistente', async () => {
    const student = await makeStudent(db, { status: 'transferido' })

    await expect(service.markTransferred(db, clock, userId, student.id)).rejects.toMatchObject({
      code: 'STUDENT_ALREADY_TRANSFERRED',
    })
    await expect(service.markTransferred(db, clock, userId, 999)).rejects.toThrow('Aluno não encontrado')
    expect(await db.select().from(auditLog)).toHaveLength(0)
  })

  it('[US06-CA2] depois de transferido, o aluno não pega novo empréstimo', async () => {
    const student = await makeStudent(db)
    const copy = await makeCopy(db)
    await service.markTransferred(db, clock, userId, student.id)

    await expect(
      loanService.registerLoan(db, clock, userId, { studentId: student.id, copyId: copy.id }),
    ).rejects.toMatchObject({ message: 'Aluno transferido não pode pegar livros.' })
  })

  it('[US06-CA3] pendências de transferidos continuam na consulta até a devolução', async () => {
    const student = await studentWithBooks()
    await makeLoan(db, { student: await makeStudent(db, { name: 'Ativo' }) })
    await makeStudent(db, { name: 'Transferido sem pendência', status: 'transferido' })
    await service.markTransferred(db, clock, userId, student.id)

    const before = await service.transferredWithPending(db, clock)
    const [loan] = before[0]!.pending
    await loanService.registerReturn(db, clock, userId, { loanId: loan!.loanId, condition: 'ok' })
    const after = await service.transferredWithPending(db, clock)

    expect(before).toEqual([
      expect.objectContaining({
        studentId: student.id,
        name: 'Raissa',
        pending: [
          expect.objectContaining({ copyCode: 'PP-1' }),
          expect.objectContaining({ copyCode: 'PP-2' }),
        ],
      }),
    ])
    expect(after[0]!.pending.map((p) => p.copyCode)).toEqual(['PP-2'])
  })

  it('[US06-CA3] devolvido o último livro, o aluno sai da lista', async () => {
    const student = await makeStudent(db)
    const loan = await makeLoan(db, { student })
    await service.markTransferred(db, clock, userId, student.id)

    await loanService.registerReturn(db, clock, userId, { loanId: loan.id, condition: 'perdido' })

    expect(await service.transferredWithPending(db, clock)).toEqual([])
  })
})

describe('US06 Transferência — Server Action', () => {
  it('[US03-CA1] sem sessão não transfere', async () => {
    const student = await makeStudent(db)
    const form = new FormData()
    form.set('studentId', String(student.id))

    const result = await markTransferredAction(idle, form)

    expect(result).toEqual({ status: 'error', message: 'É preciso entrar no sistema.' })
    const [row] = await db.select().from(students).where(eq(students.id, student.id))
    expect(row?.status).toBe('ativo')
  })

  it.each(rolesExcept('bibliotecaria'))('[US03-CA2] perfil %s não transfere aluno', async (role) => {
    loginAs(fakeUser(role))
    const form = new FormData()
    form.set('studentId', '1')

    expect(await markTransferredAction(idle, form)).toEqual({
      status: 'error',
      message: 'Seu perfil não tem acesso a esta função.',
    })
  })

  it('[US06-CA1] bibliotecária transfere e recebe os pendentes', async () => {
    loginAs(asSession(await makeUser(db)))
    const student = await studentWithBooks()
    const form = new FormData()
    form.set('studentId', String(student.id))

    const result = await markTransferredAction(idle, form)

    expect(result).toMatchObject({
      status: 'ok',
      message: 'Aluno marcado como transferido.',
      data: { pending: [{ copyCode: 'PP-1' }, { copyCode: 'PP-2' }] },
    })
  })

  it('sem aluno informado', async () => {
    loginAs(asSession(await makeUser(db)))

    expect(await markTransferredAction(idle, new FormData())).toEqual({
      status: 'error',
      message: 'Aluno não informado.',
    })
  })
})
