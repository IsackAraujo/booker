import ExcelJS from 'exceljs'
import { buildTemplate, readCsv, readSpreadsheet, SpreadsheetFormatError } from './spreadsheet'
import { matchTemplate, TEMPLATE_COLUMNS } from './rules'

const enc = (s: string) => new TextEncoder().encode(s).buffer as ArrayBuffer

describe('US02 Importar alunos — leitura da planilha', () => {
  it('lê CSV com ponto e vírgula, aspas e BOM do Excel', () => {
    const csv =
      '﻿Matrícula;Nome do aluno;Turma;Telefone do responsável\r\n1;"Silva; Ana";5A;(51) 99999-0001\r\n'

    expect(readCsv(csv)).toEqual({
      headers: ['Matrícula', 'Nome do aluno', 'Turma', 'Telefone do responsável'],
      rows: [['1', 'Silva; Ana', '5A', '(51) 99999-0001']],
    })
  })

  it('lê CSV com vírgula e aspas escapadas', () => {
    const csv = 'a,b\n"x ""y""",z'

    expect(readCsv(csv)).toEqual({ headers: ['a', 'b'], rows: [['x "y"', 'z']] })
  })

  it('[US02-CA1] recusa arquivo que não é .xlsx nem .csv', async () => {
    await expect(readSpreadsheet('alunos.pdf', enc('x'))).rejects.toBeInstanceOf(SpreadsheetFormatError)
  })

  it('[US02-CA1] recusa .xlsx corrompido', async () => {
    await expect(readSpreadsheet('alunos.xlsx', enc('não é xlsx'))).rejects.toBeInstanceOf(
      SpreadsheetFormatError,
    )
  })

  it('lê .xlsx com matrícula e telefone numéricos como texto', async () => {
    const wb = new ExcelJS.Workbook()
    const ws = wb.addWorksheet('Alunos')
    ws.addRow(TEMPLATE_COLUMNS.map((c) => c.header))
    ws.addRow([20260001, 'Ana', '5A', 51999990001])
    const data = (await wb.xlsx.writeBuffer()) as ArrayBuffer

    const sheet = await readSpreadsheet('Alunos.XLSX', data)

    expect(sheet.rows).toEqual([['20260001', 'Ana', '5A', '51999990001']])
  })

  it('[T2.1] o modelo para download segue o layout combinado e é lido pela importação', async () => {
    const sheet = await readSpreadsheet('modelo.xlsx', await buildTemplate())

    expect(matchTemplate(sheet.headers).ok).toBe(true)
    expect(sheet.rows).toHaveLength(1)
  })
})
