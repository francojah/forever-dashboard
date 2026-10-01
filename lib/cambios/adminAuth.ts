/**
 * Acceso simple al panel de cambios con usuario + PIN (para el equipo, sin cuenta de Supabase).
 * Usuarios en env: CAMBIOS_ADMIN_USERS="dani:123456,fran:654321"
 * Sesión: cookie firmada con HMAC (CAMBIOS_SESSION_SECRET), 30 días.
 * Bloqueo: 5 intentos fallidos → 15 minutos bloqueado (guardado en app_config).
 */
import { cookies } from 'next/headers'
import { NextResponse } from 'next/server'
import { requireAuth } from '@/lib/auth'
import { supabaseAdmin } from './tiendanube'

export const SESSION_COOKIE = 'fb_cambios_admin'
const SESSION_DAYS = 30
const MAX_FAILS = 5
const LOCK_MINUTES = 15

function secret() {
  return process.env.CAMBIOS_SESSION_SECRET || `fb-cambios-${process.env.SUPABASE_SERVICE_ROLE_KEY || ''}`
}

function users(): Record<string, string> {
  const out: Record<string, string> = {}
  for (const pair of (process.env.CAMBIOS_ADMIN_USERS || '').split(',')) {
    const [u, p] = pair.split(':').map((x) => (x || '').trim())
    if (u && p) out[u.toLowerCase()] = p
  }
  return out
}

async function hmac(data: string) {
  const key = await crypto.subtle.importKey('raw', new TextEncoder().encode(secret()), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign'])
  const sig = await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(data))
  return Buffer.from(new Uint8Array(sig)).toString('base64url')
}

function safeEqual(a: string, b: string) {
  if (a.length !== b.length) return false
  let r = 0
  for (let i = 0; i < a.length; i++) r |= a.charCodeAt(i) ^ b.charCodeAt(i)
  return r === 0
}

export async function createSession(user: string) {
  const exp = Date.now() + SESSION_DAYS * 86400000
  const payload = `${user}.${exp}`
  return { value: `${payload}.${await hmac(payload)}`, maxAge: SESSION_DAYS * 86400 }
}

export async function readSession(value: string | undefined | null): Promise<string | null> {
  if (!value) return null
  const parts = value.split('.')
  if (parts.length !== 3) return null
  const [user, exp, sig] = parts
  if (!users()[user] || Number(exp) < Date.now()) return null
  return safeEqual(sig, await hmac(`${user}.${exp}`)) ? user : null
}

export async function currentAdmin(): Promise<string | null> {
  return readSession(cookies().get(SESSION_COOKIE)?.value)
}

/** Para las rutas del panel: vale la sesión con PIN o la sesión normal del dashboard. */
export async function requireCambiosAdmin(): Promise<NextResponse | { user: string }> {
  const u = await currentAdmin()
  if (u) return { user: u }
  const auth = await requireAuth()
  if (auth instanceof NextResponse) return auth
  return { user: auth.email || 'dashboard' }
}

type Lock = { fails: number; until: number | null; first: number }
const LOCK_KEY = 'cambios_admin_lock'

async function getLock(): Promise<Lock> {
  const { data } = await supabaseAdmin().from('app_config').select('value').eq('key', LOCK_KEY).maybeSingle()
  return (data?.value as Lock) || { fails: 0, until: null, first: Date.now() }
}
async function setLock(v: Lock) {
  await supabaseAdmin().from('app_config').upsert({ key: LOCK_KEY, value: v }, { onConflict: 'key' })
}

export async function checkLogin(user: string, pin: string): Promise<{ ok: true; user: string } | { ok: false; reason: string }> {
  const lock = await getLock()
  if (lock.until && lock.until > Date.now()) {
    const min = Math.ceil((lock.until - Date.now()) / 60000)
    return { ok: false, reason: `Demasiados intentos. Probá de nuevo en ${min} min.` }
  }
  const u = user.trim().toLowerCase()
  const expected = users()[u]
  if (expected && safeEqual(pin.trim(), expected)) {
    if (lock.fails) await setLock({ fails: 0, until: null, first: Date.now() })
    return { ok: true, user: u }
  }
  const windowStart = Date.now() - LOCK_MINUTES * 60000
  const fails = lock.first > windowStart ? lock.fails + 1 : 1
  await setLock({ fails, first: fails === 1 ? Date.now() : lock.first, until: fails >= MAX_FAILS ? Date.now() + LOCK_MINUTES * 60000 : null })
  return { ok: false, reason: fails >= MAX_FAILS ? `Demasiados intentos. Probá de nuevo en ${LOCK_MINUTES} min.` : 'Usuario o PIN incorrectos.' }
}
