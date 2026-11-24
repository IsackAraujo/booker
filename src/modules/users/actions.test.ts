import { createTestDb, type TestDb } from '@tests/support/db'
import { setTestDeps } from '@tests/support/deps'
import { asSession, makeUser } from '@tests/factories'
import { fakeUser, loginAs, rolesExcept } from '@tests/support/session'
import { users } from '@/db/schema'
import { idle } from '@/lib/action'
import { verifySession } from '@/lib/auth/token'
import { fixedClock } from '@/lib/clock'

// Cookies e redirect do Next simulados: o login grava o cookie e redireciona.
const jar = new Map<string, string>()
vi.mock('next/headers', () => ({
  cookies: async () => ({
    get: (name: string) => (jar.has(name) ? { name, value: jar.get(name)! } : undefined),
    set: (name: string, value: string) => void jar.set(name, value),
    delete: (name: string) => void jar.delete(name),
  }),
}))
class Redirect extends Error {
  constructor(readonly to: string) {
    super(`redirect ${to}`)
  }
}
vi.mock('next/navigation', () => ({
  redirect: (to: string) => {
    throw new Redirect(to)
  },
}))

const { createUserAction, loginAction, logoutAction, resetPasswordAction, setUserActiveAction } =
  await import('./actions')

const clock = fixedClock('2026-11-24')
let db: TestDb
beforeEach(async () => {
  jar.clear()
  db = await createTestDb()
  setTestDeps({ db, clock })
})

function form(fields: Record<string, string>) {
  const f = new FormData()
  for (const [k, v] of Object.entries(fields)) f.set(k, v)
  return f
}

describe('T3.1 Login — Server Actions', () => {
  async function seedUser() {
    const { createUser } = await import('./service')
    const admin = await makeUser(db)
    return createUser(db, admin.id, {
      name: 'Sandra',
      email: 'sandra@x.com',
      role: 'professor',
      password: 'segredo123',
    })
  }

  it('[US03-CA1] login certo grava o cookie de sessão e vai para o destino pedido', async () => {
    const u = await seedUser()

    await expect(
      loginAction(idle, form({ email: 'sandra@x.com', password: 'segredo123', next: '/reservas/turma' })),
    ).rejects.toMatchObject({ to: '/reservas/turma' })

    const session = await verifySession(jar.get('booker_session'), clock.now())
    expect(session).toEqual({ userId: u.id, role: 'professor', name: 'Sandra' })
  })

  it.each(['https://golpe.com', '//golpe.com', '/login'])(
    'destino externo ou o próprio login vira a página inicial: %s',
    async (next) => {
      await seedUser()

      await expect(
        loginAction(idle, form({ email: 'sandra@x.com', password: 'segredo123', next })),
      ).rejects.toMatchObject({
        to: '/',
      })
    },
  )

  it('senha errada não grava cookie e mostra mensagem genérica', async () => {
    await seedUser()

    expect(await loginAction(idle, form({ email: 'sandra@x.com', password: 'errada' }))).toEqual({
      status: 'error',
      message: 'E-mail ou senha incorretos.',
    })
    expect(jar.has('booker_session')).toBe(false)
  })

  it('sair apaga o cookie e volta ao login', async () => {
    jar.set('booker_session', 'x')

    await expect(logoutAction()).rejects.toMatchObject({ to: '/login' })
    expect(jar.has('booker_session')).toBe(false)
  })
})

describe('US03 Gestão de acessos — Server Actions', () => {
  it.each(rolesExcept('bibliotecaria'))('[US03-CA2] perfil %s não gerencia usuários', async (role) => {
    loginAs(fakeUser(role))

    for (const action of [createUserAction, setUserActiveAction, resetPasswordAction]) {
      expect(
        await action(
          idle,
          form({ userId: '1', name: 'A', email: 'a@x.com', role: 'professor', password: 'segredo123' }),
        ),
      ).toMatchObject({
        status: 'error',
        message: 'Seu perfil não tem acesso a esta função.',
      })
    }
  })

  it('[US03-CA1] sem sessão não cadastra', async () => {
    expect(await createUserAction(idle, form({}))).toMatchObject({ message: 'É preciso entrar no sistema.' })
  })

  it('bibliotecária cadastra, desativa e redefine senha', async () => {
    const admin = await makeUser(db)
    loginAs(asSession(admin))

    expect(
      await createUserAction(
        idle,
        form({ name: 'Sandra', email: 'sandra@x.com', role: 'professor', password: 'segredo123' }),
      ),
    ).toMatchObject({ status: 'ok' })
    const created = (await db.select().from(users)).find((u) => u.email === 'sandra@x.com')!
    expect(
      await setUserActiveAction(idle, form({ userId: String(created.id), active: 'false' })),
    ).toMatchObject({ status: 'ok' })
    expect(
      await resetPasswordAction(idle, form({ userId: String(created.id), password: 'outrasenha1' })),
    ).toMatchObject({
      status: 'ok',
      message: 'Senha redefinida.',
    })
  })
})
