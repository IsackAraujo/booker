'use server'

import { revalidatePath } from 'next/cache'
import { redirect } from 'next/navigation'
import { z } from 'zod'
import { runAction, type ActionState } from '@/lib/action'
import { getDeps } from '@/lib/deps'
import { BusinessError } from '@/lib/errors'
import { requireRole } from '@/lib/session'
import { MANUAL_COPY_STATUSES } from './rules'
import * as service from './service'

const bookForm = z.object({
  title: z.string().default(''),
  author: z.string().default(''),
  category: z.string().default(''),
  ageRange: z.string().default(''),
})

const id = z.coerce.number().int().positive()

function readId(form: FormData, field: string) {
  const parsed = id.safeParse(form.get(field))
  if (!parsed.success) throw new BusinessError('Registro não informado.', 'NO_ID')
  return parsed.data
}

/** Cadastro e edição de livro (T1.2). Com `id` no formulário, edita. */
export async function saveBookAction(
  _prev: ActionState<service.Book>,
  form: FormData,
): Promise<ActionState<service.Book>> {
  return runAction(async () => {
    const user = await requireRole('bibliotecaria')
    const { db, clock } = await getDeps()
    const input = bookForm.parse({
      title: form.get('title') ?? '',
      author: form.get('author') ?? '',
      category: form.get('category') ?? '',
      ageRange: form.get('ageRange') ?? '',
    })
    const bookId = Number(form.get('id') || 0)
    const saved = bookId
      ? await service.updateBook(db, user.id, bookId, input)
      : await service.createBook(db, clock, user.id, input)
    revalidatePath('/acervo')
    return saved
  }, 'Livro salvo.')
}

/** Cadastro de exemplares (T1.3): um código por linha. */
export async function addCopiesAction(
  _prev: ActionState<service.Copy[]>,
  form: FormData,
): Promise<ActionState<service.Copy[]>> {
  return runAction(async () => {
    const user = await requireRole('bibliotecaria')
    const bookId = readId(form, 'bookId')
    const codes = String(form.get('codes') ?? '').split(/[\n,;]+/)
    const { db, clock } = await getDeps()
    const created = await service.addCopies(db, clock, user.id, bookId, codes)
    revalidatePath(`/acervo/${bookId}`)
    return created
  })
}

const statusInput = z.enum(MANUAL_COPY_STATUSES)

export async function setCopyStatusAction(
  _prev: ActionState<service.Copy>,
  form: FormData,
): Promise<ActionState<service.Copy>> {
  return runAction(async () => {
    const user = await requireRole('bibliotecaria')
    const copyId = readId(form, 'copyId')
    const status = statusInput.safeParse(form.get('status'))
    if (!status.success) throw new BusinessError('Situação inválida.', 'COPY_STATUS_INVALID')
    const { db } = await getDeps()
    const copy = await service.setCopyStatus(db, user.id, copyId, status.data)
    revalidatePath(`/acervo/${copy.bookId}`)
    return copy
  }, 'Situação do exemplar atualizada.')
}

/** Exclui ou inativa (US01-CA4) — quem decide é o histórico do livro, não a tela. */
export async function removeBookAction(
  _prev: ActionState<{ mode: 'excluir' | 'inativar'; title: string }>,
  form: FormData,
): Promise<ActionState<{ mode: 'excluir' | 'inativar'; title: string }>> {
  const state = await runAction(async () => {
    const user = await requireRole('bibliotecaria')
    const bookId = readId(form, 'bookId')
    const { db } = await getDeps()
    const result = await service.removeBook(db, user.id, bookId)
    revalidatePath('/acervo')
    return result
  })
  // Excluído, a página do livro deixa de existir: volta para a lista (fora do runAction, que capturaria o redirect).
  if (state.status === 'ok' && state.data.mode === 'excluir') redirect('/acervo')
  return state
}

export async function reactivateBookAction(
  _prev: ActionState<service.Book>,
  form: FormData,
): Promise<ActionState<service.Book>> {
  return runAction(async () => {
    const user = await requireRole('bibliotecaria')
    const bookId = readId(form, 'bookId')
    const { db } = await getDeps()
    const book = await service.reactivateBook(db, user.id, bookId)
    revalidatePath('/acervo')
    return book
  }, 'Livro reativado.')
}
