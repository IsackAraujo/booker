import { createTestDb, type TestDb } from '@tests/support/db'
import { makeCopy, makeStudent, makeUser } from '@tests/factories'
import { auditLog } from '@/db/schema'
import { fixedClock } from '@/lib/clock'
import { registerLoan, registerReturn } from '@/modules/loans/service'
import { actionLabel, defaultHistoryPeriod, history, historyUsers, parseHistoryFilter } from './history'

let db: TestDb
beforeEach(async () => {
  db = await createTestDb()
})

describe('T3.3 Histórico de operações — filtro', () => {
  it('período padrão: últimos 7 dias', () => {
    expect(defaultHistoryPeriod('2026-11-24')).toEqual({ from: '2026-11-18', to: '2026-11-24' })
  })

  it('lê período e usuário da URL; datas invertidas são trocadas; lixo vira padrão', () => {
    expect(parseHistoryFilter({ de: '2026-11-20', ate: '2026-11-10', usuario: '3' }, '2026-11-24')).toEqual({
      from: '2026-11-10',
      to: '2026-11-20',
      userId: 3,
    })
    expect(parseHistoryFilter({ de: 'x', usuario: 'abc' }, '2026-11-24')).toEqual({
      from: '2026-11-18',
      to: '2026-11-24',
      userId: undefined,
    })
  })

  it('nomes legíveis das operações; desconhecida aparece como está', () => {
    expect(actionLabel('emprestimo.registrar')).toBe('Registrou empréstimo')
    expect(actionLabel('algo.novo')).toBe('algo.novo')
  })
})

describe('T3.2 / T3.3 Histórico de empréstimos e devoluções', () => {
  it('[US03-CA3] empréstimo e devolução registram quem fez, com data e hora', async () => {
    const roseli = await makeUser(db, { name: 'Roseli' })
    const sandra = await makeUser(db, { name: 'Sandra (substituta)' })
    const copy = await makeCopy(db, { code: 'H-1' })
    const student = await makeStudent(db)
    const loan = await registerLoan(db, fixedClock('2026-11-20', '09:15'), roseli.id, {
      studentId: student.id,
      copyId: copy.id,
    })
    await registerReturn(db, fixedClock('2026-11-22', '14:30'), sandra.id, {
      loanId: loan.loanId,
      condition: 'ok',
    })

    const rows = await history(db, { from: '2026-11-18', to: '2026-11-24' })

    expect(rows.map((r) => [r.actionLabel, r.userName, r.createdAt.toISOString()])).toEqual([
      ['Registrou devolução', 'Sandra (substituta)', expect.any(String)],
      ['Registrou empréstimo', 'Roseli', expect.any(String)],
    ])
    expect(rows[1]!.payload).toMatchObject({ copyCode: 'H-1' })
  })

  it('[US03-CA4] filtra por período (dias no fuso da escola) e por usuário', async () => {
    const a = await makeUser(db, { name: 'A' })
    const b = await makeUser(db, { name: 'B' })
    await db.insert(auditLog).values([
      { userId: a.id, action: 'x', entity: 'x', createdAt: new Date('2026-11-20T02:59:00Z') }, // 19/11 23:59 SP
      { userId: a.id, action: 'dentro-a', entity: 'x', createdAt: new Date('2026-11-20T03:00:00Z') }, // 20/11 00:00 SP
      { userId: b.id, action: 'dentro-b', entity: 'x', createdAt: new Date('2026-11-21T12:00:00Z') },
      { userId: a.id, action: 'depois', entity: 'x', createdAt: new Date('2026-11-22T03:00:00Z') }, // 22/11 SP
    ])

    expect((await history(db, { from: '2026-11-20', to: '2026-11-21' })).map((r) => r.action)).toEqual([
      'dentro-b',
      'dentro-a',
    ])
    expect(
      (await history(db, { from: '2026-11-20', to: '2026-11-21', userId: a.id })).map((r) => r.action),
    ).toEqual(['dentro-a'])
  })

  it('limita a quantidade de linhas', async () => {
    const a = await makeUser(db)
    await db
      .insert(auditLog)
      .values(
        Array.from({ length: 5 }, (_, i) => ({
          userId: a.id,
          action: `a${i}`,
          entity: 'x',
          createdAt: new Date('2026-11-20T12:00:00Z'),
        })),
      )

    expect(await history(db, { from: '2026-11-20', to: '2026-11-20' }, 3)).toHaveLength(3)
  })

  it('lista usuários para o filtro, inclusive desativados', async () => {
    await makeUser(db, { name: 'Bia', active: false })
    await makeUser(db, { name: 'Ana' })

    expect((await historyUsers(db)).map((u) => u.name)).toEqual(['Ana', 'Bia'])
  })
})
