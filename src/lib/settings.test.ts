import { createTestDb, type TestDb } from '@tests/support/db'
import { makeSettings } from '@tests/factories'
import { settings } from '@/db/schema'
import { getSettings } from './settings'

let db: TestDb
beforeEach(async () => {
  db = await createTestDb()
})

describe('Parâmetros da escola', () => {
  it('cria os valores padrão na primeira leitura', async () => {
    const s = await getSettings(db)

    expect(s).toMatchObject({
      loanDays: 14,
      maxActiveLoans: 2,
      blockWhenOverdue: true,
      holdPickupDays: 2,
      reminderDaysBefore: 3,
    })
    expect(await db.select().from(settings)).toHaveLength(1)
  })

  it('devolve os valores configurados pela escola', async () => {
    await makeSettings(db, { loanDays: 7, maxActiveLoans: 3 })

    expect(await getSettings(db)).toMatchObject({ loanDays: 7, maxActiveLoans: 3 })
  })
})
