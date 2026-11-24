import { guardPage } from '@/components/guard'
import { getDb } from '@/db/client'
import { ROLE_LABEL } from '@/modules/users/rules'
import { listUsers } from '@/modules/users/service'
import { NewUserForm, ResetPassword, ToggleActive } from './user-forms'

export const dynamic = 'force-dynamic'

/** US03: cada pessoa com o seu acesso, inclusive substitutos. Só a bibliotecária gerencia. */
export default async function UsuariosPage() {
  const { user, denied } = await guardPage('bibliotecaria')
  if (denied) return denied
  const list = await listUsers(await getDb())

  return (
    <section className="space-y-6">
      <h1 className="text-2xl font-semibold">Usuários</h1>
      <div className="overflow-x-auto">
        <table className="w-full text-left text-sm">
          <thead className="text-slate-500">
            <tr>
              <th className="py-2">Nome</th>
              <th>E-mail</th>
              <th>Perfil</th>
              <th>Situação</th>
              <th className="sr-only">Ações</th>
            </tr>
          </thead>
          <tbody>
            {list.map((u) => (
              <tr key={u.id} className="border-t border-slate-200 align-top">
                <td className="py-2">{u.name}</td>
                <td>{u.email}</td>
                <td>{ROLE_LABEL[u.role]}</td>
                <td>{u.active ? 'Ativo' : 'Desativado'}</td>
                <td className="space-y-2 py-2 text-right">
                  {u.id !== user.id && <ToggleActive userId={u.id} name={u.name} active={u.active} />}
                  <ResetPassword userId={u.id} name={u.name} />
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <div className="space-y-2">
        <h2 className="text-lg font-semibold">Novo usuário</h2>
        <NewUserForm />
      </div>
    </section>
  )
}
