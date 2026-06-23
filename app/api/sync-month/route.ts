/**
 * /api/sync-month?month=YYYY-MM
 *
 * Consulta Meta Ads + Tiendanube para el mes indicado y guarda
 * el resultado en monthly_summaries. Se llama desde BalanceClient
 * cuando el usuario pide sincronizar un mes histórico.
 *
 * Meta API:  time_range con el primer y último día del mes
 * TN API:    created_at_min / created_at_max con paginación
 */

import { NextResponse }                from 'next/server'
import { createClient, SupabaseClient } from '@supabase/supabase-js'

export const maxDuration = 60   // Vercel Pro: hasta 60s para paginación TN

const META_TOKEN   = process.env.META_ACCESS_TOKEN!
const ACCOUNT_ID   = process.env.META_ACCOUNT_ID || 'act_1614288152915913'
const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL!
const SUPABASE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY!
const META_API     = 'https://graph.facebook.com/v21.0'
const TN_API       = 'https://api.tiendanube.com/v1'

// ── Credentials ──────────────────────────────────────────────────────────────
async function getTNCredentials(supabase: SupabaseClient) {
  try {
    const { data } = await supabase
      .from('app_config')
      .select('value')
      .eq('key', 'tiendanube_credentials')
      .single()
    if (data?.value?.access_token && data?.value?.user_id) {
      return { token: data.value.access_token, userId: data.value.user_id }
    }
  } catch { /* fallback to env */ }
  const token  = process.env.TIENDANUBE_ACCESS_TOKEN
  const userId = process.env.TIENDANUBE_USER_ID
  if (!token || !userId) throw new Error('Credenciales Tiendanube no configuradas')
  return { token, userId }
}

// ── Month date range ─────────────────────────────────────────────────────────
function monthRange(month: string) {
  // month = 'YYYY-MM'
  const [year, m] = month.split('-').map(Number)
  const since  = `${month}-01`
  const lastDay = new Date(year, m, 0).getDate()
  const until  = `${month}-${String(lastDay).padStart(2, '0')}`
  return { since, until }
}

// ── Meta: gasto total del mes ────────────────────────────────────────────────
async function fetchMetaSpend(month: string): Promise<number> {
  const { since, until } = monthRange(month)
  const timeRange = encodeURIComponent(JSON.stringify({ since, until }))
  const fields    = 'spend,actions,purchase_roas'
  const url = `${META_API}/${ACCOUNT_ID}/insights?fields=${fields}&time_range=${timeRange}&level=account&access_token=${META_TOKEN}`

  const res  = await fetch(url, { cache: 'no-store' })
  const json = await res.json()

  if (json.error) throw new Error(`Meta Ads: ${json.error.message}`)

  // insights.data puede ser array — puede ser vacío si no hay datos en ese rango
  const data  = Array.isArray(json.data) ? json.data : []
  const spend = data.reduce((s: number, row: { spend?: string }) => s + parseFloat(row.spend ?? '0'), 0)
  return Math.round(spend)
}

// ── TN: órdenes del mes (paginado) ───────────────────────────────────────────
async function fetchTNOrders(month: string, token: string, userId: string) {
  const { since, until } = monthRange(month)
  // Usar horario Argentina (UTC-3)
  const min = `${since}T00:00:00.000-03:00`
  const max = `${until}T23:59:59.000-03:00`

  const allOrders: object[] = []
  let page = 1

  while (true) {
    const params = new URLSearchParams({
      created_at_min: min,
      created_at_max: max,
      status:   'open,closed,paid',
      per_page: '200',
      page:     String(page),
    })

    const res  = await fetch(`${TN_API}/${userId}/orders?${params}`, {
      headers: {
        Authentication: `bearer ${token}`,
        'User-Agent':   'ForeverDashboard/1.0 (francojah@gmail.com)',
      },
      cache: 'no-store',
    })
    const json = await res.json()

    if (!Array.isArray(json)) {
      if (json.code || json.error) throw new Error(`Tiendanube: ${json.description || json.error}`)
      break
    }
    if (json.length === 0) break

    allOrders.push(...json)
    if (json.length < 200) break   // última página
    page++
  }

  return allOrders
}

// ── Calcular métricas TN ─────────────────────────────────────────────────────
// eslint-disable-next-line @typescript-eslint/no-explicit-any
function calcTNMetrics(orders: any[]) {
  const paid = orders.filter(o => ['paid', 'closed'].includes(o.payment_status))

  const total_revenue = Math.round(paid.reduce((s, o) => s + parseFloat(o.total ?? '0'), 0))
  const total_orders  = paid.length

  const total_units = paid.reduce((s, o) => {
    const items: { quantity?: string }[] = o.products ?? []
    return s + items.reduce((q, p) => q + parseInt(p.quantity ?? '1'), 0)
  }, 0)

  return { total_revenue, total_orders, total_units }
}

// ── Handler ───────────────────────────────────────────────────────────────────
export async function POST(request: Request) {
  try {
    const { searchParams } = new URL(request.url)
    const month = searchParams.get('month')

    if (!month || !/^\d{4}-\d{2}$/.test(month)) {
      return NextResponse.json({ error: 'Parámetro month inválido. Formato: YYYY-MM' }, { status: 400 })
    }

    // No sincronizar el mes actual — para eso existe el sync normal
    const curKey = new Date().toISOString().slice(0, 7)
    if (month >= curKey) {
      return NextResponse.json({ error: 'Solo se pueden sincronizar meses anteriores al actual' }, { status: 400 })
    }

    const supabase = createClient(SUPABASE_URL, SUPABASE_KEY)

    // Fetch en paralelo: Meta spend + TN orders
    const { token, userId } = await getTNCredentials(supabase)

    const [meta_spend, tnOrders] = await Promise.all([
      fetchMetaSpend(month).catch(() => null),
      fetchTNOrders(month, token, userId).catch(() => []),
    ])

    const { total_revenue, total_orders, total_units } = calcTNMetrics(tnOrders)

    // Upsert en monthly_summaries
    const { data, error } = await supabase
      .from('monthly_summaries')
      .upsert({
        month,
        meta_spend,
        tn_revenue: total_revenue,
        tn_orders:  total_orders,
        tn_units:   total_units,
        notes:      `Auto-sync ${new Date().toLocaleDateString('es-AR')}`,
        updated_at: new Date().toISOString(),
      }, { onConflict: 'month' })
      .select()
      .single()

    if (error) throw error

    return NextResponse.json({
      ok: true,
      month,
      meta_spend,
      tn_revenue:  total_revenue,
      tn_orders:   total_orders,
      tn_units:    total_units,
      summary:     data,
    })
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err)
    return NextResponse.json({ error: msg }, { status: 500 })
  }
}
