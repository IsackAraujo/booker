import { and, asc, eq, ilike, isNull, or, sql } from 'drizzle-orm'
import { books, copies, loans, students } from '@/db/schema'
import type { Db } from '@/db/types'
import type { Clock, IsoDate } from '@/lib/clock'
import { BusinessError, NotFoundError } from '@/lib/errors'
import * as audit from '@/modules/audit/service'
import { daysLate } from '@/modules/loans/rules'
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

// ---------------------------------------------------------------------------------------------------------
// US06 Alerta de aluno transferido com livro pendente
// ---------------------------------------------------------------------------------------------------------

export interface PendingLoan {
  loanId: number
  copyCode: string
  bookTitle: string
  dueDate: IsoDate
  daysLate: number
}

/** Livros ainda com o aluno (empréstimos sem devolução), do prazo mais antigo para o mais novo. */
export async function pendingLoans(db: Db, clock: Clock, studentId: number): Promise<PendingLoan[]> {
  const today = clock.today()
  const rows = await db
    .select({ loanId: loans.id, copyCode: copies.code, bookTitle: books.title, dueDate: loans.dueDate })
    .from(loans)
    .innerJoin(copies, eq(copies.id, loans.copyId))
    .innerJoin(books, eq(books.id, copies.bookId))
    .where(and(eq(loans.studentId, studentId), isNull(loans.returnedAt)))
    .orderBy(asc(loans.dueDate), asc(copies.code))
  return rows.map((r) => ({ ...r, daysLate: daysLate(r.dueDate, today) }))
}

export interface TransferResult {
  student: Student
  /** US06-CA1: livros que ficaram com o aluno, para a bibliotecária recuperar. */
  pending: PendingLoan[]
}

/**
 * Marca o aluno como transferido (US06). Devolve os livros ainda pendentes com ele (CA1). A partir daí
 * ele não pega novos empréstimos (CA2, regra em loans/rules.canBorrow). Grava no histórico quantos livros
 * ficaram pendentes.
 */
export async function markTransferred(
  db: Db,
  clock: Clock,
  userId: number,
  studentId: number,
): Promise<TransferResult> {
  return db.transaction(async (tx) => {
    const [current] = await tx.select().from(students).where(eq(students.id, studentId)).for('update')
    if (!current) throw new NotFoundError('Aluno')
    if (current.status === 'transferido')
      throw new BusinessError('Este aluno já está marcado como transferido.', 'STUDENT_ALREADY_TRANSFERRED')
    const now = clock.now()
    const [row] = await tx
      .update(students)
      .set({ status: 'transferido', transferredAt: now, updatedAt: now })
      .where(eq(students.id, studentId))
      .returning()
    const pending = await pendingLoans(tx, clock, studentId)
    await audit.append(tx, {
      userId,
      action: 'aluno.transferir',
      entity: 'student',
      entityId: studentId,
      payload: { pendentes: pending.map((p) => p.copyCode) },
    })
    return { student: row!, pending }
  })
}

export interface TransferredWithPending {
  studentId: number
  registration: string
  name: string
  className: string
  guardianPhone: string
  transferredAt: Date | null
  pending: PendingLoan[]
}

/**
 * US06-CA3: alunos transferidos que ainda têm livro com eles. Quando o livro é devolvido (ou registrado
 * como perdido na devolução), a pendência sai da lista sozinha.
 */
export async function transferredWithPending(db: Db, clock: Clock): Promise<TransferredWithPending[]> {
  const today = clock.today()
  const rows = await db
    .select({
      studentId: students.id,
      registration: students.registration,
      name: students.name,
      className: students.className,
      guardianPhone: students.guardianPhone,
      transferredAt: students.transferredAt,
      loanId: loans.id,
      copyCode: copies.code,
      bookTitle: books.title,
      dueDate: loans.dueDate,
    })
    .from(students)
    .innerJoin(loans, and(eq(loans.studentId, students.id), isNull(loans.returnedAt)))
    .innerJoin(copies, eq(copies.id, loans.copyId))
    .innerJoin(books, eq(books.id, copies.bookId))
    .where(eq(students.status, 'transferido'))
    .orderBy(asc(students.name), asc(loans.dueDate))
  const byStudent = new Map<number, TransferredWithPending>()
  for (const r of rows) {
    const entry =
      byStudent.get(r.studentId) ??
      byStudent
        .set(r.studentId, {
          studentId: r.studentId,
          registration: r.registration,
          name: r.name,
          className: r.className,
          guardianPhone: r.guardianPhone,
          transferredAt: r.transferredAt,
          pending: [],
        })
        .get(r.studentId)!
    entry.pending.push({
      loanId: r.loanId,
      copyCode: r.copyCode,
      bookTitle: r.bookTitle,
      dueDate: r.dueDate,
      daysLate: daysLate(r.dueDate, today),
    })
  }
  return [...byStudent.values()]
}
