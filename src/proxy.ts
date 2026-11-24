import { NextResponse, type NextRequest } from 'next/server'

// Verificação otimista (Next.js 16 "proxy"): sem cookie de sessão, vai para o login antes de renderizar.
// A verificação de verdade (assinatura, usuário ativo, perfil) é feita nas páginas e Server Actions.

const PUBLIC = ['/login', '/api/telegram/webhook', '/api/cron/']

export function proxy(request: NextRequest) {
  const { pathname, search } = request.nextUrl
  if (PUBLIC.some((p) => pathname === p || pathname.startsWith(p))) return NextResponse.next()
  if (request.cookies.has('booker_session')) return NextResponse.next()
  // Sessão de desenvolvimento dos E2E (nunca em produção).
  if (
    process.env.DEV_SESSION_ROLE &&
    process.env.NODE_ENV !== 'production' &&
    request.cookies.get('dev_role')?.value !== 'none'
  )
    return NextResponse.next()
  const url = request.nextUrl.clone()
  url.pathname = '/login'
  url.search = pathname === '/' ? '' : `?next=${encodeURIComponent(pathname + search)}`
  return NextResponse.redirect(url)
}

export const config = {
  matcher: ['/((?!_next/static|_next/image|favicon.ico).*)'],
}
