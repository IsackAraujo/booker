import Link from 'next/link'
import { redirect } from 'next/navigation'
import { currentUser } from '@/lib/session'
import { navFor } from '@/components/nav'

export const dynamic = 'force-dynamic'

export default async function Home() {
  const user = await currentUser()
  if (!user) redirect('/login')
  const links = navFor(user.role)
  return (
    <section className="space-y-4">
      <h1 className="text-2xl font-semibold">Biblioteca</h1>
      <p className="text-slate-600">Olá, {user.name}. Escolha uma função:</p>
      <ul className="grid grid-cols-2 gap-3 sm:grid-cols-3">
        {links.map((item) => (
          <li key={item.href}>
            <Link href={item.href} className="card block text-emerald-900 hover:border-emerald-600">
              {item.label}
            </Link>
          </li>
        ))}
      </ul>
    </section>
  )
}
