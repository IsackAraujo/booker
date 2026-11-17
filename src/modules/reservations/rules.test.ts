import { availableOn, canCancel, loanStillOutOn, validateReservation } from './rules'

const today = '2026-03-10'
const ok = { bookId: 1, className: '5A', quantity: 3, activityDate: '2026-03-20' }

describe('US10 Reserva para a turma — regras', () => {
  it('[US10-CA1] reserva completa é válida', () => {
    expect(validateReservation(ok, today)).toEqual([])
  })

  it.each([
    [{ quantity: null }, 'Informe a quantidade de exemplares'],
    [{ quantity: 0 }, 'A quantidade deve ser pelo menos 1'],
    [{ quantity: 1.5 }, 'Informe a quantidade de exemplares'],
    [{ activityDate: null }, 'Informe a data da atividade'],
    [{ activityDate: '20/03/2026' }, 'Informe a data da atividade'],
    [{ activityDate: '2026-03-09' }, 'A data da atividade já passou'],
    [{ bookId: null }, 'Escolha o livro'],
    [{ className: ' ' }, 'Informe a turma'],
  ])('[US10-CA1] recusa %o', (change, message) => {
    expect(validateReservation({ ...ok, ...change }, today)).toEqual([message])
  })

  it('aceita reserva para hoje', () => {
    expect(validateReservation({ ...ok, activityDate: today }, today)).toEqual([])
  })

  it.each([
    [{ usableCopies: 10, outOnDate: 3, reservedOnDate: 2 }, 5],
    [{ usableCopies: 4, outOnDate: 4, reservedOnDate: 0 }, 0],
    [{ usableCopies: 4, outOnDate: 3, reservedOnDate: 3 }, 0],
  ])('[US10-CA2] disponível na data %o = %i', (input, expected) => {
    expect(availableOn(input)).toBe(expected)
  })

  it.each([
    ['2026-03-20', true, 'vence no dia da atividade'],
    ['2026-03-25', true, 'vence depois'],
    ['2026-03-15', false, 'vence antes e ainda no prazo: deve voltar'],
    ['2026-03-05', true, 'já atrasado: não dá para contar com ele'],
  ])('[US10-CA2] empréstimo com prazo %s ainda fora em 20/03? %s (%s)', (due, expected) => {
    expect(loanStillOutOn(due, '2026-03-20', today)).toBe(expected)
  })

  it.each([
    ['2026-03-11', true],
    ['2026-03-10', false],
    ['2026-03-09', false],
  ])('[US10-CA4] atividade em %s, hoje 10/03: pode cancelar? %s', (date, expected) => {
    expect(canCancel(date, today)).toBe(expected)
  })
})
