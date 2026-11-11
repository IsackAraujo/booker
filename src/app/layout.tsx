import type { Metadata, Viewport } from 'next'
import Link from 'next/link'
import './globals.css'

export const metadata: Metadata = {
  title: 'Booker — Biblioteca',
  description: 'Sistema de empréstimos da biblioteca escolar',
}

export const viewport: Viewport = { width: 'device-width', initialScale: 1 }

// Cada história acrescenta aqui a sua entrada de menu.
const nav: { href: string; label: string }[] = [
  { href: '/alunos', label: 'Alunos' },
  { href: '/balcao/devolucao', label: 'Devolução' },
]

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="pt-BR">
      <body>
        <header className="border-b border-slate-200 bg-white">
          <div className="mx-auto flex max-w-5xl flex-wrap items-center gap-x-6 gap-y-2 px-4 py-3">
            <Link href="/" className="text-lg font-semibold text-emerald-800">
              Booker
            </Link>
            <nav className="flex flex-wrap gap-4 text-sm">
              {nav.map((item) => (
                <Link key={item.href} href={item.href} className="text-slate-600 hover:text-slate-900">
                  {item.label}
                </Link>
              ))}
            </nav>
          </div>
        </header>
        <main className="mx-auto max-w-5xl px-4 py-6">{children}</main>
      </body>
    </html>
  )
}
