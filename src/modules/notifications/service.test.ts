import { createTestDb, type TestDb } from '@tests/support/db'
import { makeBook, makeCopy, makeLoan, makeStudent, makeUser } from '@tests/factories'
import { auditLog, notifications } from '@/db/schema'
import { fixedClock } from '@/lib/clock'
import { overdueNoticeText } from './rules'
import { FakeMessageSender } from './sender'
import * as service from './service'

const clock = fixedClock('2026-03-20')

let db: TestDb
let userId: number
beforeEach(async () => {
  db = await createTestDb()
  userId = (await makeUser(db)).id
})

async function overdueLoan(opts: { name: string; className: string; title: string; dueDate: string }) {
  const book = await makeBook(db, { title: opts.title })
  const copy = await makeCopy(db, { book })
  const student = await makeStudent(db, { name: opts.name, className: opts.className })
  return makeLoan(db, { student, copy, dueDate: opts.dueDate })
}

describe('US08 Lista de atrasos', () => {
  it('[US08-CA1] mostra aluno, turma, título e dias de atraso', async () => {
    const loan = await overdueLoan({
      name: 'Raissa',
      className: '5A',
      title: 'Dom Casmurro',
      dueDate: '2026-03-15',
    })

    const list = await service.listOverdue(db, clock)

    expect(list).toEqual([
      expect.objectContaining({
        loanId: loan.id,
        studentName: 'Raissa',
        className: '5A',
        bookTitle: 'Dom Casmurro',
        daysLate: 5,
        lastNoticeAt: null,
      }),
    ])
  })

  it('não lista empréstimo que vence hoje nem no futuro', async () => {
    await overdueLoan({ name: 'Hoje', className: '5A', title: 'A', dueDate: '2026-03-20' })
    await overdueLoan({ name: 'Futuro', className: '5A', title: 'B', dueDate: '2026-03-25' })
    await overdueLoan({ name: 'Ontem', className: '5A', title: 'C', dueDate: '2026-03-19' })

    const list = await service.listOverdue(db, clock)

    expect(list.map((l) => [l.studentName, l.daysLate])).toEqual([['Ontem', 1]])
  })

  it('[US08-CA5] empréstimo devolvido não aparece na lista', async () => {
    await overdueLoan({ name: 'Ativo', className: '5A', title: 'A', dueDate: '2026-03-10' })
    await makeLoan(db, { dueDate: '2026-03-10', returnedAt: new Date('2026-03-19T12:00:00Z') })

    const list = await service.listOverdue(db, clock)

    expect(list.map((l) => l.studentName)).toEqual(['Ativo'])
  })

  it('ordena do mais atrasado para o menos atrasado', async () => {
    await overdueLoan({ name: 'Pouco', className: '5A', title: 'A', dueDate: '2026-03-18' })
    await overdueLoan({ name: 'Muito', className: '5B', title: 'B', dueDate: '2026-02-28' })

    const list = await service.listOverdue(db, clock)

    expect(list.map((l) => l.studentName)).toEqual(['Muito', 'Pouco'])
  })

  it('[US08-CA2] filtra por turma, sem diferenciar maiúsculas', async () => {
    await overdueLoan({ name: 'Ana', className: '5A', title: 'A', dueDate: '2026-03-10' })
    await overdueLoan({ name: 'Bia', className: '6B', title: 'B', dueDate: '2026-03-10' })

    expect((await service.listOverdue(db, clock, { className: '6b' })).map((l) => l.studentName)).toEqual([
      'Bia',
    ])
    expect(await service.overdueClasses(db, clock)).toEqual(['5A', '6B'])
  })
})

describe('US08 Aviso ao responsável', () => {
  it('[US08-CA3] envia aviso para um aluno específico, para o telefone do responsável', async () => {
    const student = await makeStudent(db, { name: 'Raissa', guardianPhone: '+5551988887777' })
    const book = await makeBook(db, { title: 'Dom Casmurro' })
    const loan = await makeLoan(db, { student, copy: await makeCopy(db, { book }), dueDate: '2026-03-15' })
    await overdueLoan({ name: 'Outro', className: '5A', title: 'X', dueDate: '2026-03-15' })
    const sender = new FakeMessageSender()

    const result = await service.sendOverdueNotices(db, clock, sender, userId, [loan.id])

    expect(result).toEqual({ sent: 1, failed: [], skipped: 0 })
    expect(sender.sent).toEqual([
      {
        to: '+5551988887777',
        body: overdueNoticeText({
          studentName: 'Raissa',
          bookTitle: 'Dom Casmurro',
          dueDate: '2026-03-15',
          daysLate: 5,
        }),
      },
    ])
  })

  it('[US08-CA3] envia aviso para todos os atrasados da lista', async () => {
    const a = await overdueLoan({ name: 'Ana', className: '5A', title: 'A', dueDate: '2026-03-10' })
    const b = await overdueLoan({ name: 'Bia', className: '5A', title: 'B', dueDate: '2026-03-12' })
    const sender = new FakeMessageSender()

    const result = await service.sendOverdueNotices(db, clock, sender, userId, [a.id, b.id, a.id])

    expect(result.sent).toBe(2)
    expect(sender.sent).toHaveLength(2)
  })

  it('[US08-CA4] cada aviso fica registrado com a data e aparece na lista como último aviso', async () => {
    const loan = await overdueLoan({ name: 'Ana', className: '5A', title: 'A', dueDate: '2026-03-10' })

    await service.sendOverdueNotices(db, clock, new FakeMessageSender(), userId, [loan.id])

    const [n] = await db.select().from(notifications)
    expect(n).toMatchObject({ kind: 'cobranca', loanId: loan.id, status: 'enviado', createdBy: userId })
    expect(n!.createdAt.toISOString()).toBe('2026-03-20T13:00:00.000Z')
    const [row] = await service.listOverdue(db, clock)
    expect(row!.lastNoticeAt?.toISOString()).toBe('2026-03-20T13:00:00.000Z')
  })

  it('[US08-CA4] falha de envio fica registrada e é informada, sem impedir os demais', async () => {
    const a = await overdueLoan({ name: 'Ana', className: '5A', title: 'A', dueDate: '2026-03-10' })
    const b = await overdueLoan({ name: 'Bia', className: '5A', title: 'B', dueDate: '2026-03-12' })
    const sender = new FakeMessageSender()
    sender.failNext('número sem WhatsApp')

    const result = await service.sendOverdueNotices(db, clock, sender, userId, [a.id, b.id])

    expect(result.sent).toBe(1)
    expect(result.failed).toEqual([{ loanId: a.id, studentName: 'Ana', error: 'número sem WhatsApp' }])
    const rows = await db.select().from(notifications)
    expect(rows.map((r) => [r.loanId, r.status, r.error])).toEqual([
      [a.id, 'falhou', 'número sem WhatsApp'],
      [b.id, 'enviado', null],
    ])
    const [row] = (await service.listOverdue(db, clock)).filter((l) => l.loanId === a.id)
    expect(row!.lastNoticeAt).toBeNull()
  })

  it('[US08-CA5] não cobra empréstimo já devolvido nem ainda no prazo', async () => {
    const devolvido = await makeLoan(db, {
      dueDate: '2026-03-10',
      returnedAt: new Date('2026-03-19T12:00:00Z'),
    })
    const noPrazo = await makeLoan(db, { dueDate: '2026-03-25' })
    const sender = new FakeMessageSender()

    const result = await service.sendOverdueNotices(db, clock, sender, userId, [devolvido.id, noPrazo.id])

    expect(result).toEqual({ sent: 0, failed: [], skipped: 2 })
    expect(sender.sent).toHaveLength(0)
    expect(await db.select().from(notifications)).toHaveLength(0)
  })

  it('sem empréstimo selecionado não envia', async () => {
    await expect(
      service.sendOverdueNotices(db, clock, new FakeMessageSender(), userId, []),
    ).rejects.toMatchObject({
      code: 'NOTICE_EMPTY',
    })
  })

  it('registra a cobrança no histórico', async () => {
    const loan = await overdueLoan({ name: 'Ana', className: '5A', title: 'A', dueDate: '2026-03-10' })

    await service.sendOverdueNotices(db, clock, new FakeMessageSender(), userId, [loan.id])

    const [log] = await db.select().from(auditLog)
    expect(log).toMatchObject({
      userId,
      action: 'cobranca.enviar',
      payload: { loanIds: [loan.id], sent: 1, failed: 0 },
    })
  })

  it('histórico de avisos do empréstimo', async () => {
    const loan = await overdueLoan({ name: 'Ana', className: '5A', title: 'A', dueDate: '2026-03-10' })
    await service.sendOverdueNotices(db, clock, new FakeMessageSender(), userId, [loan.id])
    await service.sendOverdueNotices(db, fixedClock('2026-03-23'), new FakeMessageSender(), userId, [loan.id])

    const notices = await service.noticesForLoan(db, loan.id)

    expect(notices.map((n) => n.createdAt.toISOString())).toEqual([
      '2026-03-23T13:00:00.000Z',
      '2026-03-20T13:00:00.000Z',
    ])
  })
})
