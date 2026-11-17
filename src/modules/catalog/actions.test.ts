import { createTestDb, type TestDb } from '@tests/support/db'
import { setTestDeps } from '@tests/support/deps'
import { asSession, makeBook, makeCopy, makeLoan, makeUser } from '@tests/factories'
import { fakeUser, loginAs, rolesExcept } from '@tests/support/session'
import { books, copies } from '@/db/schema'
import { fixedClock } from '@/lib/clock'
import { idle } from '@/lib/action'
import {
  addCopiesAction,
  reactivateBookAction,
  removeBookAction,
  saveBookAction,
  setCopyStatusAction,
} from './actions'

vi.mock('next/navigation', () => ({
  redirect: vi.fn((to: string) => {
    throw Object.assign(new Error('NEXT_REDIRECT'), { to })
  }),
}))

let db: TestDb
beforeEach(async () => {
  db = await createTestDb()
  setTestDeps({ db, clock: fixedClock('2026-03-10') })
})

function formOf(fields: Record<string, string | number>) {
  const form = new FormData()
  for (const [k, v] of Object.entries(fields)) form.set(k, String(v))
  return form
}

const bookFields = {
  title: 'Dom Casmurro',
  author: 'Machado de Assis',
  category: 'Literatura',
  ageRange: '12+',
}

async function asLibrarian() {
  loginAs(asSession(await makeUser(db, { role: 'bibliotecaria' })))
}

describe('US01 Acervo — Server Actions', () => {
  it('[US03-CA1] sem sessão não cadastra livro', async () => {
    const result = await saveBookAction(idle, formOf(bookFields))

    expect(result).toEqual({ status: 'error', message: 'É preciso entrar no sistema.' })
    expect(await db.select().from(books)).toHaveLength(0)
  })

  it.each(rolesExcept('bibliotecaria'))('[US03-CA2] perfil %s não mexe no acervo', async (role) => {
    loginAs(fakeUser(role))
    const copy = await makeCopy(db)
    const deny = { status: 'error', message: 'Seu perfil não tem acesso a esta função.' }

    expect(await saveBookAction(idle, formOf(bookFields))).toEqual(deny)
    expect(await addCopiesAction(idle, formOf({ bookId: copy.bookId, codes: 'X-1' }))).toEqual(deny)
    expect(await setCopyStatusAction(idle, formOf({ copyId: copy.id, status: 'perdido' }))).toEqual(deny)
    expect(await removeBookAction(idle, formOf({ bookId: copy.bookId }))).toEqual(deny)
    expect(await reactivateBookAction(idle, formOf({ bookId: copy.bookId }))).toEqual(deny)
  })

  it('[US01-CA1] bibliotecária cadastra e depois edita o livro', async () => {
    await asLibrarian()

    const created = await saveBookAction(idle, formOf(bookFields))
    expect(created).toMatchObject({ status: 'ok', message: 'Livro salvo.', data: { title: 'Dom Casmurro' } })
    const bookId = created.status === 'ok' ? created.data.id : 0
    const edited = await saveBookAction(idle, formOf({ ...bookFields, id: bookId, ageRange: '14+' }))

    expect(edited).toMatchObject({ status: 'ok', data: { id: bookId, ageRange: '14+' } })
    expect(await db.select().from(books)).toHaveLength(1)
  })

  it('[US01-CA1] mostra o que falta no cadastro', async () => {
    await asLibrarian()

    const result = await saveBookAction(idle, formOf({ title: 'Sem nada' }))

    expect(result).toEqual({ status: 'error', message: 'Sem autor; Sem categoria; Sem faixa etária' })
  })

  it('[US01-CA2][US01-CA3] cadastra exemplares um por linha, todos disponíveis', async () => {
    await asLibrarian()
    const book = await makeBook(db)

    const result = await addCopiesAction(idle, formOf({ bookId: book.id, codes: 'dc-1\nDC-2\n\n' }))

    expect(result).toMatchObject({
      status: 'ok',
      data: [
        { code: 'DC-1', status: 'disponivel' },
        { code: 'DC-2', status: 'disponivel' },
      ],
    })
  })

  it('[US01-CA2] código repetido vira mensagem na tela', async () => {
    await asLibrarian()
    const copy = await makeCopy(db, { code: 'DC-1' })

    const result = await addCopiesAction(idle, formOf({ bookId: copy.bookId, codes: 'DC-1' }))

    expect(result).toEqual({ status: 'error', message: 'Já existe exemplar com o código DC-1.' })
  })

  it('sem livro informado', async () => {
    await asLibrarian()

    expect(await addCopiesAction(idle, formOf({ codes: 'A-1' }))).toEqual({
      status: 'error',
      message: 'Registro não informado.',
    })
  })

  it('[T1.3] altera a situação do exemplar e recusa situação inválida', async () => {
    await asLibrarian()
    const copy = await makeCopy(db)

    const ok = await setCopyStatusAction(idle, formOf({ copyId: copy.id, status: 'danificado' }))
    const bad = await setCopyStatusAction(idle, formOf({ copyId: copy.id, status: 'emprestado' }))

    expect(ok).toMatchObject({ status: 'ok', data: { status: 'danificado' } })
    expect(bad).toEqual({ status: 'error', message: 'Situação inválida.' })
  })

  it('[US01-CA4] remove livro sem empréstimo e reativa livro inativo', async () => {
    await asLibrarian()
    const book = await makeBook(db)
    const inactive = await makeBook(db, { active: false })

    // Excluído, volta para a lista do acervo.
    await expect(removeBookAction(idle, formOf({ bookId: book.id }))).rejects.toMatchObject({ to: '/acervo' })
    const reactivated = await reactivateBookAction(idle, formOf({ bookId: inactive.id }))

    expect(reactivated).toMatchObject({ status: 'ok', data: { active: true } })
    expect(await db.select().from(copies)).toHaveLength(0)
  })

  it('[US01-CA4] livro com histórico é inativado e fica na página', async () => {
    await asLibrarian()
    const copy = await makeCopy(db)
    await makeLoan(db, { copy })

    const result = await removeBookAction(idle, formOf({ bookId: copy.bookId }))

    expect(result).toMatchObject({ status: 'ok', data: { mode: 'inativar' } })
  })
})
