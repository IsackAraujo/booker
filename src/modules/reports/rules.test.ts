import { defaultPeriod, isDashboardKind, parseFilter } from './rules'

const today = '2026-03-18'

describe('US13 Painel — filtro', () => {
  it('período padrão é do dia 1º do mês até hoje', () => {
    expect(defaultPeriod(today)).toEqual({ from: '2026-03-01', to: '2026-03-18' })
  })

  it('[US13-CA2] usa o período e a turma escolhidos', () => {
    expect(parseFilter({ de: '2026-02-01', ate: '2026-02-28', turma: ' 5a ' }, today)).toEqual({
      from: '2026-02-01',
      to: '2026-02-28',
      className: '5A',
    })
  })

  it('sem filtro usa o padrão e todas as turmas', () => {
    expect(parseFilter({}, today)).toEqual({ from: '2026-03-01', to: '2026-03-18', className: undefined })
  })

  it('datas inválidas voltam ao padrão', () => {
    expect(parseFilter({ de: '01/02/2026', ate: 'x' }, today)).toMatchObject({
      from: '2026-03-01',
      to: '2026-03-18',
    })
  })

  it('período invertido volta ao padrão com aviso', () => {
    expect(parseFilter({ de: '2026-03-10', ate: '2026-03-01' }, today)).toMatchObject({
      from: '2026-03-01',
      to: '2026-03-18',
      warning: expect.stringContaining('data inicial'),
    })
  })

  it('reconhece os tipos de total', () => {
    expect(isDashboardKind('atrasados')).toBe(true)
    expect(isDashboardKind('outro')).toBe(false)
    expect(isDashboardKind(undefined)).toBe(false)
  })
})
