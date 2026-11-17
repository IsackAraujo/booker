// Regras puras do acervo (US01). Sem banco, sem data do sistema.

export interface BookInput {
  title: string
  author: string
  category: string
  ageRange: string
}

export type CopyStatus = 'disponivel' | 'emprestado' | 'separado' | 'perdido' | 'danificado'

/** Situações que a bibliotecária pode definir à mão (T1.3). Emprestado e separado só mudam pelo balcão e pela fila. */
export const MANUAL_COPY_STATUSES = ['disponivel', 'perdido', 'danificado'] as const
export type ManualCopyStatus = (typeof MANUAL_COPY_STATUSES)[number]

export const COPY_STATUS_LABEL: Record<CopyStatus, string> = {
  disponivel: 'Disponível',
  emprestado: 'Emprestado',
  separado: 'Separado para reserva',
  perdido: 'Perdido',
  danificado: 'Danificado',
}

const REQUIRED: { key: keyof BookInput; label: string }[] = [
  { key: 'title', label: 'Sem título' },
  { key: 'author', label: 'Sem autor' },
  { key: 'category', label: 'Sem categoria' },
  { key: 'ageRange', label: 'Sem faixa etária' },
]

export function cleanText(value: string): string {
  return value.replace(/\s+/g, ' ').trim()
}

/** US01-CA1: livro só é cadastrado com título, autor, categoria e faixa etária. */
export function validateBook(
  input: BookInput,
): { ok: true; book: BookInput } | { ok: false; reasons: string[] } {
  const book: BookInput = {
    title: cleanText(input.title),
    author: cleanText(input.author),
    category: cleanText(input.category),
    ageRange: cleanText(input.ageRange),
  }
  const reasons = REQUIRED.filter((f) => !book[f.key]).map((f) => f.label)
  return reasons.length ? { ok: false, reasons } : { ok: true, book }
}

/**
 * Código do exemplar normalizado: sem espaços e em maiúsculas, para "ex-001" e "EX-001 " serem o mesmo
 * código (US01-CA2). A busca no balcão também compara em maiúsculas.
 */
export function normalizeCopyCode(raw: string): string {
  return raw.replace(/\s+/g, '').toUpperCase()
}

/** Código aceito: 1 a 30 caracteres entre letras, números, hífen, ponto e barra. */
export function isValidCopyCode(code: string): boolean {
  return /^[A-Z0-9][A-Z0-9./-]{0,29}$/.test(code)
}

/** US01-CA4: livro que já teve empréstimo não é excluído, só inativado. */
export function removalMode(hasLoanHistory: boolean): 'excluir' | 'inativar' {
  return hasLoanHistory ? 'inativar' : 'excluir'
}

/** T1.3: a situação só muda à mão se o exemplar não está no meio de um empréstimo ou reserva. */
export function canChangeCopyStatus(current: CopyStatus): boolean {
  return current !== 'emprestado' && current !== 'separado'
}
