import { asc, eq, ilike, or, sql } from 'drizzle-orm'
import { students } from '@/db/schema'
import type { Db } from '@/db/types'
import type { Clock } from '@/lib/clock'
import { BusinessError, NotFoundError } from '@/lib/errors'
import * as audit from '@/modules/audit/service'
import { matchTemplate, validateRows, validateStudent, type RejectedRow, type StudentInput } from './rules'
import type { Sheet } from './spreadsheet'

export type Student = typeof students.$inferSelect

export interface ImportResult {
  created: number
  updated: number
  rejected: RejectedRow[]
}

/**
 * Importa alunos da planilha da secretaria (US02). Arquivo fora do modelo é recusado inteiro (CA1);
 * linhas inválidas são recusadas e informadas (CA2, CA4); matrícula existente é atualizada, não duplicada (CA3).
 * Tudo numa transação: ou entram todas as linhas válidas, ou nenhuma.
 */
export async function importStudents(
  db: Db,
  clock: Clock,
  userId: number,
  sheet: Sheet,
): Promise<ImportResult> {
  const template = matchTemplate(sheet.headers)
  if (!template.ok) {
    throw new BusinessError(
      `O arquivo não está no modelo combinado com a secretaria. Faltam as colunas: ${template.missing.join(', ')}.`,
      'IMPORT_TEMPLATE',
    )
  }
  const { valid, rejected } = validateRows(sheet.rows, template.index)
  if (valid.length === 0 && rejected.length === 0) {
    throw new BusinessError('A planilha não tem nenhum aluno.', 'IMPORT_EMPTY')
  }

  return db.transaction(async (tx) => {
    let created = 0
    let updated = 0
    const now = clock.now()
    for (const s of valid) {
      const [row] = await tx
        .insert(students)
        .values({ ...s, updatedAt: now, createdAt: now })
        .onConflictDoUpdate({
          target: students.registration,
          set: { name: s.name, className: s.className, guardianPhone: s.guardianPhone, updatedAt: now },
        })
        .returning({ inserted: sql<boolean>`(xmax = 0)` })
      if (row?.inserted) created++
      else updated++
    }
    await audit.append(tx, {
      userId,
      action: 'alunos.importar',
      entity: 'student',
      payload: { created, updated, rejected: rejected.length },
    })
    return { created, updated, rejected }
  })
}

/** Cadastro manual (T2.3). */
export async function createStudent(
  db: Db,
  clock: Clock,
  userId: number,
  input: StudentInput,
): Promise<Student> {
  const result = validateStudent(input)
  if (!result.ok) throw new BusinessError(result.reasons.join('; '), 'STUDENT_INVALID')
  return db.transaction(async (tx) => {
    const [exists] = await tx
      .select({ id: students.id })
      .from(students)
      .where(eq(students.registration, result.student.registration))
    if (exists) throw new BusinessError('Já existe aluno com esta matrícula.', 'STUDENT_DUPLICATE')
    const now = clock.now()
    const [row] = await tx
      .insert(students)
      .values({ ...result.student, createdAt: now, updatedAt: now })
      .returning()
    await audit.append(tx, { userId, action: 'aluno.cadastrar', entity: 'student', entityId: row!.id })
    return row!
  })
}

/** Edição manual (T2.3). A matrícula pode ser corrigida, desde que não colida com outro aluno. */
export async function updateStudent(
  db: Db,
  clock: Clock,
  userId: number,
  id: number,
  input: StudentInput,
): Promise<Student> {
  const result = validateStudent(input)
  if (!result.ok) throw new BusinessError(result.reasons.join('; '), 'STUDENT_INVALID')
  return db.transaction(async (tx) => {
    const [current] = await tx.select().from(students).where(eq(students.id, id))
    if (!current) throw new NotFoundError('Aluno')
    const [other] = await tx
      .select({ id: students.id })
      .from(students)
      .where(eq(students.registration, result.student.registration))
    if (other && other.id !== id)
      throw new BusinessError('Já existe aluno com esta matrícula.', 'STUDENT_DUPLICATE')
    const [row] = await tx
      .update(students)
      .set({ ...result.student, updatedAt: clock.now() })
      .where(eq(students.id, id))
      .returning()
    await audit.append(tx, {
      userId,
      action: 'aluno.editar',
      entity: 'student',
      entityId: id,
      payload: { antes: pick(current), depois: pick(row!) },
    })
    return row!
  })
}

function pick(s: Student) {
  return {
    registration: s.registration,
    name: s.name,
    className: s.className,
    guardianPhone: s.guardianPhone,
  }
}

export async function getStudent(db: Db, id: number): Promise<Student | undefined> {
  const [row] = await db.select().from(students).where(eq(students.id, id))
  return row
}

export async function searchStudents(db: Db, term = '', limit = 50): Promise<Student[]> {
  const q = term.trim()
  return db
    .select()
    .from(students)
    .where(
      q
        ? or(
            ilike(students.name, `%${q}%`),
            ilike(students.registration, `%${q}%`),
            ilike(students.className, `%${q}%`),
          )
        : undefined,
    )
    .orderBy(asc(students.className), asc(students.name))
    .limit(limit)
}
