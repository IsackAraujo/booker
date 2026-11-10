import { createTestDb, type TestDb } from '@tests/support/db'
import { makeUser } from '@tests/factories'
import { auditLog } from '@/db/schema'
import * as audit from './service'

let db: TestDb
beforeEach(async () => {
  db = await createTestDb()
})

describe('Auditoria', () => {
  it('[US03-CA3] registra quem fez a operação, com data e hora', async () => {
    const user = await makeUser(db)

    await audit.append(db, { userId: user.id, action: 'emprestimo.registrar', entity: 'loan', entityId: 7 })

    const [row] = await db.select().from(auditLog)
    expect(row).toMatchObject({
      userId: user.id,
      action: 'emprestimo.registrar',
      entity: 'loan',
      entityId: 7,
    })
    expect(row!.createdAt).toBeInstanceOf(Date)
  })

  it('não grava o log se a transação da operação falhar', async () => {
    const user = await makeUser(db)

    await expect(
      db.transaction(async (tx) => {
        await audit.append(tx, { userId: user.id, action: 'x', entity: 'y' })
        throw new Error('falhou')
      }),
    ).rejects.toThrow('falhou')

    expect(await db.select().from(auditLog)).toHaveLength(0)
  })

  it('[US03-CA4] lista por usuário', async () => {
    const roseli = await makeUser(db)
    const outra = await makeUser(db)
    await audit.append(db, { userId: roseli.id, action: 'a', entity: 'x' })
    await audit.append(db, { userId: outra.id, action: 'b', entity: 'x' })

    const rows = await audit.list(db, { userId: roseli.id })

    expect(rows.map((r) => r.action)).toEqual(['a'])
  })

  it('[US03-CA4] lista por período usando dias do fuso da escola', async () => {
    const user = await makeUser(db)
    await db.insert(auditLog).values([
      { userId: user.id, action: 'antes', entity: 'x', createdAt: new Date('2026-03-10T02:59:00Z') }, // 09/03 23:59 SP
      { userId: user.id, action: 'dentro', entity: 'x', createdAt: new Date('2026-03-10T03:00:00Z') }, // 10/03 00:00 SP
      { userId: user.id, action: 'fim', entity: 'x', createdAt: new Date('2026-03-11T02:59:00Z') }, // 10/03 23:59 SP
      { userId: user.id, action: 'depois', entity: 'x', createdAt: new Date('2026-03-11T03:00:00Z') }, // 11/03 00:00 SP
    ])

    const rows = await audit.list(db, { from: '2026-03-10', to: '2026-03-10' })

    expect(rows.map((r) => r.action).sort()).toEqual(['dentro', 'fim'])
  })
})
