'use server'

import { revalidatePath } from 'next/cache'
import { z } from 'zod'
import { runAction, type ActionState } from '@/lib/action'
import { getDeps } from '@/lib/deps'
import { BusinessError } from '@/lib/errors'
import { requireRole } from '@/lib/session'
import * as service from './service'
import { readSpreadsheet, SpreadsheetFormatError } from './spreadsheet'

const MAX_FILE_BYTES = 5 * 1024 * 1024

export async function importStudentsAction(
  _prev: ActionState<service.ImportResult>,
  form: FormData,
): Promise<ActionState<service.ImportResult>> {
  return runAction(async () => {
    const user = await requireRole('bibliotecaria')
    const file = form.get('file')
    if (!(file instanceof File) || file.size === 0) {
      throw new BusinessError('Escolha o arquivo da planilha.', 'IMPORT_NO_FILE')
    }
    if (file.size > MAX_FILE_BYTES) throw new BusinessError('Arquivo maior que 5 MB.', 'IMPORT_TOO_BIG')
    let sheet
    try {
      sheet = await readSpreadsheet(file.name, await file.arrayBuffer())
    } catch (err) {
      if (err instanceof SpreadsheetFormatError) throw new BusinessError(err.message, 'IMPORT_FORMAT')
      throw err
    }
    const { db, clock } = await getDeps()
    const result = await service.importStudents(db, clock, user.id, sheet)
    revalidatePath('/alunos')
    return result
  })
}

const studentForm = z.object({
  registration: z.string().default(''),
  name: z.string().default(''),
  className: z.string().default(''),
  guardianPhone: z.string().default(''),
})

function readStudentForm(form: FormData) {
  return studentForm.parse({
    registration: form.get('registration') ?? '',
    name: form.get('name') ?? '',
    className: form.get('className') ?? '',
    guardianPhone: form.get('guardianPhone') ?? '',
  })
}

export async function saveStudentAction(
  _prev: ActionState<service.Student>,
  form: FormData,
): Promise<ActionState<service.Student>> {
  return runAction(async () => {
    const user = await requireRole('bibliotecaria')
    const { db, clock } = await getDeps()
    const input = readStudentForm(form)
    const id = Number(form.get('id') || 0)
    const saved = id
      ? await service.updateStudent(db, clock, user.id, id, input)
      : await service.createStudent(db, clock, user.id, input)
    revalidatePath('/alunos')
    return saved
  }, 'Aluno salvo.')
}
