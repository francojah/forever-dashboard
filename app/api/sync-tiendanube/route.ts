import { NextResponse } from 'next/server'
import { createClient, SupabaseClient } from '@supabase/supabase-js'

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL!
const SUPABASE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY!
const TN_API       = 'https://api.tiendanube.com/v1'

// ── Credential resolver: Supabase first, env vars fallback ────────
async function getCredentials(supabase: SupabaseClient): Promise<{ token: string; userId: string }> {
  try {
    const { data } = await supabase
      .from('app_config')
      .select('value')
      .eq('key', 'tiendanube_credentials')
      .single()
    if (data?.value?.access_token && data?.value?.user_id) {
      return { token: data.value.access_token, userId: data.value.user_id }
    }
  } catch { /* table may not exist yet */ }

  const token  = process.env.TIENDANUBE_ACCESS_TOKEN
  const userId = process.env.TIENDANUBE_USER_ID
  if (!token || !userId) throw new Error('TIENDANUBE_ACCESS_TOKEN o TIENDANUBE_USER_ID no están configurados')
  return { token, userId }
}

function argentinaDateStr(date: Date): string {
  const ms = date.getTime() - 3 * 60 * 60 * 1000
  return new Date(ms).toISOString().split('T')[0]
}

function getRange(preset: string) {
  const now     = new Date()
  const todayAR = argentinaDateStr(now)
  const yearAR  = todayAR.slice(0, 4)

  const startOfToday     = new Date(todayAR + 'T00:00:00.000-03:00')
  const startOfYesterday = new Date(new Date(startOfToday).setDate(startOfToday.getDate() - 1))
  const endOfYesterday   = new Date(startOfToday.getTime() - 1)
  const start7d          = new Date(new Date(startOfToday).setDate(startOfToday.getDate() - 6))
  const start30d         = new Date(new Date(startOfToday).setDate(startOfToday.getDate() - 29))
  const startYTD         = new Date(`${yearAR}-01-01T00:00:00.000-03:00`)
  // MTD: del 1° del mes calendario actual hasta ahora (sin solapamiento con meses anteriores)
  const monthAR  = todayAR.slice(0, 7)   // 'YYYY-MM'
  const startMTD = new Date(`${monthAR}-01T00:00:00.000-03:00`)

  const fmt = (d: Date) => d.toISOString()
  switch (preset) {
    case 'today':     return { created_at_min: fmt(startOfToday),     created_at_max: fmt(now) }
    case 'yesterday': return { created_at_min: fmt(startOfYesterday), created_at_max: fmt(endOfYesterday) }
    case '7d':        return { created_at_min: fmt(start7d),          created_at_max: fmt(now) }
    case '30d':       return { created_at_min: fmt(start30d),         created_at_max: fmt(now) }
    case 'mtd':       return { created_at_min: fmt(startMTD),         created_at_max: fmt(now) }
    case 'ytd':       return { created_at_min: fmt(startYTD),         created_at_max: fmt(now) }
    default:          return { created_at_min: fmt(start7d),          created_at_max: fmt(now) }
  }
}

async function fetchOrders(preset: string, token: string, userId: string) {
  const { created_at_min, created_at_max } = getRange(preset)
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const allOrders: any[] = []
  let page = 1

  while (true) {
    const params = new URLSearchParams({
      created_at_min, created_at_max,
      status: 'open,closed,paid',
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
    const data = await res.json()

    if (data.error || data.code) {
      const description = (data.description || data.error || '').toString()
      // TN devuelve { code, description: "Last page is 0" } cuando no hay más resultados
      if (description.toLowerCase().includes('last page')) break
      const hint = (data.code === 401 || description.toLowerCase().includes('token') || description.toLowerCase().includes('access'))
        ? ' — Reconectá Tiendanube en Configuración.'
        : ''
      throw new Error(`TN orders [${preset}] pág ${page}: ${description || 'Error desconocido'}${hint}`)
    }

    const batch = Array.isArray(data) ? data : []
    if (batch.length === 0) break      // página vacía → fin
    allOrders.push(...batch)
    if (batch.length < 200) break      // última página (incompleta) → fin
    page++
  }

  return allOrders
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function normalizeShipping(o: any): string {
  const raw = (
    o.shipping_option?.name ||
    o.shipping?.option_reference ||
    o.shipping_pickup_type ||
    ''
  ).toLowerCase()
  if (raw.includes('moto')) return 'Moto'
  if (
    raw.includes('pickup') || raw.includes('pick_up') || raw === 'pickup' ||
    raw.includes('retiro') || raw.includes('sucursal') || raw.includes('local') ||
    raw.includes('branch') || raw.includes('punto de retiro')
  ) return 'Retiro'
  return 'Correo'
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function buildSummary(orders: any[]) {
  const paid = orders.filter((o: { payment_status: string }) => ['paid', 'closed'].includes(o.payment_status))
  const total_revenue = paid.reduce((s: number, o: { total: string }) => s + parseFloat(o.total || '0'), 0)
  const total_orders  = paid.length
  const aov           = total_orders > 0 ? total_revenue / total_orders : 0

  const productMap: Record<string, { name: string; quantity: number; revenue: number; variants: Record<string, { quantity: number; revenue: number }> }> = {}
  paid.forEach((o: { total: string; products: { product_id: number; name: string; price: string; quantity: string }[] }) => {
    const items = o.products || []
    if (!items.length) return
    const listTotal = items.reduce((s, p) => s + parseFloat(p.price || '0') * parseInt(p.quantity || '1'), 0)
    const paidSub   = parseFloat(o.total || '0')
    items.forEach(p => {
      const key      = String(p.product_id || p.name)
      const baseName = p.name.replace(/\s*\([^)]*\)\s*$/, '').trim() || p.name
      const qty      = parseInt(p.quantity || '1')
      const listVal  = parseFloat(p.price || '0') * qty
      const propRev  = listTotal > 0 ? (listVal / listTotal) * paidSub : listVal
      // Extraer variante del paréntesis al final: "Remera (Azul - M)" → "Azul - M"
      const variantMatch = p.name.match(/\(([^)]+)\)$/)
      const variantName  = variantMatch ? variantMatch[1].trim() : null
      if (!productMap[key]) productMap[key] = { name: baseName, quantity: 0, revenue: 0, variants: {} }
      productMap[key].quantity += qty
      productMap[key].revenue  += propRev
      if (variantName) {
        if (!productMap[key].variants[variantName]) productMap[key].variants[variantName] = { quantity: 0, revenue: 0 }
        productMap[key].variants[variantName].quantity += qty
        productMap[key].variants[variantName].revenue  += propRev
      }
    })
  })
  const top_products = Object.values(productMap)
    .sort((a, b) => b.revenue - a.revenue)
    .slice(0, 10)
    .map(p => ({
      name: p.name,
      quantity: p.quantity,
      revenue: Math.round(p.revenue),
      variants: Object.entries(p.variants)
        .map(([name, v]) => ({ name, quantity: v.quantity, revenue: Math.round(v.revenue) }))
        .sort((a, b) => b.quantity - a.quantity),
    }))

  const payment_methods: Record<string, number> = {}
  const payment_revenue: Record<string, number> = {}  // ARS por método de pago
  let total_installments_cost = 0   // cuotas sin interés absorbidas por el negocio
  let total_orders_with_installments = 0
  paid.forEach((o: { payment_details?: { method?: string; installments_cost?: string | number }; total?: string }) => {
    const m = o.payment_details?.method || 'otro'
    const amount = parseFloat(o.total || '0')
    payment_methods[m] = (payment_methods[m] || 0) + 1
    payment_revenue[m] = Math.round((payment_revenue[m] || 0) + amount)
    const cuotasCost = parseFloat(String(o.payment_details?.installments_cost || '0'))
    if (cuotasCost > 0) {
      total_installments_cost += cuotasCost
      total_orders_with_installments += 1
    }
  })
  total_installments_cost = Math.round(total_installments_cost)

  const shippingCounts: Record<string, number> = {}
  paid.forEach((o: { shipping_option?: { name?: string }; shipping?: { option_reference?: string }; shipping_pickup_type?: string }) => {
    const cat = normalizeShipping(o)
    shippingCounts[cat] = (shippingCounts[cat] || 0) + 1
  })
  const shipping_methods: Record<string, number> = {}
  if (shippingCounts['Correo']) shipping_methods['Correo'] = shippingCounts['Correo']
  if (shippingCounts['Retiro']) shipping_methods['Retiro'] = shippingCounts['Retiro']
  if (shippingCounts['Moto'])   shipping_methods['Moto']   = shippingCounts['Moto']

  const total_units_sold = paid.reduce((sum: number, o: { products?: { quantity?: string }[] }) =>
    sum + (o.products || []).reduce((s, p) => s + parseInt(p.quantity || '1'), 0), 0)

  const provinces: Record<string, number> = {}
  paid.forEach((o: { shipping_address?: { province?: string } }) => {
    const p = o.shipping_address?.province || 'Desconocida'
    provinces[p] = (provinces[p] || 0) + 1
  })
  const top_provinces = Object.entries(provinces)
    .sort((a, b) => b[1] - a[1]).slice(0, 5)
    .map(([name, count]) => ({ name, count }))

  const customerIds = paid.map((o: { customer?: { id?: number } }) => o.customer?.id).filter(Boolean)
  const unique_customers = new Set(customerIds).size

  const shipping_revenue = Math.round(
    paid.reduce((s: number, o: { shipping_cost_owner?: string }) => s + parseFloat(o.shipping_cost_owner || '0'), 0)
  )

  return {
    total_revenue: Math.round(total_revenue), total_orders, aov: Math.round(aov),
    unique_customers, top_products, payment_methods, payment_revenue,
    total_installments_cost, total_orders_with_installments,
    shipping_methods, top_provinces, shipping_revenue, total_units_sold,
  }
}

export async function POST() {
  if (!SUPABASE_URL || !SUPABASE_KEY) {
    return NextResponse.json({ error: 'Faltan variables de entorno de Supabase' }, { status: 500 })
  }

  const supabase = createClient(SUPABASE_URL, SUPABASE_KEY)

  let token: string
  let userId: string
  try {
    const creds = await getCredentials(supabase)
    token  = creds.token
    userId = creds.userId
  } catch (e) {
    const msg = e instanceof Error ? e.message : 'Error de credenciales'
    return NextResponse.json({
      error: msg + ' — Reconectá Tiendanube en Configuración.',
    }, { status: 401 })
  }

  try {
    const today = argentinaDateStr(new Date())

    const [ordersToday, ordersYesterday, orders7d, orders30d, ordersMTD, ordersYTD] = await Promise.all([
      fetchOrders('today',     token, userId),
      fetchOrders('yesterday', token, userId),
      fetchOrders('7d',        token, userId),
      fetchOrders('30d',       token, userId),
      fetchOrders('mtd',       token, userId),
      fetchOrders('ytd',       token, userId),
    ])

    const snapshot = {
      snapshot_date:     today,
      summary_today:     buildSummary(ordersToday),
      summary_yesterday: buildSummary(ordersYesterday),
      summary_7d:        buildSummary(orders7d),
      summary_30d:       buildSummary(orders30d),
      summary_mtd:       buildSummary(ordersMTD),
      summary_ytd:       buildSummary(ordersYTD),
      orders_count:      orders7d.length,
    }

    const { error } = await supabase
      .from('tiendanube_snapshots')
      .upsert({ ...snapshot, created_at: new Date().toISOString() }, { onConflict: 'snapshot_date' })

    if (error) throw error

    return NextResponse.json({
      ok: true, date: today,
      orders_today: snapshot.summary_today.total_orders,
      orders_7d:    snapshot.summary_7d.total_orders,
      revenue_7d:   snapshot.summary_7d.total_revenue,
    })
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'Error desconocido'
    return NextResponse.json({ error: msg }, { status: 500 })
  }
}
