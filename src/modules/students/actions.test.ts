import { createTestDb, type TestDb } from '@tests/support/db'
import { setTestDeps } from '@tests/support/deps'
import { asSession, makeUser } from '@tests/factories'
import { fakeUser, loginAs, rolesExcept } from '@tests/support/session'
import { students } from '@/db/schema'
import { fixedClock } from '@/lib/clock'
import { idle } from '@/lib/action'
import { importStudentsAction, saveStudentAction } from './actions'

let db: TestDb
beforeEach(async () => {
  db = await createTestDb()
  setTestDeps({ db, clock: fixedClock('2026-02-02') })
})

function csvForm(content: string, name = 'alunos.csv') {
  const form = new FormData()
  form.set('file', new File([content], name, { type: 'text/csv' }))
  return form
}

const CSV = 'Matrícula;Nome do aluno;Turma;Telefone do responsável\n1;Ana;5A;51999990001\n2;;5A;51999990002\n'

describe('US02 Importar alunos — Server Actions', () => {
  it('[US03-CA1] sem sessão não importa', async () => {
    const result = await importStudentsAction(idle, csvForm(CSV))

    expect(result).toEqual({ status: 'error', message: 'É preciso entrar no sistema.' })
    expect(await db.select().from(students)).toHaveLength(0)
  })

  it.each(rolesExcept('bibliotecaria'))('[US03-CA2] perfil %s não importa', async (role) => {
    loginAs(fakeUser(role))

    const result = await importStudentsAction(idle, csvForm(CSV))

    expect(result).toEqual({ status: 'error', message: 'Seu perfil não tem acesso a esta função.' })
  })

  it('[US02-CA4] bibliotecária importa e recebe o resumo', async () => {
    loginAs(asSession(await makeUser(db, { role: 'bibliotecaria' })))

    const result = await importStudentsAction(idle, csvForm(CSV))

    expect(result).toMatchObject({
      status: 'ok',
      data: { created: 1, updated: 0, rejected: [{ line: 3, reasons: ['Sem nome'] }] },
    })
  })

  it('[US02-CA1] arquivo fora do modelo mostra as colunas que faltam', async () => {
    loginAs(asSession(await makeUser(db)))

    const result = await importStudentsAction(idle, csvForm('Nome;Turma\nAna;5A\n'))

    expect(result).toMatchObject({ status: 'error', message: expect.stringContaining('Matrícula') })
  })

  it('[US02-CA1] formato de arquivo não aceito', async () => {
    loginAs(asSession(await makeUser(db)))

    const result = await importStudentsAction(idle, csvForm('x', 'alunos.pdf'))

    expect(result).toMatchObject({ status: 'error', message: expect.stringContaining('.xlsx ou .csv') })
  })

  it('sem arquivo pede para escolher a planilha', async () => {
    loginAs(asSession(await makeUser(db)))

    const result = await importStudentsAction(idle, new FormData())

    expect(result).toEqual({ status: 'error', message: 'Escolha o arquivo da planilha.' })
  })
})

describe('T2.3 Cadastro manual — Server Action', () => {
  function studentForm(fields: Record<string, string>) {
    const form = new FormData()
    for (const [k, v] of Object.entries(fields)) form.set(k, v)
    return form
  }
  const fields = { registration: '10', name: 'Raissa', className: '5A', guardianPhone: '51999990010' }

  it.each(rolesExcept('bibliotecaria'))('[US03-CA2] perfil %s não cadastra aluno', async (role) => {
    loginAs(fakeUser(role))

    expect(await saveStudentAction(idle, studentForm(fields))).toMatchObject({ status: 'error' })
  })

  it('cadastra e depois edita pelo mesmo formulário', async () => {
    loginAs(asSession(await makeUser(db)))

    const created = await saveStudentAction(idle, studentForm(fields))
    expect(created).toMatchObject({ status: 'ok', message: 'Aluno salvo.' })
    const id = (created as { data: { id: number } }).data.id

    const edited = await saveStudentAction(
      idle,
      studentForm({ ...fields, id: String(id), name: 'Raissa Lima' }),
    )

    expect(edited).toMatchObject({ status: 'ok', data: { id, name: 'Raissa Lima' } })
  })

  it('[US02-CA2] mostra os motivos quando o aluno é inválido', async () => {
    loginAs(asSession(await makeUser(db)))

    const result = await saveStudentAction(idle, studentForm({ ...fields, className: '' }))

    expect(result).toEqual({ status: 'error', message: 'Sem turma' })
  })
})
