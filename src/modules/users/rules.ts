import type { Role } from '@/lib/session'

// Regras puras de usuários (US03).

export const ROLE_LABEL: Record<Role, string> = {
  bibliotecaria: 'Bibliotecária',
  professor: 'Professor(a)',
  coordenacao: 'Coordenação',
}

export const MIN_PASSWORD = 8

export interface UserInput {
  name: string
  email: string
  role: string
  password: string
}

export function normalizeEmail(email: string): string {
  return email.trim().toLowerCase()
}

export function validatePassword(password: string): string | null {
  if (password.length < MIN_PASSWORD) return `A senha precisa ter pelo menos ${MIN_PASSWORD} caracteres.`
  return null
}

/** Valida o cadastro de um usuário. Devolve as mensagens de erro (vazio = válido). */
export function validateUser(input: UserInput): string[] {
  const errors: string[] = []
  if (!input.name.trim()) errors.push('Informe o nome')
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(normalizeEmail(input.email))) errors.push('E-mail inválido')
  if (!(input.role in ROLE_LABEL)) errors.push('Escolha o perfil')
  const pwd = validatePassword(input.password)
  if (pwd) errors.push(pwd)
  return errors
}
