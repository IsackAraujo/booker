import * as s from '@/db/schema'
import type { Db } from '@/db/types'
import type { SessionUser } from '@/lib/session'

// Construtores de dados de teste (TESTING.md §4). Padrões válidos; passe só o que importa para o teste.

let seq = 0
const next = () => ++seq

type User = typeof s.users.$inferSelect
type Book = typeof s.books.$inferSelect
type Copy = typeof s.copies.$inferSelect
type Student = typeof s.students.$inferSelect
type Loan = typeof s.loans.$inferSelect

export async function makeUser(db: Db, over: Partial<typeof s.users.$inferInsert> = {}): Promise<User> {
  const n = next()
  const [row] = await db
    .insert(s.users)
    .values({
      name: `Usuária ${n}`,
      email: `user${n}@booker.test`,
      passwordHash: 'x',
      role: 'bibliotecaria',
      ...over,
    })
    .returning()
  return row!
}

export function asSession(user: User): SessionUser {
  return { id: user.id, name: user.name, role: user.role }
}

export async function makeBook(db: Db, over: Partial<typeof s.books.$inferInsert> = {}): Promise<Book> {
  const n = next()
  const [row] = await db
    .insert(s.books)
    .values({ title: `Livro ${n}`, author: `Autor ${n}`, category: 'Literatura', ageRange: '8-10', ...over })
    .returning()
  return row!
}

export async function makeCopy(
  db: Db,
  over: Partial<typeof s.copies.$inferInsert> & { book?: Book } = {},
): Promise<Copy & { book: Book }> {
  const { book: givenBook, ...rest } = over
  const book = givenBook ?? (await makeBook(db))
  const [row] = await db
    .insert(s.copies)
    .values({ bookId: book.id, code: `EX-${next()}`, ...rest })
    .returning()
  return { ...row!, book }
}

export async function makeStudent(
  db: Db,
  over: Partial<typeof s.students.$inferInsert> = {},
): Promise<Student> {
  const n = next()
  const [row] = await db
    .insert(s.students)
    .values({
      registration: `M${String(n).padStart(5, '0')}`,
      name: `Aluno ${n}`,
      className: '5A',
      guardianPhone: '+5551999990000',
      ...over,
    })
    .returning()
  return row!
}

/** Empréstimo aberto (ou devolvido, se `returnedAt` for passado). Marca o exemplar como emprestado quando aberto. */
export async function makeLoan(
  db: Db,
  over: Partial<typeof s.loans.$inferInsert> & {
    student?: Student
    copy?: Copy
    by?: User
  } = {},
): Promise<Loan> {
  const { student: st, copy: cp, by, ...rest } = over
  const student = st ?? (await makeStudent(db))
  const copy = cp ?? (await makeCopy(db))
  const user = by ?? (await makeUser(db))
  const [row] = await db
    .insert(s.loans)
    .values({
      copyId: copy.id,
      studentId: student.id,
      loanedAt: new Date('2026-03-02T13:00:00Z'),
      dueDate: '2026-03-16',
      createdBy: user.id,
      ...rest,
    })
    .returning()
  if (!row!.returnedAt) {
    const { eq } = await import('drizzle-orm')
    await db.update(s.copies).set({ status: 'emprestado' }).where(eq(s.copies.id, copy.id))
  }
  return row!
}

export async function makeSettings(db: Db, over: Partial<typeof s.settings.$inferInsert> = {}) {
  const [row] = await db
    .insert(s.settings)
    .values({ id: 1, ...over })
    .onConflictDoUpdate({ target: s.settings.id, set: over })
    .returning()
  return row!
}

export async function makeClassReservation(
  db: Db,
  over: Partial<typeof s.classReservations.$inferInsert> & { teacher?: User; book?: Book } = {},
) {
  const { teacher: t, book: b, ...rest } = over
  const teacher = t ?? (await makeUser(db, { role: 'professor' }))
  const book = b ?? (await makeBook(db))
  const [row] = await db
    .insert(s.classReservations)
    .values({
      teacherId: teacher.id,
      bookId: book.id,
      className: '5A',
      quantity: 1,
      activityDate: '2026-03-20',
      ...rest,
    })
    .returning()
  return row!
}
