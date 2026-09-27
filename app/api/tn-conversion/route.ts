/**
 * GET /api/tn-conversion?period=today|yesterday|7d|30d|ytd
 *
 * Métricas de conversión del checkout de Tiendanube:
 *  - paid_count:           órdenes pagadas en el período (GET /orders?payment_status=paid)
 *  - abandoned_count:      checkouts abandonados en paso 2 (GET /checkouts — solo últimos 30 días)
 *  - checkout_conversion:  paid / (paid + abandoned) × 100
 *  - abandonment_rate:     abandoned / (paid + abandoned) × 100
 *
 * NOTA: TN API no expone visitas/sesiones. Para "visitas → carrito",
 *       revisar el panel de estadísticas de Tiendanube o Google Analytics.
 *       Además, GET /checkouts solo soporta `created_at_max` (no _min),
 *       por lo que se pagina hasta encontrar registros más antiguos que el período.
 *       El endpoint limita a los últimos 30 días → para YTD, abandoned_count = null.
 */

import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

export const dynamic = 'force-dynamic'

const TN_API       = 'https://api.tiendanube.com/v1'
const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL!
const SUPABASE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY!

const TN_HEADERS = (token: string) => ({
  'Authentication': `bearer ${token}`,
  'User-Agent': 'ForeverDashboard/1.0 (francojah@gmail.com)',
})

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

function getRange(period: string): { start: Date; end: Date; daysBack: number } {
  const now     = new Date()
  const todayAR = argentinaDateStr(now)
  const yearAR  = todayAR.slice(0, 4)

  const startOfToday     = new Date(todayAR + 'T00:00:00.000-03:00')
  const startOfYesterday = new Date(new Date(startOfToday).setDate(startOfToday.getDate() - 1))
  const endOfYesterday   = new Date(startOfToday.getTime() - 1)
  const start7d          = new Date(new Date(startOfToday).setDate(startOfToday.getDate() - 6))
  const start30d         = new Date(new Date(startOfToday).setDate(startOfToday.getDate() - 29))
  const startYTD         = new Date(`${yearAR}-01-01T00:00:00.000-03:00`)

  const dayMs = 86400000
  switch (period) {
    case 'today':     return { start: startOfToday,     end: now,            daysBack: 1   }
    case 'yesterday': return { start: startOfYesterday, end: endOfYesterday, daysBack: 2   }
    case '7d':        return { start: start7d,          end: now,            daysBack: 7   }
    case '30d':       return { start: start30d,         end: now,            daysBack: 30  }
    case 'ytd':       return { start: startYTD,         end: now,            daysBack: Math.ceil((now.getTime() - startYTD.getTime()) / dayMs) }
    default:          return { start: start7d,          end: now,            daysBack: 7   }
  }
}

// ── Fetch paginated helper ───────────────────────────────────────────
async function fetchAll<T>(
  url: string,
  token: string,
  // Stop paginating when this predicate returns false (used for /checkouts date filter)
  keepGoing?: (batch: T[]) => boolean
): Promise<T[]> {
  const all: T[] = []
  let page = 1
  while (true) {
    const sep = url.includes('?') ? '&' : '?'
    const res = await fetch(`${url}${sep}per_page=200&page=${page}`, {
      headers: TN_HEADERS(token),
      cache: 'no-store',
    })
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const data: any = await res.json()
    if (data && typeof data === 'object' && !Array.isArray(data) && (data.code || data.error)) {
      const desc = String(data.description || data.error || '')
      if (desc.toLowerCase().includes('last page') || desc.toLowerCase().includes('0 results')) break
      throw new Error(`TN API ${res.status}: ${desc.slice(0, 200)}`)
    }
    const batch = Array.isArray(data) ? data as T[] : []
    if (!batch.length) break
    all.push(...batch)
    // Early-stop if predicate says we've gone far enough back in time
    if (keepGoing && !keepGoing(batch)) break
    if (batch.length < 200) break
    page++
  }
  return all
}

export async function GET(req: NextRequest) {
  try {
    const period = req.nextUrl.searchParams.get('period') ?? '7d'
    const { token, userId } = await getTNCredentials()
    const { start, end, daysBack } = getRange(period)

    const created_at_min = start.toISOString()
    const created_at_max = end.toISOString()

    // ── 1. Paid orders ────────────────────────────────────────────────
    // Use same filter as sync: payment_status=paid,authorized,partially_paid
    // TN orders with status closed are also considered paid
    const paidParams = new URLSearchParams({
      created_at_min, created_at_max,
      status: 'open,closed',
      payment_status: 'paid,authorized,partially_paid',
    })
    const paidOrders = await fetchAll<{ id: number }>(
      `${TN_API}/${userId}/orders?${paidParams}`,
      token,
    )
    const paid_count = paidOrders.length

    // ── 2. Abandoned checkouts ────────────────────────────────────────
    // GET /checkouts only supports created_at_max (no _min), so we paginate
    // and stop when we hit records older than our period start.
    // TN only keeps checkouts for 30 days → if period > 30d, skip.
    let abandoned_count: number | null = null

    if (daysBack <= 30) {
      const checkoutParams = new URLSearchParams({ created_at_max })
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const checkouts = await fetchAll<any>(
        `${TN_API}/${userId}/checkouts?${checkoutParams}`,
        token,
        // Stop paginating once we see results older than our start date
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        (batch: any[]) => batch.some((c: any) => new Date(c.created_at) >= start),
      )
      // Filter to only those within our period (since we may have fetched some extras)
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      abandoned_count = checkouts.filter((c: any) => {
        const d = new Date(c.created_at)
        return d >= start && d <= end
      }).length
    }

    // ── 3. Conversion metrics ────────────────────────────────────────
    // Total funnel entries = paid + abandoned (both reached checkout step 2)
    const in_funnel = abandoned_count != null ? paid_count + abandoned_count : null

    const checkout_conversion = in_funnel != null && in_funnel > 0
      ? parseFloat(((paid_count / in_funnel) * 100).toFixed(1))
      : null

    const abandonment_rate = in_funnel != null && in_funnel > 0 && abandoned_count != null
      ? parseFloat(((abandoned_count / in_funnel) * 100).toFixed(1))
      : null

    return NextResponse.json({
      period,
      paid_count,
      abandoned_count,          // null when period > 30 days
      checkout_conversion,      // null when period > 30 days (no abandoned data)
      abandonment_rate,
      visits_available: false,  // TN API does not expose traffic/session data
    })
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'Error'
    return NextResponse.json({ error: msg }, { status: 500 })
  }
}
