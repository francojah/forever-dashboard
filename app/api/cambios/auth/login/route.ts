import { NextResponse } from 'next/server'
import { checkLogin, createSession, SESSION_COOKIE } from '@/lib/cambios/adminAuth'

export const dynamic = 'force-dynamic'

export async function POST(req: Request) {
  try {
    const { user, pin } = await req.json()
    const r = await checkLogin(String(user ?? ''), String(pin ?? ''))
    if (!r.ok) return NextResponse.json(r, { status: 401 })
    const s = await createSession(r.user)
    const res = NextResponse.json({ ok: true, user: r.user })
    res.cookies.set(SESSION_COOKIE, s.value, { httpOnly: true, secure: true, sameSite: 'lax', path: '/', maxAge: s.maxAge })
    return res
  } catch (e) {
    console.error('[cambios/auth/login]', e)
    return NextResponse.json({ ok: false, reason: 'No pudimos iniciar sesión. Probá de nuevo.' }, { status: 500 })
  }
}
