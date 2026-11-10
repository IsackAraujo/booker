import { eq } from 'drizzle-orm'
import { createTestDb, type TestDb } from '@tests/support/db'
import { makeStudent, makeUser } from '@tests/factories'
import { auditLog, students } from '@/db/schema'
import { fixedClock } from '@/lib/clock'
import { BusinessError } from '@/lib/errors'
import { TEMPLATE_COLUMNS } from './rules'
import * as service from './service'

const HEADERS = TEMPLATE_COLUMNS.map((c) => c.header)
const clock = fixedClock('2026-02-02')

let db: TestDb
let userId: number
beforeEach(async () => {
  db = await createTestDb()
  userId = (await makeUser(db)).id
})

describe('US02 Importar alunos — serviço', () => {
  it('[US02-CA1] arquivo fora do modelo não importa nada', async () => {
    const sheet = { headers: ['Nome', 'Turma'], rows: [['Ana', '5A']] }

    await expect(service.importStudents(db, clock, userId, sheet)).rejects.toMatchObject({
      code: 'IMPORT_TEMPLATE',
    })
    expect(await db.select().from(students)).toHaveLength(0)
  })

  it('[US02-CA1] planilha só com cabeçalho é recusada', async () => {
    await expect(
      service.importStudents(db, clock, userId, { headers: HEADERS, rows: [] }),
    ).rejects.toMatchObject({
      code: 'IMPORT_EMPTY',
    })
  })

  it('[US02-CA2] [US02-CA4] importa as válidas, recusa as inválidas e informa as contagens', async () => {
    const sheet = {
      headers: HEADERS,
      rows: [
        ['1', 'Ana', '5A', '(51) 99999-0001'],
        ['2', 'Bruno', '', '(51) 99999-0002'],
        ['3', 'Caio', '5B', '(51) 3333-0000'],
        ['4', 'Duda', '5B', '(51) 99999-0004'],
      ],
    }

    const result = await service.importStudents(db, clock, userId, sheet)

    expect(result.created).toBe(2)
    expect(result.updated).toBe(0)
    expect(result.rejected.map((r) => [r.line, r.reasons])).toEqual([
      [3, ['Sem turma']],
      [4, ['Telefone do responsável inválido']],
    ])
    const saved = await db.select().from(students)
    expect(saved.map((s) => s.registration).sort()).toEqual(['1', '4'])
    expect(saved.find((s) => s.registration === '1')!.guardianPhone).toBe('+5551999990001')
  })

  it('[US02-CA3] aluno já cadastrado é atualizado, não duplicado', async () => {
    await makeStudent(db, {
      registration: '1',
      name: 'Ana',
      className: '4A',
      guardianPhone: '+5551999990001',
    })

    const result = await service.importStudents(db, clock, userId, {
      headers: HEADERS,
      rows: [['1', 'Ana Souza', '5A', '51988880000']],
    })

    expect(result).toMatchObject({ created: 0, updated: 1 })
    const all = await db.select().from(students)
    expect(all).toHaveLength(1)
    expect(all[0]).toMatchObject({ name: 'Ana Souza', className: '5A', guardianPhone: '+5551988880000' })
  })

  it('[US02-CA3] reimportar não reativa aluno transferido (situação é decidida na US06)', async () => {
    await makeStudent(db, { registration: '1', status: 'transferido' })

    await service.importStudents(db, clock, userId, {
      headers: HEADERS,
      rows: [['1', 'Ana', '5A', '51999990001']],
    })

    const [s] = await db.select().from(students)
    expect(s!.status).toBe('transferido')
  })

  it('registra a importação no histórico com as contagens', async () => {
    await service.importStudents(db, clock, userId, {
      headers: HEADERS,
      rows: [
        ['1', 'Ana', '5A', '51999990001'],
        ['2', '', '5A', '51999990002'],
      ],
    })

    const [log] = await db.select().from(auditLog)
    expect(log).toMatchObject({
      userId,
      action: 'alunos.importar',
      payload: { created: 1, updated: 0, rejected: 1 },
    })
  })
})

describe('T2.3 Cadastro e edição manual de aluno', () => {
  const input = { registration: '10', name: 'Raissa', className: '5a', guardianPhone: '(51) 99999-0010' }

  it('cadastra aluno normalizado e registra no histórico', async () => {
    const s = await service.createStudent(db, clock, userId, input)

    expect(s).toMatchObject({
      registration: '10',
      className: '5A',
      guardianPhone: '+5551999990010',
      status: 'ativo',
    })
    const [log] = await db.select().from(auditLog)
    expect(log).toMatchObject({ action: 'aluno.cadastrar', entityId: s.id })
  })

  it('[US02-CA2] recusa cadastro sem nome, turma ou com telefone inválido', async () => {
    await expect(
      service.createStudent(db, clock, userId, { ...input, name: '', guardianPhone: '1' }),
    ).rejects.toThrow('Sem nome; Telefone do responsável inválido')
    expect(await db.select().from(students)).toHaveLength(0)
  })

  it('[US02-CA3] recusa cadastro com matrícula existente', async () => {
    await makeStudent(db, { registration: '10' })

    await expect(service.createStudent(db, clock, userId, input)).rejects.toMatchObject({
      code: 'STUDENT_DUPLICATE',
    })
  })

  it('edita aluno e guarda antes e depois no histórico', async () => {
    const s = await makeStudent(db, { registration: '10', name: 'Raisa', className: '5A' })

    const updated = await service.updateStudent(db, clock, userId, s.id, {
      ...input,
      name: 'Raissa',
      className: '5B',
    })

    expect(updated).toMatchObject({ name: 'Raissa', className: '5B' })
    const [log] = await db.select().from(auditLog)
    expect(log!.payload).toMatchObject({
      antes: { name: 'Raisa', className: '5A' },
      depois: { name: 'Raissa', className: '5B' },
    })
  })

  it('não deixa trocar a matrícula para a de outro aluno', async () => {
    await makeStudent(db, { registration: '10' })
    const other = await makeStudent(db, { registration: '11' })

    await expect(service.updateStudent(db, clock, userId, other.id, input)).rejects.toBeInstanceOf(
      BusinessError,
    )
    const [still] = await db.select().from(students).where(eq(students.id, other.id))
    expect(still!.registration).toBe('11')
  })

  it('edição de aluno inexistente falha', async () => {
    await expect(service.updateStudent(db, clock, userId, 999, input)).rejects.toThrow('Aluno não encontrado')
  })

  it('busca por nome, matrícula ou turma', async () => {
    await makeStudent(db, { name: 'Ana Souza', registration: 'A1', className: '5A' })
    await makeStudent(db, { name: 'Bruno', registration: 'B2', className: '6B' })

    expect((await service.searchStudents(db, 'souza')).map((s) => s.registration)).toEqual(['A1'])
    expect((await service.searchStudents(db, 'b2')).map((s) => s.registration)).toEqual(['B2'])
    expect((await service.searchStudents(db, '6b')).map((s) => s.registration)).toEqual(['B2'])
    expect(await service.searchStudents(db)).toHaveLength(2)
  })
})
