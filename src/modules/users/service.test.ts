import bcrypt from 'bcryptjs'
import { eq } from 'drizzle-orm'
import { createTestDb, type TestDb } from '@tests/support/db'
import { makeUser } from '@tests/factories'
import { auditLog, users } from '@/db/schema'
import { validateUser } from './rules'
import * as service from './service'

let db: TestDb
let admin: { id: number }
beforeEach(async () => {
  db = await createTestDb()
  admin = await makeUser(db, { role: 'bibliotecaria', name: 'Roseli' })
})

const valid = {
  name: 'Sandra',
  email: 'Sandra@Escola.edu.br ',
  role: 'bibliotecaria',
  password: 'segredo123',
}

describe('US03 Usuários — regras', () => {
  it('cadastro válido', () => {
    expect(validateUser(valid)).toEqual([])
  })

  it('aponta todos os problemas de uma vez', () => {
    expect(validateUser({ name: ' ', email: 'x', role: 'aluno', password: '123' })).toEqual([
      'Informe o nome',
      'E-mail inválido',
      'Escolha o perfil',
      'A senha precisa ter pelo menos 8 caracteres.',
    ])
  })
})

describe('T3.1 Login', () => {
  it('[US03-CA1] entra com e-mail e senha certos, sem diferenciar maiúsculas no e-mail', async () => {
    await service.createUser(db, admin.id, valid)

    expect(await service.authenticate(db, 'SANDRA@escola.edu.br', 'segredo123')).toMatchObject({
      name: 'Sandra',
      role: 'bibliotecaria',
    })
  })

  it.each([
    ['sandra@escola.edu.br', 'errada123'],
    ['ninguem@escola.edu.br', 'segredo123'],
  ])('recusa %s / senha errada ou e-mail desconhecido', async (email, password) => {
    await service.createUser(db, admin.id, valid)

    expect(await service.authenticate(db, email, password)).toBeNull()
  })

  it('usuário desativado não entra e a sessão dele deixa de valer', async () => {
    const u = await service.createUser(db, admin.id, valid)
    await service.setUserActive(db, admin.id, u.id, false)

    expect(await service.authenticate(db, 'sandra@escola.edu.br', 'segredo123')).toBeNull()
    expect(await service.activeUser(db, u.id)).toBeNull()
  })

  it('senha é guardada com hash, nunca em texto', async () => {
    const u = await service.createUser(db, admin.id, valid)

    const [saved] = await db.select().from(users).where(eq(users.id, u.id))
    expect(saved!.passwordHash).not.toContain('segredo123')
    expect(await bcrypt.compare('segredo123', saved!.passwordHash)).toBe(true)
  })

  it('[US03-CA3] entrada fica registrada no histórico', async () => {
    await service.recordLogin(db, admin.id)

    const [log] = await db.select().from(auditLog)
    expect(log).toMatchObject({ userId: admin.id, action: 'usuario.entrar' })
  })
})

describe('US03 Gestão de acessos', () => {
  it('cadastra com e-mail normalizado e registra quem cadastrou', async () => {
    const u = await service.createUser(db, admin.id, valid)

    expect(u).toMatchObject({ email: 'sandra@escola.edu.br', role: 'bibliotecaria' })
    const [log] = await db.select().from(auditLog)
    expect(log).toMatchObject({ userId: admin.id, action: 'usuario.cadastrar', entityId: u.id })
  })

  it('não repete e-mail', async () => {
    await service.createUser(db, admin.id, valid)

    await expect(service.createUser(db, admin.id, { ...valid, name: 'Outra' })).rejects.toMatchObject({
      code: 'USER_DUPLICATE',
    })
  })

  it('recusa cadastro inválido', async () => {
    await expect(service.createUser(db, admin.id, { ...valid, password: '1' })).rejects.toMatchObject({
      code: 'USER_INVALID',
    })
  })

  it('ninguém desativa o próprio acesso', async () => {
    await expect(service.setUserActive(db, admin.id, admin.id, false)).rejects.toMatchObject({
      code: 'USER_SELF',
    })
  })

  it('sempre sobra uma bibliotecária ativa', async () => {
    const other = await makeUser(db, { role: 'coordenacao' })

    await expect(service.setUserActive(db, other.id, admin.id, false)).rejects.toMatchObject({
      code: 'USER_LAST_ADMIN',
    })
  })

  it('desativa e reativa, com histórico', async () => {
    const u = await service.createUser(db, admin.id, { ...valid, role: 'professor' })

    await service.setUserActive(db, admin.id, u.id, false)
    await service.setUserActive(db, admin.id, u.id, true)

    expect(await service.activeUser(db, u.id)).toMatchObject({ id: u.id })
    const actions = (await db.select().from(auditLog)).map((l) => l.action)
    expect(actions).toEqual(['usuario.cadastrar', 'usuario.desativar', 'usuario.ativar'])
  })

  it('redefinir senha troca o acesso', async () => {
    const u = await service.createUser(db, admin.id, valid)

    await service.resetPassword(db, admin.id, u.id, 'novasenha9')

    expect(await service.authenticate(db, 'sandra@escola.edu.br', 'segredo123')).toBeNull()
    expect(await service.authenticate(db, 'sandra@escola.edu.br', 'novasenha9')).not.toBeNull()
  })

  it('redefinir com senha curta ou para usuário inexistente', async () => {
    await expect(service.resetPassword(db, admin.id, admin.id, '123')).rejects.toMatchObject({
      code: 'USER_INVALID',
    })
    await expect(service.resetPassword(db, admin.id, 999, 'novasenha9')).rejects.toThrow(
      'Usuário não encontrado',
    )
    await expect(service.setUserActive(db, admin.id, 999, true)).rejects.toThrow('Usuário não encontrado')
  })

  it('lista em ordem de nome', async () => {
    await service.createUser(db, admin.id, { ...valid, name: 'Ana', email: 'ana@x.com' })

    expect((await service.listUsers(db)).map((u) => u.name)).toEqual(['Ana', 'Roseli'])
  })
})
