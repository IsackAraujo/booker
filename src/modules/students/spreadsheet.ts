import ExcelJS from 'exceljs'
import { TEMPLATE_COLUMNS } from './rules'

export type Sheet = { headers: string[]; rows: string[][] }

export class SpreadsheetFormatError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'SpreadsheetFormatError'
  }
}

/** Lê .xlsx ou .csv (separado por ; ou ,) e devolve cabeçalho e linhas como texto. */
export async function readSpreadsheet(fileName: string, data: ArrayBuffer): Promise<Sheet> {
  const lower = fileName.toLowerCase()
  if (lower.endsWith('.xlsx')) return readXlsx(data)
  if (lower.endsWith('.csv')) return readCsv(new TextDecoder('utf-8').decode(data))
  throw new SpreadsheetFormatError(
    'Formato não aceito. Envie a planilha em .xlsx ou .csv, conforme o modelo.',
  )
}

async function readXlsx(data: ArrayBuffer): Promise<Sheet> {
  const workbook = new ExcelJS.Workbook()
  try {
    await workbook.xlsx.load(data)
  } catch {
    throw new SpreadsheetFormatError('Não foi possível ler o arquivo .xlsx.')
  }
  const sheet = workbook.worksheets[0]
  if (!sheet) throw new SpreadsheetFormatError('A planilha está vazia.')
  const width = sheet.columnCount
  const lines: string[][] = []
  sheet.eachRow({ includeEmpty: true }, (row) => {
    const cells: string[] = []
    for (let c = 1; c <= width; c++) cells.push(row.getCell(c).text?.trim() ?? '')
    lines.push(cells)
  })
  const [headers = [], ...rows] = lines
  return { headers, rows }
}

/** CSV simples com suporte a aspas. Detecta o separador pelo cabeçalho (Excel em português usa ";"). */
export function readCsv(text: string): Sheet {
  const content = text.replace(/^﻿/, '')
  const firstLine = content.split(/\r?\n/, 1)[0] ?? ''
  const sep = firstLine.split(';').length >= firstLine.split(',').length ? ';' : ','
  const lines: string[][] = []
  let row: string[] = []
  let cell = ''
  let quoted = false
  for (let i = 0; i < content.length; i++) {
    const ch = content[i]!
    if (quoted) {
      if (ch === '"' && content[i + 1] === '"') {
        cell += '"'
        i++
      } else if (ch === '"') quoted = false
      else cell += ch
    } else if (ch === '"') quoted = true
    else if (ch === sep) {
      row.push(cell.trim())
      cell = ''
    } else if (ch === '\n' || ch === '\r') {
      if (ch === '\r' && content[i + 1] === '\n') i++
      row.push(cell.trim())
      lines.push(row)
      row = []
      cell = ''
    } else cell += ch
  }
  if (cell || row.length) {
    row.push(cell.trim())
    lines.push(row)
  }
  const [headers = [], ...rows] = lines
  return { headers, rows }
}

/** Modelo para download (T2.1): cabeçalho + uma linha de exemplo. */
export async function buildTemplate(): Promise<ArrayBuffer> {
  const workbook = new ExcelJS.Workbook()
  const sheet = workbook.addWorksheet('Alunos')
  sheet.columns = TEMPLATE_COLUMNS.map((c) => ({ header: c.header, width: c.key === 'name' ? 40 : 24 }))
  sheet.getRow(1).font = { bold: true }
  sheet.addRow(['20260001', 'Raissa Exemplo da Silva', '5A', '(51) 99999-0000'])
  // Matrícula e telefone como texto, para o Excel não apagar zeros à esquerda.
  sheet.getColumn(1).numFmt = '@'
  sheet.getColumn(4).numFmt = '@'
  return (await workbook.xlsx.writeBuffer()) as ArrayBuffer
}
