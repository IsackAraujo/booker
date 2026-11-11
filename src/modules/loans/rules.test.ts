import { copyStatusAfterReturn, daysLate, isLate } from './rules'

describe('US05 Registrar devolução — regras', () => {
  it.each([
    ['2026-03-16', '2026-03-15', false, 0, 'antes do prazo'],
    ['2026-03-16', '2026-03-16', false, 0, 'no dia do prazo'],
    ['2026-03-16', '2026-03-17', true, 1, 'um dia depois'],
    ['2026-03-31', '2026-04-02', true, 2, 'virada de mês'],
    ['2026-12-30', '2027-01-04', true, 5, 'virada de ano'],
    ['2026-03-13', '2026-03-16', true, 3, 'prazo na sexta, devolução na segunda'],
  ])('[US05-CA3] prazo %s, devolução %s → atraso=%s (%s dias, %s)', (due, returned, late, days) => {
    expect(isLate(due, returned)).toBe(late)
    expect(daysLate(due, returned)).toBe(days)
  })

  it.each([
    ['ok', 'disponivel'],
    ['perdido', 'perdido'],
    ['danificado', 'danificado'],
  ] as const)('[US05-CA4] devolução %s deixa o exemplar %s', (condition, status) => {
    expect(copyStatusAfterReturn(condition)).toBe(status)
  })
})
