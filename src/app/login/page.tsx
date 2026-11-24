import { redirect } from 'next/navigation'
import { currentUser } from '@/lib/session'
import { LoginForm } from './login-form'

export const dynamic = 'force-dynamic'

export default async function LoginPage({ searchParams }: { searchParams: Promise<{ next?: string }> }) {
  if (await currentUser()) redirect('/')
  const { next = '' } = await searchParams
  return (
    <section className="mx-auto max-w-sm space-y-4 pt-8">
      <h1 className="text-2xl font-semibold">Entrar</h1>
      <p className="text-sm text-slate-600">Use o e-mail e a senha cadastrados pela biblioteca.</p>
      <LoginForm next={next} />
    </section>
  )
}
