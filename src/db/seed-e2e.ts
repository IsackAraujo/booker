import { addDays, format } from 'date-fns'
import { eq } from 'drizzle-orm'
import * as s from './schema'
import type { Db } from './types'

/**
 * Dados de cenário para os testes E2E (E2E_FIXTURES=1), relativos à data de hoje.
 * Empréstimos são inseridos direto no banco porque o registro de empréstimo é a US04 (SEB-8).
 */
export async function seedE2E(db: Db) {
  const [already] = await db.select().from(s.books).where(eq(s.books.title, 'Livro E2E'))
  if (already) return
  const [roseli] = await db.select().from(s.users).where(eq(s.users.email, 'roseli@booker.test'))
  const today = new Date()
  const day = (n: number) => format(addDays(today, n), 'yyyy-MM-dd')

  const [book] = await db
    .insert(s.books)
    .values({ title: 'Livro E2E', author: 'Autora E2E', category: 'Literatura', ageRange: '8-10' })
    .returning()
  const [atrasado, noPrazo] = await db
    .insert(s.copies)
    .values([
      { bookId: book!.id, code: 'E2E-ATRASADO', status: 'emprestado' },
      { bookId: book!.id, code: 'E2E-NOPRAZO', status: 'emprestado' },
      { bookId: book!.id, code: 'E2E-LIVRE' },
    ])
    .returning()
  const [raissa, bruno] = await db
    .insert(s.students)
    .values([
      { registration: 'E2E-R', name: 'Raissa E2E', className: '5A', guardianPhone: '+5551999990101' },
      { registration: 'E2E-B', name: 'Bruno E2E', className: '6B', guardianPhone: '+5551999990102' },
    ])
    .returning()
  await db.insert(s.loans).values([
    {
      copyId: atrasado!.id,
      studentId: raissa!.id,
      loanedAt: addDays(today, -17),
      dueDate: day(-3),
      createdBy: roseli!.id,
    },
    {
      copyId: noPrazo!.id,
      studentId: bruno!.id,
      loanedAt: addDays(today, -2),
      dueDate: day(12),
      createdBy: roseli!.id,
    },
  ])
}
