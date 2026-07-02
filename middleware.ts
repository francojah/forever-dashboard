import { createServerClient } from '@supabase/ssr'
import { NextResponse, type NextRequest } from 'next/server'

export async function middleware(request: NextRequest) {
  let response = NextResponse.next({ request: { headers: request.headers } })

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        get(name: string) { return request.cookies.get(name)?.value },
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        set(name: string, value: string, options: any) {
          request.cookies.set({ name, value, ...options })
          response = NextResponse.next({ request: { headers: request.headers } })
          response.cookies.set({ name, value, ...options })
        },
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        remove(name: string, options: any) {
          request.cookies.set({ name, value: '', ...options })
          response = NextResponse.next({ request: { headers: request.headers } })
          response.cookies.set({ name, value: '', ...options })
        },
      },
    }
  )

  const { data: { user } } = await supabase.auth.getUser()
  const { pathname } = request.nextUrl

  // Rutas públicas: landing estática de Faro + API (dejan pasar sin auth)
  if (pathname === '/landing.html' || pathname.startsWith('/api')) {
    return response
  }

  // Home pública: quien NO inició sesión ve la landing de Faro en "/"
  // (el usuario logueado ve su dashboard en "/" normalmente).
  if (!user && pathname === '/') {
    return NextResponse.rewrite(new URL('/landing.html', request.url))
  }

  // Resto de rutas protegidas: sin sesión → login
  if (!user && !pathname.startsWith('/login') && !pathname.startsWith('/signup')) {
    return NextResponse.redirect(new URL('/login', request.url))
  }

  // Si ya está logueado y va al login → dashboard (home)
  if (user && pathname === '/login') {
    return NextResponse.redirect(new URL('/', request.url))
  }

  return response
}

export const config = {
  matcher: ['/((?!_next/static|_next/image|favicon.ico|manifest.json|icon-|.*\\.(?:svg|png|jpg|jpeg|gif|webp|ico|json|txt|xml)$).*)'],
}
