import { canBorrow, copyStatusAfterReturn, copyUnavailableReason, daysLate, dueDate, isLate } from './rules'

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

describe('US04 Registrar empréstimo — regras', () => {
  it.each([
    ['2026-03-10', 14, '2026-03-24', 'terça + 14 = terça (dia útil)'],
    ['2026-03-12', 2, '2026-03-16', 'cai no sábado → segunda'],
    ['2026-03-13', 2, '2026-03-16', 'cai no domingo → segunda'],
    ['2026-03-25', 7, '2026-04-01', 'virada de mês'],
    ['2026-12-21', 14, '2027-01-04', 'virada de ano'],
    ['2026-03-10', 0, '2026-03-10', 'prazo zero = mesmo dia'],
  ])('[US04-CA2] empréstimo em %s com %s dias vence em %s (%s)', (loanDate, days, expected) => {
    expect(dueDate(loanDate, days)).toBe(expected)
  })

  const policy = { maxActiveLoans: 2, blockWhenOverdue: true }
  const ok = { studentStatus: 'ativo' as const, activeLoans: 0, overdueLoans: 0 }

  it('[US04-CA3] aluno sem pendências pode pegar', () => {
    expect(canBorrow(ok, policy)).toEqual({ allowed: true, blocks: [], warnings: [] })
  })

  it('[US04-CA3] abaixo do limite pode pegar', () => {
    expect(canBorrow({ ...ok, activeLoans: 1 }, policy).allowed).toBe(true)
  })

  it('[US04-CA3] no limite de livros é bloqueado com aviso', () => {
    const check = canBorrow({ ...ok, activeLoans: 2 }, policy)

    expect(check.allowed).toBe(false)
    expect(check.blocks).toEqual(['Aluno já está com 2 livros (limite da escola: 2 livros).'])
  })

  it('[US04-CA3] em atraso é bloqueado quando a escola bloqueia por atraso', () => {
    const check = canBorrow({ ...ok, activeLoans: 1, overdueLoans: 1 }, policy)

    expect(check).toEqual({
      allowed: false,
      blocks: ['Aluno com 1 livro em atraso. Regularize a devolução antes de um novo empréstimo.'],
      warnings: [],
    })
  })

  it('[US04-CA3] em atraso só avisa quando a escola não bloqueia', () => {
    const check = canBorrow(
      { ...ok, activeLoans: 1, overdueLoans: 1 },
      { ...policy, blockWhenOverdue: false },
    )

    expect(check).toEqual({ allowed: true, blocks: [], warnings: ['Aluno com 1 livro em atraso.'] })
  })

  it('[US04-CA3] mostra todos os motivos juntos', () => {
    const check = canBorrow(
      { studentStatus: 'ativo', activeLoans: 3, overdueLoans: 2 },
      { ...policy, maxActiveLoans: 1 },
    )

    expect(check.blocks).toHaveLength(2)
    expect(check.blocks[0]).toContain('3 livros (limite da escola: 1 livro)')
    expect(check.blocks[1]).toContain('2 livros em atraso')
  })

  it('[US06-CA2] aluno transferido não pega empréstimo', () => {
    const check = canBorrow({ ...ok, studentStatus: 'transferido' }, policy)

    expect(check).toMatchObject({ allowed: false, blocks: ['Aluno transferido não pode pegar livros.'] })
  })

  it.each([
    ['disponivel', null],
    ['emprestado', 'Este exemplar já está emprestado. Registre a devolução antes.'],
    ['separado', 'Este exemplar está separado para a fila de reserva e não pode ser emprestado.'],
    ['perdido', 'Este exemplar está perdido e não pode ser emprestado.'],
    ['danificado', 'Este exemplar está danificado e não pode ser emprestado.'],
  ] as const)('[US04-CA4] exemplar %s → %s', (status, reason) => {
    expect(copyUnavailableReason(status)).toBe(reason)
  })
})
