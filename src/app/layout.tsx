import type { Metadata, Viewport } from 'next'
import Link from 'next/link'
import { navFor } from '@/components/nav'
import { currentUser } from '@/lib/session'
import { logoutAction } from '@/modules/users/actions'
import { ROLE_LABEL } from '@/modules/users/rules'
import './globals.css'

export const metadata: Metadata = {
  title: 'Booker — Biblioteca',
  description: 'Sistema de empréstimos da biblioteca escolar',
}

export const viewport: Viewport = { width: 'device-width', initialScale: 1 }

export default async function RootLayout({ children }: { children: React.ReactNode }) {
  const user = await currentUser()
  const nav = user ? navFor(user.role) : []
  return (
    <html lang="pt-BR">
      <body>
        <header className="border-b border-slate-200 bg-white">
          <div className="mx-auto flex max-w-5xl flex-wrap items-center gap-x-6 gap-y-2 px-4 py-3">
            <Link href="/" className="text-lg font-semibold text-emerald-800">
              Booker
            </Link>
            <nav className="flex flex-1 flex-wrap gap-4 text-sm">
              {nav.map((item) => (
                <Link key={item.href} href={item.href} className="text-slate-600 hover:text-slate-900">
                  {item.label}
                </Link>
              ))}
            </nav>
            {user && (
              <form action={logoutAction} className="flex items-center gap-3 text-sm">
                <span className="text-slate-600" data-testid="user-name">
                  {user.name} <span className="text-slate-400">({ROLE_LABEL[user.role]})</span>
                </span>
                <button className="text-emerald-800 underline">Sair</button>
              </form>
            )}
          </div>
        </header>
        <main className="mx-auto max-w-5xl px-4 py-6">{children}</main>
      </body>
    </html>
  )
}
