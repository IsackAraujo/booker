import { randomBytes } from 'node:crypto'
import { and, asc, eq, isNull } from 'drizzle-orm'
import QRCode from 'qrcode'
import { students } from '@/db/schema'
import type { Db } from '@/db/types'
import type { Clock } from '@/lib/clock'
import { NotFoundError } from '@/lib/errors'

// Vínculo do responsável com o bot do Telegram (ADR 8, https://core.telegram.org/bots/features#deep-linking).
// O link t.me/<bot>?start=<código> abre o bot e envia "/start <código>"; o webhook grava o chat_id no aluno.

/** Código do link: 16 caracteres [A-Za-z0-9_-], dentro do limite de 64 do parâmetro start. */
export function newLinkCode(): string {
  return randomBytes(12).toString('base64url')
}

export function telegramLink(botUsername: string, code: string): string {
  return `https://t.me/${botUsername.replace(/^@/, '')}?start=${code}`
}

/** Garante que o aluno tem código de vínculo e devolve o código. */
export async function ensureLinkCode(db: Db, studentId: number): Promise<string> {
  const [s] = await db
    .select({ code: students.telegramLinkCode })
    .from(students)
    .where(eq(students.id, studentId))
  if (!s) throw new NotFoundError('Aluno')
  if (s.code) return s.code
  const code = newLinkCode()
  await db
    .update(students)
    .set({ telegramLinkCode: code })
    .where(and(eq(students.id, studentId), isNull(students.telegramLinkCode)))
  const [again] = await db
    .select({ code: students.telegramLinkCode })
    .from(students)
    .where(eq(students.id, studentId))
  return again!.code!
}

export interface TelegramLinkInfo {
  studentId: number
  name: string
  className: string
  linked: boolean
  url: string
  qrSvg: string
}

/** Link e QR code de vínculo de um aluno, para a bibliotecária enviar ou imprimir. */
export async function linkInfo(db: Db, botUsername: string, studentId: number): Promise<TelegramLinkInfo> {
  const code = await ensureLinkCode(db, studentId)
  const [s] = await db.select().from(students).where(eq(students.id, studentId))
  const url = telegramLink(botUsername, code)
  return {
    studentId,
    name: s!.name,
    className: s!.className,
    linked: Boolean(s!.telegramChatId),
    url,
    qrSvg: await QRCode.toString(url, { type: 'svg', margin: 1, width: 160 }),
  }
}

/** Links de uma turma inteira (página para imprimir e mandar para casa). */
export async function classLinks(
  db: Db,
  botUsername: string,
  className: string,
): Promise<TelegramLinkInfo[]> {
  const rows = await db
    .select({ id: students.id })
    .from(students)
    .where(and(eq(students.className, className.trim().toUpperCase()), eq(students.status, 'ativo')))
    .orderBy(asc(students.name))
  const result: TelegramLinkInfo[] = []
  for (const r of rows) result.push(await linkInfo(db, botUsername, r.id))
  return result
}

export interface TelegramUpdate {
  message?: { text?: string; chat?: { id?: number | string } }
}

export type WebhookOutcome =
  | { kind: 'linked'; chatId: string; studentName: string }
  | { kind: 'invalid-code'; chatId: string }
  | { kind: 'no-code'; chatId: string }
  | { kind: 'ignored' }

/**
 * Trata uma mensagem recebida pelo bot. "/start <código>" vincula o chat ao aluno do código.
 * Um mesmo chat pode ser vinculado a vários alunos (irmãos); o código continua valendo para trocar de celular.
 */
export async function handleTelegramUpdate(
  db: Db,
  clock: Clock,
  update: TelegramUpdate,
): Promise<WebhookOutcome> {
  const text = update.message?.text?.trim()
  const chatId = update.message?.chat?.id
  if (!text || chatId === undefined) return { kind: 'ignored' }
  const match = /^\/start(?:@\w+)?(?:\s+([A-Za-z0-9_-]{1,64}))?$/.exec(text)
  if (!match) return { kind: 'ignored' }
  const code = match[1]
  if (!code) return { kind: 'no-code', chatId: String(chatId) }
  const [s] = await db
    .update(students)
    .set({ telegramChatId: String(chatId), updatedAt: clock.now() })
    .where(eq(students.telegramLinkCode, code))
    .returning({ name: students.name })
  if (!s) return { kind: 'invalid-code', chatId: String(chatId) }
  return { kind: 'linked', chatId: String(chatId), studentName: s.name }
}

/** Resposta do bot para cada resultado do vínculo. */
export function webhookReply(outcome: WebhookOutcome): string | null {
  switch (outcome.kind) {
    case 'linked':
      return `Pronto! Você vai receber por aqui os avisos da biblioteca sobre ${outcome.studentName}.`
    case 'invalid-code':
      return 'Este link de vínculo não é válido. Peça um novo link na biblioteca da escola.'
    case 'no-code':
      return 'Olá! Para receber os avisos da biblioteca, abra o link de vínculo que a escola enviou.'
    case 'ignored':
      return null
  }
}

/** Remove o vínculo (responsável trocou de celular ou pediu para sair). */
export async function unlinkTelegram(db: Db, clock: Clock, studentId: number): Promise<void> {
  await db
    .update(students)
    .set({ telegramChatId: null, telegramLinkCode: newLinkCode(), updatedAt: clock.now() })
    .where(eq(students.id, studentId))
}
