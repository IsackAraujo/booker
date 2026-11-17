import { canChangeCopyStatus, isValidCopyCode, normalizeCopyCode, removalMode, validateBook } from './rules'

const valid = {
  title: 'O Pequeno Príncipe',
  author: 'Saint-Exupéry',
  category: 'Literatura',
  ageRange: '8-10',
}

describe('US01 Cadastrar livros — regras', () => {
  it('[US01-CA1] aceita livro com título, autor, categoria e faixa etária', () => {
    expect(validateBook(valid)).toEqual({ ok: true, book: valid })
  })

  it('[US01-CA1] recusa e lista todos os campos que faltam', () => {
    const result = validateBook({ title: '', author: '  ', category: 'Literatura', ageRange: '' })

    expect(result).toEqual({ ok: false, reasons: ['Sem título', 'Sem autor', 'Sem faixa etária'] })
  })

  it.each(['title', 'author', 'category', 'ageRange'] as const)(
    '[US01-CA1] campo %s só com espaços conta como vazio',
    (field) => {
      expect(validateBook({ ...valid, [field]: '   ' }).ok).toBe(false)
    },
  )

  it('remove espaços extras dos campos', () => {
    const result = validateBook({ ...valid, title: '  O   Pequeno Príncipe ' })

    expect(result).toMatchObject({ ok: true, book: { title: 'O Pequeno Príncipe' } })
  })

  it('[US01-CA2] normaliza o código do exemplar para comparar sem diferenciar maiúsculas e espaços', () => {
    expect(normalizeCopyCode(' ex- 001 ')).toBe('EX-001')
  })

  it.each([
    ['EX-001', true],
    ['123', true],
    ['LIT/2026.3', true],
    ['', false],
    ['-001', false],
    ['EX_001', false],
    ['A'.repeat(31), false],
  ])('código %s é válido? %s', (code, expected) => {
    expect(isValidCopyCode(code)).toBe(expected)
  })

  it('[US01-CA4] livro com histórico de empréstimo é inativado', () => {
    expect(removalMode(true)).toBe('inativar')
  })

  it('[US01-CA4] livro sem histórico pode ser excluído', () => {
    expect(removalMode(false)).toBe('excluir')
  })

  it.each([
    ['disponivel', true],
    ['perdido', true],
    ['danificado', true],
    ['emprestado', false],
    ['separado', false],
  ] as const)('situação %s pode ser alterada à mão? %s', (status, expected) => {
    expect(canChangeCopyStatus(status)).toBe(expected)
  })
})
