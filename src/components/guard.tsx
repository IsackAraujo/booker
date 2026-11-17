import { currentUser, type Role, type SessionUser } from '@/lib/session'

/**
 * Protege uma página: devolve o usuário se tiver um dos perfis, ou a mensagem a exibir.
 * A autorização definitiva é sempre a da Server Action (requireRole); isto só evita mostrar a tela.
 */
export async function guardPage(
  ...roles: Role[]
): Promise<{ user: SessionUser; denied: null } | { user: null; denied: React.ReactNode }> {
  const user = await currentUser()
  if (!user) return { user: null, denied: <Denied text="É preciso entrar no sistema." /> }
  if (!roles.includes(user.role))
    return { user: null, denied: <Denied text="Seu perfil não tem acesso a esta função." /> }
  return { user, denied: null }
}

function Denied({ text }: { text: string }) {
  return <p className="card text-slate-700">{text}</p>
}
