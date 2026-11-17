import { matchTemplate, normalizePhone, validateRows, validateStudent, TEMPLATE_COLUMNS } from './rules'

const HEADERS = TEMPLATE_COLUMNS.map((c) => c.header)
const index = (matchTemplate(HEADERS) as { ok: true; index: Parameters<typeof validateRows>[1] }).index

describe('US02 Importar alunos — regras', () => {
  describe('modelo da planilha', () => {
    it('[US02-CA1] aceita o cabeçalho do modelo', () => {
      expect(matchTemplate(HEADERS).ok).toBe(true)
    })

    it('[US02-CA1] aceita colunas em outra ordem, com acentos e maiúsculas diferentes e colunas extras', () => {
      const result = matchTemplate([
        'TURMA',
        'Observação',
        'nome do aluno',
        'TELEFONE DO RESPONSAVEL',
        ' matricula ',
      ])

      expect(result).toEqual({
        ok: true,
        index: { className: 0, name: 2, guardianPhone: 3, registration: 4 },
      })
    })

    it('[US02-CA1] recusa arquivo sem as colunas do modelo e diz quais faltam', () => {
      expect(matchTemplate(['Nome', 'Série', 'Fone'])).toEqual({
        ok: false,
        missing: ['Matrícula', 'Nome do aluno', 'Turma', 'Telefone do responsável'],
      })
    })
  })

  describe('telefone do responsável', () => {
    it.each([
      ['(51) 99999-0000', '+5551999990000'],
      ['51999990000', '+5551999990000'],
      ['+55 51 99999-0000', '+5551999990000'],
      ['5551999990000', '+5551999990000'],
      ['051 99999 0000', '+5551999990000'],
    ])('[US02-CA2] normaliza %s', (raw, expected) => {
      expect(normalizePhone(raw)).toBe(expected)
    })

    it.each([
      ['', 'vazio'],
      ['9999-0000', 'sem DDD'],
      ['(51) 3333-0000', 'fixo, sem WhatsApp'],
      ['(51) 89999-0000', 'celular sem o 9'],
      ['(01) 99999-0000', 'DDD inválido'],
      ['(51) 99999-00001', 'dígitos a mais'],
      ['telefone', 'texto'],
    ])('[US02-CA2] recusa %s (%s)', (raw) => {
      expect(normalizePhone(raw)).toBeNull()
    })
  })

  describe('validação do aluno', () => {
    const ok = { registration: '123', name: 'Raissa', className: '5a', guardianPhone: '51999990000' }

    it('[US02-CA2] aluno válido é normalizado', () => {
      expect(validateStudent({ ...ok, name: '  Raissa   Souza ', className: ' 5a ' })).toEqual({
        ok: true,
        student: {
          registration: '123',
          name: 'Raissa Souza',
          className: '5A',
          guardianPhone: '+5551999990000',
        },
      })
    })

    it.each([
      ['name', '', 'Sem nome'],
      ['className', '  ', 'Sem turma'],
      ['guardianPhone', '', 'Sem telefone do responsável'],
      ['guardianPhone', '123', 'Telefone do responsável inválido'],
      ['registration', '', 'Sem matrícula'],
    ] as const)('[US02-CA2] recusa com %s = "%s"', (field, value, reason) => {
      expect(validateStudent({ ...ok, [field]: value })).toEqual({ ok: false, reasons: [reason] })
    })

    it('[US02-CA4] informa todos os motivos de recusa de uma vez', () => {
      const result = validateStudent({ registration: '1', name: '', className: '', guardianPhone: 'x' })

      expect(result).toEqual({
        ok: false,
        reasons: ['Sem nome', 'Sem turma', 'Telefone do responsável inválido'],
      })
    })
  })

  describe('linhas da planilha', () => {
    it('[US02-CA4] separa válidas e recusadas, com o número da linha na planilha', () => {
      const rows = [
        ['1', 'Ana', '5A', '51999990001'],
        ['2', '', '5A', '51999990002'],
        ['3', 'Caio', '5B', '33330000'],
      ]

      const { valid, rejected } = validateRows(rows, index)

      expect(valid.map((v) => v.registration)).toEqual(['1'])
      expect(rejected).toEqual([
        { line: 3, registration: '2', name: '', reasons: ['Sem nome'] },
        { line: 4, registration: '3', name: 'Caio', reasons: ['Telefone do responsável inválido'] },
      ])
    })

    it('ignora linhas totalmente vazias', () => {
      const { valid, rejected } = validateRows(
        [['', '', '', ''], ['1', 'Ana', '5A', '51999990001'], []],
        index,
      )

      expect(valid).toHaveLength(1)
      expect(rejected).toHaveLength(0)
    })

    it('[US02-CA3] matrícula repetida no mesmo arquivo: a primeira vale, a segunda é recusada', () => {
      const rows = [
        ['1', 'Ana', '5A', '51999990001'],
        ['1', 'Ana Paula', '5B', '51999990001'],
      ]

      const { valid, rejected } = validateRows(rows, index)

      expect(valid).toEqual([expect.objectContaining({ name: 'Ana', className: '5A' })])
      expect(rejected).toEqual([
        { line: 3, registration: '1', name: 'Ana Paula', reasons: ['Matrícula repetida no arquivo'] },
      ])
    })
  })
})
