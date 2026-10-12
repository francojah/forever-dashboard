import { NextResponse } from 'next/server'
import { createClientServer } from '@/lib/supabase'

export const dynamic = 'force-dynamic'

/** Vuelta de Supabase (confirmación de email, Google, recuperar contraseña): canjea el código por la sesión. */
export async function GET(req: Request) {
  const url = new URL(req.url)
  const code = url.searchParams.get('code')
  const nextRaw = url.searchParams.get('next') || '/'
  // Solo rutas internas
  const next = nextRaw.startsWith('/') && !nextRaw.startsWith('//') ? nextRaw : '/'
  if (code) {
    const { error } = await createClientServer().auth.exchangeCodeForSession(code)
    if (error) return NextResponse.redirect(new URL(`/login?error=link`, url.origin))
  }
  return NextResponse.redirect(new URL(next, url.origin))
}
