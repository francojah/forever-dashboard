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

  // account_status labels and mapper (declared outside try so they're in scope)
  const STATUS_LABEL: Record<number, string> = { 1: 'Activa', 2: 'Desactivada', 3: 'Sin saldo', 9: 'En gracia', 100: 'Por cerrar', 101: 'Cerrada' }
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const mapAccount = (a: any) => ({ id: a.id as string, name: a.name as string, status: a.account_status as number, status_label: STATUS_LABEL[a.account_status as number] ?? `Estado ${a.account_status}`, currency: a.currency as string })
  type MappedAccount = ReturnType<typeof mapAccount>

  try {
    // 1) Direct user ad accounts
    const directRes = await fetch(
      `${META_API}/me/adaccounts?fields=id,name,account_status,currency&limit=100&access_token=${token}`,
      { cache: 'no-store' },
    )
    const directJson = await directRes.json()
    if (directJson.error) throw new Error(directJson.error.message || 'Error de Meta API')

    const directAccounts: MappedAccount[] = (directJson.data || []).map(mapAccount)

    // 2) Business Manager accounts
    let bizAccounts: MappedAccount[] = []
    try {
      const bizRes = await fetch(
        `${META_API}/me/businesses?fields=id,name&limit=50&access_token=${token}`,
        { cache: 'no-store' },
      )
      const bizJson = await bizRes.json()
      if (!bizJson.error && Array.isArray(bizJson.data)) {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        for (const biz of bizJson.data as any[]) {
          for (const endpoint of ['owned_ad_accounts', 'client_ad_accounts']) {
            try {
              const r = await fetch(
                `${META_API}/${biz.id}/${endpoint}?fields=id,name,account_status,currency&limit=100&access_token=${token}`,
                { cache: 'no-store' },
              )
              const j = await r.json()
              if (!j.error && Array.isArray(j.data)) {
                // eslint-disable-next-line @typescript-eslint/no-explicit-any
                bizAccounts = bizAccounts.concat((j.data as any[]).map(mapAccount) as MappedAccount[])
              }
            } catch { /* skip */ }
          }
        }
      }
    } catch { /* Business Manager optional */ }

    // Merge + deduplicate by account ID
    const seen = new Set<string>()
    const allAccounts: MappedAccount[] = []
    for (const acc of [...directAccounts, ...bizAccounts]) {
      if (!seen.has(acc.id)) { seen.add(acc.id); allAccounts.push(acc) }
    }
    const accounts = allAccounts

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
