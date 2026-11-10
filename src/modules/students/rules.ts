// Regras puras da importação e do cadastro de alunos (US02). Sem banco, sem data do sistema.

/** Colunas do modelo combinado com a secretaria (T2.1), na ordem da planilha. Ver docs/planilha-alunos.md. */
export const TEMPLATE_COLUMNS = [
  { key: 'registration', header: 'Matrícula' },
  { key: 'name', header: 'Nome do aluno' },
  { key: 'className', header: 'Turma' },
  { key: 'guardianPhone', header: 'Telefone do responsável' },
] as const

export type ColumnKey = (typeof TEMPLATE_COLUMNS)[number]['key']

export interface StudentInput {
  registration: string
  name: string
  className: string
  guardianPhone: string
}

export interface RejectedRow {
  /** Número da linha na planilha (1 = cabeçalho). */
  line: number
  registration: string
  name: string
  reasons: string[]
}

/** Compara cabeçalhos ignorando maiúsculas, acentos e espaços extras. */
export function normalizeHeader(value: string): string {
  return value.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/\s+/g, ' ').trim()
}

/**
 * Confere se o arquivo segue o modelo (US02-CA1). Colunas podem estar em qualquer ordem; colunas extras são
 * ignoradas. Devolve o índice de cada coluna ou a lista das que faltam.
 */
export function matchTemplate(
  headers: string[],
): { ok: true; index: Record<ColumnKey, number> } | { ok: false; missing: string[] } {
  const normalized = headers.map(normalizeHeader)
  const index = {} as Record<ColumnKey, number>
  const missing: string[] = []
  for (const col of TEMPLATE_COLUMNS) {
    const i = normalized.indexOf(normalizeHeader(col.header))
    if (i === -1) missing.push(col.header)
    else index[col.key] = i
  }
  return missing.length ? { ok: false, missing } : { ok: true, index }
}

/**
 * Normaliza o telefone do responsável para E.164 (+55DDDNÚMERO).
 * Aceita só celular brasileiro (11 dígitos com DDD, começando em 9), porque o contato é por WhatsApp.
 * Aceita com ou sem +55, com máscara, espaços e traços. Devolve null se inválido.
 */
export function normalizePhone(raw: string): string | null {
  let digits = raw.replace(/\D/g, '')
  if (digits.length === 13 && digits.startsWith('55')) digits = digits.slice(2)
  if (digits.length === 12 && digits.startsWith('0')) digits = digits.slice(1) // 0 + DDD + número
  if (digits.length !== 11) return null
  const ddd = Number(digits.slice(0, 2))
  if (ddd < 11 || digits[0] === '0' || digits[1] === '0') return null
  if (digits[2] !== '9') return null
  return `+55${digits}`
}

/** Remove espaços extras; turma em maiúsculas para "5a" e "5A" serem a mesma turma. */
export function cleanName(value: string): string {
  return value.replace(/\s+/g, ' ').trim()
}

export function cleanClassName(value: string): string {
  return value.replace(/\s+/g, ' ').trim().toUpperCase()
}

export function cleanRegistration(value: string): string {
  return value.replace(/\s+/g, '').trim()
}

/** Valida e normaliza um aluno (US02-CA2). Usada na importação e no cadastro manual. */
export function validateStudent(
  raw: StudentInput,
): { ok: true; student: StudentInput } | { ok: false; reasons: string[] } {
  const student: StudentInput = {
    registration: cleanRegistration(raw.registration),
    name: cleanName(raw.name),
    className: cleanClassName(raw.className),
    guardianPhone: raw.guardianPhone.trim(),
  }
  const reasons: string[] = []
  if (!student.registration) reasons.push('Sem matrícula')
  if (!student.name) reasons.push('Sem nome')
  if (!student.className) reasons.push('Sem turma')
  const phone = normalizePhone(student.guardianPhone)
  if (!student.guardianPhone) reasons.push('Sem telefone do responsável')
  else if (!phone) reasons.push('Telefone do responsável inválido')
  if (reasons.length) return { ok: false, reasons }
  return { ok: true, student: { ...student, guardianPhone: phone! } }
}

/**
 * Valida as linhas da planilha (já sem o cabeçalho). Linhas totalmente vazias são ignoradas.
 * Matrícula repetida no mesmo arquivo: a primeira vale, as seguintes são recusadas.
 */
export function validateRows(
  rows: string[][],
  index: Record<ColumnKey, number>,
): { valid: StudentInput[]; rejected: RejectedRow[] } {
  const valid: StudentInput[] = []
  const rejected: RejectedRow[] = []
  const seen = new Set<string>()
  rows.forEach((cells, i) => {
    const line = i + 2
    if (cells.every((c) => !c || !c.trim())) return
    const get = (key: ColumnKey) => cells[index[key]] ?? ''
    const raw = {
      registration: get('registration'),
      name: get('name'),
      className: get('className'),
      guardianPhone: get('guardianPhone'),
    }
    const result = validateStudent(raw)
    if (!result.ok) {
      rejected.push({
        line,
        registration: raw.registration.trim(),
        name: cleanName(raw.name),
        reasons: result.reasons,
      })
      return
    }
    if (seen.has(result.student.registration)) {
      rejected.push({
        line,
        registration: result.student.registration,
        name: result.student.name,
        reasons: ['Matrícula repetida no arquivo'],
      })
      return
    }
    seen.add(result.student.registration)
    valid.push(result.student)
  })
  return { valid, rejected }
}
