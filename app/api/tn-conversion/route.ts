import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

export const dynamic = 'force-dynamic'

const TN_API       = 'https://api.tiendanube.com/v1'
const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL!
const SUPABASE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY!

async function getTNCredentials() {
  try {
    const sb = createClient(SUPABASE_URL, SUPABASE_KEY)
    const { data } = await sb.from('app_config').select('value').eq('key', 'tiendanube_credentials').single()
    if (data?.value?.access_token && data?.value?.user_id) {
      return { token: data.value.access_token, userId: String(data.value.user_id) }
    }
  } catch { /* fallback to env */ }
  const token  = process.env.TIENDANUBE_ACCESS_TOKEN ?? process.env.TN_ACCESS_TOKEN
  const userId = process.env.TIENDANUBE_USER_ID      ?? process.env.TN_STORE_ID
  if (!token || !userId) throw new Error('Credenciales Tiendanube no configuradas')
  return { token, userId }
}

function argentinaDateStr(date: Date): string {
  const ms = date.getTime() - 3 * 60 * 60 * 1000
  return new Date(ms).toISOString().split('T')[0]
}

function getRange(period: string): { created_at_min: string; created_at_max: string } {
  const now     = new Date()
  const todayAR = argentinaDateStr(now)
  const yearAR  = todayAR.slice(0, 4)
  const monthAR = todayAR.slice(0, 7)

  const startOfToday     = new Date(todayAR + 'T00:00:00.000-03:00')
  const startOfYesterday = new Date(new Date(startOfToday).setDate(startOfToday.getDate() - 1))
  const endOfYesterday   = new Date(startOfToday.getTime() - 1)
  const start7d          = new Date(new Date(startOfToday).setDate(startOfToday.getDate() - 6))
  const start30d         = new Date(new Date(startOfToday).setDate(startOfToday.getDate() - 29))
  const startYTD         = new Date(`${yearAR}-01-01T00:00:00.000-03:00`)
  const startMTD         = new Date(`${monthAR}-01T00:00:00.000-03:00`)

  const fmt = (d: Date) => d.toISOString()
  switch (period) {
    case 'today':     return { created_at_min: fmt(startOfToday),     created_at_max: fmt(now) }
    case 'yesterday': return { created_at_min: fmt(startOfYesterday), created_at_max: fmt(endOfYesterday) }
    case '7d':        return { created_at_min: fmt(start7d),          created_at_max: fmt(now) }
    case '30d':       return { created_at_min: fmt(start30d),         created_at_max: fmt(now) }
    case 'ytd':       return { created_at_min: fmt(startYTD),         created_at_max: fmt(now) }
    default:          return { created_at_min: fmt(start7d),          created_at_max: fmt(now) }
  }
  void startMTD // referenced to avoid lint warning
}

export async function GET(req: NextRequest) {
  try {
    const period = req.nextUrl.searchParams.get('period') ?? '7d'
    const { token, userId } = await getTNCredentials()
    const { created_at_min, created_at_max } = getRange(period)

    // Fetch ALL orders in period (no payment_status filter = includes abandoned/pending/paid)
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const allOrders: any[] = []
    let page = 1

    while (true) {
      const params = new URLSearchParams({
        created_at_min,
        created_at_max,
        per_page: '200',
        page: String(page),
      })
      const res = await fetch(`${TN_API}/${userId}/orders?${params}`, {
        headers: {
          'Authentication': `bearer ${token}`,
          'User-Agent': 'ForeverDashboard/1.0 (francojah@gmail.com)',
        },
        cache: 'no-store',
      })
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const data: any = await res.json()
      if (data && typeof data === 'object' && !Array.isArray(data) && (data.code || data.error)) {
        const desc = String(data.description || data.error || '')
        if (desc.toLowerCase().includes('last page')) break
        throw new Error(`TN API ${res.status}: ${desc.slice(0, 200)}`)
      }
      const batch = Array.isArray(data) ? data : []
      if (!batch.length) break
      allOrders.push(...batch)
      if (batch.length < 200) break
      page++
    }

    // Count by payment status
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const paid      = allOrders.filter((o: any) => ['paid', 'partially_paid', 'authorized'].includes(o.payment_status) || o.status === 'closed')
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const abandoned = allOrders.filter((o: any) => o.payment_status === 'abandoned')
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const pending   = allOrders.filter((o: any) => o.payment_status === 'pending')

    const total_checkouts = allOrders.length
    const paid_count      = paid.length
    const abandoned_count = abandoned.length
    const pending_count   = pending.length

    // Checkout conversion: % of initiated checkouts that became paid orders
    const checkout_conversion = total_checkouts > 0
      ? parseFloat(((paid_count / total_checkouts) * 100).toFixed(1))
      : null

    // Abandonment rate: % of initiated checkouts that were abandoned
    const abandonment_rate = total_checkouts > 0
      ? parseFloat(((abandoned_count / total_checkouts) * 100).toFixed(1))
      : null

    return NextResponse.json({
      period,
      total_checkouts,
      paid_count,
      abandoned_count,
      pending_count,
      checkout_conversion,
      abandonment_rate,
    })
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'Error'
    return NextResponse.json({ error: msg }, { status: 500 })
  }
}
