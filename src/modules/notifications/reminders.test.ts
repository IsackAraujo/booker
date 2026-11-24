import { eq } from 'drizzle-orm'
import { createTestDb, type TestDb } from '@tests/support/db'
import { makeBook, makeCopy, makeLoan, makeSettings, makeStudent, makeUser } from '@tests/factories'
import { loans, notifications } from '@/db/schema'
import { fixedClock } from '@/lib/clock'
import { BusinessError } from '@/lib/errors'
import { listUnresolvedFailures, retryNotice, sendDueReminders } from './reminders'
import { reminderText, reminderWindow } from './rules'
import { FakeMessageSender } from './sender'
import { NO_TELEGRAM } from './service'

const TODAY = '2026-03-10' // terça; 3 dias antes de um prazo em 13/03 (sexta)
const clock = fixedClock(TODAY, '08:00')

let db: TestDb
let sender: FakeMessageSender
beforeEach(async () => {
  db = await createTestDb()
  sender = new FakeMessageSender()
  await makeSettings(db, { reminderDaysBefore: 3 })
})

async function loanDue(
  dueDate: string,
  over: { name?: string; chat?: string | null; returned?: boolean } = {},
) {
  const student = await makeStudent(db, {
    name: over.name ?? 'Raissa',
    telegramChatId: over.chat === undefined ? '700' : over.chat,
  })
  const copy = await makeCopy(db, { book: await makeBook(db, { title: 'O Cortiço' }) })
  return makeLoan(db, {
    student,
    copy,
    dueDate,
    returnedAt: over.returned ? new Date('2026-03-09T12:00:00Z') : undefined,
  })
}

describe('US07 Lembrete antes do prazo — regras', () => {
  it('[US07-CA2] texto traz aluno, título e data de devolução', () => {
    const text = reminderText({ studentName: 'Raissa', bookTitle: 'O Cortiço', dueDate: '2026-03-13' })

    expect(text).toContain('Raissa')
    expect(text).toContain('"O Cortiço"')
    expect(text).toContain('13/03/2026')
  })

  it.each([
    ['2026-03-10', 3, { from: '2026-03-11', to: '2026-03-13' }],
    ['2026-02-27', 3, { from: '2026-02-28', to: '2026-03-02' }],
    ['2026-12-30', 3, { from: '2026-12-31', to: '2027-01-02' }],
    ['2026-03-10', 0, { from: '2026-03-11', to: '2026-03-11' }],
  ])('[US07-CA1] janela de lembretes em %s com %i dias', (today, days, expected) => {
    expect(reminderWindow(today, days)).toEqual(expected)
  })
})

describe('US07 Rotina diária de lembretes (T7.2)', () => {
  it('[US07-CA1] [US07-CA2] envia 3 dias antes do prazo para o Telegram do responsável', async () => {
    const loan = await loanDue('2026-03-13')

    const result = await sendDueReminders(db, clock, sender)

    expect(result).toEqual({ sent: 1, failed: [], skipped: 0 })
    expect(sender.sent).toEqual([
      {
        to: '700',
        body: reminderText({ studentName: 'Raissa', bookTitle: 'O Cortiço', dueDate: '2026-03-13' }),
      },
    ])
    const [n] = await db.select().from(notifications)
    expect(n).toMatchObject({ kind: 'lembrete', loanId: loan.id, status: 'enviado', recipient: '700' })
  })

  it('[US07-CA1] uma única vez: a rotina do dia seguinte não repete', async () => {
    await loanDue('2026-03-13')
    await sendDueReminders(db, clock, sender)

    const next = await sendDueReminders(db, fixedClock('2026-03-11'), sender)

    expect(next.sent).toBe(0)
    expect(sender.sent).toHaveLength(1)
  })

  it('[US07-CA1] rodar duas vezes no mesmo dia não envia em dobro', async () => {
    await loanDue('2026-03-13')

    await sendDueReminders(db, clock, sender)
    await sendDueReminders(db, clock, sender)

    expect(sender.sent).toHaveLength(1)
  })

  it('[US07-CA1] não envia antes da hora nem para prazo de hoje ou vencido', async () => {
    await loanDue('2026-03-14') // 4 dias: ainda não
    await loanDue('2026-03-10') // vence hoje
    await loanDue('2026-03-05') // atrasado: é cobrança, não lembrete

    expect((await sendDueReminders(db, clock, sender)).sent).toBe(0)
  })

  it('se a rotina não rodou no dia certo, o lembrete sai no dia seguinte', async () => {
    await loanDue('2026-03-12') // o dia certo era 09/03

    expect((await sendDueReminders(db, clock, sender)).sent).toBe(1)
  })

  it('[US07-CA3] não envia para empréstimo já devolvido', async () => {
    await loanDue('2026-03-13', { returned: true })

    expect((await sendDueReminders(db, clock, sender)).sent).toBe(0)
    expect(sender.sent).toHaveLength(0)
  })

  it('respeita o número de dias configurado pela escola', async () => {
    await makeSettings(db, { reminderDaysBefore: 1 })
    await loanDue('2026-03-13')

    expect((await sendDueReminders(db, clock, sender)).sent).toBe(0)
  })

  it('[US07-CA4] falhas ficam registradas, não impedem os demais e são tentadas de novo no dia seguinte', async () => {
    const semVinculo = await loanDue('2026-03-13', { name: 'Ana', chat: null })
    const bloqueado = await loanDue('2026-03-13', { name: 'Bia' })
    await loanDue('2026-03-13', { name: 'Caio' })
    sender.failNext('O responsável bloqueou o bot')

    const result = await sendDueReminders(db, clock, sender)

    expect(result.sent).toBe(1)
    expect(result.failed).toEqual([
      { loanId: semVinculo.id, studentName: 'Ana', error: NO_TELEGRAM },
      { loanId: bloqueado.id, studentName: 'Bia', error: 'O responsável bloqueou o bot' },
    ])
    const again = await sendDueReminders(db, fixedClock('2026-03-11'), sender)
    expect(again.sent).toBe(1) // Bia
    expect(again.failed.map((f) => f.studentName)).toEqual(['Ana'])
  })
})

describe('US07 Avisos que falharam (CA4)', () => {
  it('lista a falha mais recente por empréstimo, com aluno, livro e motivo', async () => {
    const loan = await loanDue('2026-03-13', { name: 'Ana', chat: null })
    await sendDueReminders(db, clock, sender)
    await sendDueReminders(db, fixedClock('2026-03-11'), sender)

    const failures = await listUnresolvedFailures(db, fixedClock('2026-03-11'))

    expect(failures).toEqual([
      expect.objectContaining({
        kind: 'lembrete',
        loanId: loan.id,
        studentName: 'Ana',
        bookTitle: 'O Cortiço',
        error: NO_TELEGRAM,
      }),
    ])
  })

  it('some da lista quando um envio posterior dá certo ou o livro é devolvido', async () => {
    await loanDue('2026-03-13', { name: 'Ana' })
    await loanDue('2026-03-13', { name: 'Bia' })
    sender.failNext('x')
    sender.failNext('y')
    await sendDueReminders(db, clock, sender)
    expect(await listUnresolvedFailures(db, clock)).toHaveLength(2)

    await sendDueReminders(db, fixedClock('2026-03-11'), sender) // Ana e Bia dão certo agora
    expect(await listUnresolvedFailures(db, fixedClock('2026-03-11'))).toHaveLength(0)
  })

  it('reenvio manual de lembrete pela bibliotecária', async () => {
    const userId = (await makeUser(db)).id
    await loanDue('2026-03-13')
    sender.failNext('sem rede')
    await sendDueReminders(db, clock, sender)
    const [failure] = await listUnresolvedFailures(db, clock)

    expect(await retryNotice(db, clock, sender, userId, failure!.notificationId)).toEqual({ ok: true })
    expect(await listUnresolvedFailures(db, clock)).toHaveLength(0)
    await expect(retryNotice(db, clock, sender, userId, failure!.notificationId)).rejects.toThrow(
      'O lembrete deste empréstimo já foi enviado.',
    )
  })

  it('reenvio de lembrete de livro devolvido é recusado', async () => {
    const userId = (await makeUser(db)).id
    const loan = await loanDue('2026-03-13', { chat: null })
    await sendDueReminders(db, clock, sender)
    const [failure] = await listUnresolvedFailures(db, clock)
    await db
      .update(loans)
      .set({ returnedAt: new Date('2026-03-10T15:00:00Z') })
      .where(eq(loans.id, loan.id))

    await expect(retryNotice(db, clock, sender, userId, failure!.notificationId)).rejects.toBeInstanceOf(
      BusinessError,
    )
  })

  it('reenvio de cobrança usa o fluxo da US08', async () => {
    const userId = (await makeUser(db)).id
    const loan = await loanDue('2026-03-05')
    sender.failNext('sem rede')
    const { sendOverdueNotices } = await import('./service')
    await sendOverdueNotices(db, clock, sender, userId, [loan.id])
    const [failure] = await listUnresolvedFailures(db, clock)
    expect(failure!.kind).toBe('cobranca')

    expect(await retryNotice(db, clock, sender, userId, failure!.notificationId)).toEqual({ ok: true })
  })

  it('aviso inexistente', async () => {
    const userId = (await makeUser(db)).id

    await expect(retryNotice(db, clock, sender, userId, 999)).rejects.toThrow('Aviso não encontrado')
  })
})
