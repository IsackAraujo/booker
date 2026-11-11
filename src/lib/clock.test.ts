import { fixedClock, toSchoolDate } from './clock'

describe('clock', () => {
  it('fixedClock devolve a data pedida e um instante no fuso da escola', () => {
    const clock = fixedClock('2026-03-10', '10:00')

    expect(clock.today()).toBe('2026-03-10')
    expect(clock.now().toISOString()).toBe('2026-03-10T13:00:00.000Z')
  })

  it('toSchoolDate usa o fuso de São Paulo, não UTC', () => {
    // 01h UTC do dia 11 ainda é dia 10 em São Paulo (UTC-3).
    expect(toSchoolDate(new Date('2026-03-11T01:00:00Z'))).toBe('2026-03-10')
  })
})
