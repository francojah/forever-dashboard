/**
 * GET  /api/meta-accounts   → lista todas las cuentas publicitarias del usuario
 * POST /api/meta-accounts   → guarda la cuenta activa { account_id }
 */

import { NextRequest, NextResponse } from 'next/server'
import { requireAuth } from '@/lib/auth'
import { createClient } from '@supabase/supabase-js'

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL!
const SUPABASE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY!
const META_API     = 'https://graph.facebook.com/v21.0'

// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function getMetaToken(supabase: any) {
  let token = process.env.META_ACCESS_TOKEN || ''
  try {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { data } = await supabase.from('app_config').select('value').eq('key', 'meta_access_token').single() as any
    const t = (data?.value as { access_token?: string } | null)?.access_token
    if (t) token = t
  } catch { /* usa env */ }
  return token
}

export async function GET() {
  const auth = await requireAuth()
  if (auth instanceof NextResponse) return auth

  const supabase = createClient(SUPABASE_URL, SUPABASE_KEY)
  const token    = await getMetaToken(supabase)
  if (!token) return NextResponse.json({ error: 'Sin token de Meta' }, { status: 500 })

  try {
    const res = await fetch(
      `${META_API}/me/adaccounts?fields=id,name,account_status,currency&limit=50&access_token=${token}`,
      { cache: 'no-store' },
    )
    const json = await res.json()
    if (json.error) throw new Error(json.error.message || 'Error de Meta API')

    // account_status: 1=ACTIVE, 2=DISABLED, 3=UNSETTLED, 7=PENDING_RISK_REVIEW, 8=PENDING_SETTLEMENT, 9=IN_GRACE_PERIOD, 100=PENDING_CLOSURE, 101=CLOSED
    const STATUS_LABEL: Record<number, string> = { 1: 'Activa', 2: 'Desactivada', 3: 'Sin saldo', 9: 'En gracia', 100: 'Por cerrar', 101: 'Cerrada' }
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const accounts = (json.data || []).map((a: any) => ({
      id:       a.id,
      name:     a.name,
      status:   a.account_status,
      status_label: STATUS_LABEL[a.account_status] ?? `Estado ${a.account_status}`,
      currency: a.currency,
    }))

    // Cuenta activa guardada
    let activeAccountId = process.env.META_ACCOUNT_ID || ''
    try {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { data } = await supabase.from('app_config').select('value').eq('key', 'meta_active_account').single() as any
      const id = (data?.value as { account_id?: string } | null)?.account_id
      if (id) activeAccountId = id
    } catch { /* usa env */ }

    return NextResponse.json({ accounts, active: activeAccountId })
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'Error desconocido'
    return NextResponse.json({ error: msg }, { status: 500 })
  }
}

export async function POST(req: NextRequest) {
  const auth = await requireAuth()
  if (auth instanceof NextResponse) return auth

  const { account_id } = await req.json() as { account_id: string }
  if (!account_id) return NextResponse.json({ error: 'account_id requerido' }, { status: 400 })

  const supabase = createClient(SUPABASE_URL, SUPABASE_KEY)
  const { error } = await supabase
    .from('app_config')
    .upsert({ key: 'meta_active_account', value: { account_id }, updated_at: new Date().toISOString() }, { onConflict: 'key' })

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ ok: true, active: account_id })
}
