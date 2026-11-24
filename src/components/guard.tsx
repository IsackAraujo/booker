import { redirect } from 'next/navigation'
import { currentUser, type Role, type SessionUser } from '@/lib/session'

/**
 * Protege uma página: sem login, manda para /login (US03-CA1); com perfil errado, mostra a mensagem (CA2).
 * A autorização definitiva é sempre a da Server Action (requireRole); isto só evita mostrar a tela.
 */
export async function guardPage(
  ...roles: Role[]
): Promise<{ user: SessionUser; denied: null } | { user: null; denied: React.ReactElement }> {
  const user = await currentUser()
  if (!user) redirect('/login')
  if (!roles.includes(user.role))
    return { user: null, denied: <Denied text="Seu perfil não tem acesso a esta função." /> }
  return { user, denied: null }
}

function Denied({ text }: { text: string }) {
  return <p className="card text-slate-700">{text}</p>
}
