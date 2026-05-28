import { NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

const USER_ID      = process.env.TIENDANUBE_USER_ID!
const TOKEN        = process.env.TIENDANUBE_ACCESS_TOKEN!
const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL!
const SUPABASE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY!
const TN_API       = 'https://api.tiendanube.com/v1'

function argentinaDateStr(date: Date): string {
  const ms = date.getTime() - 3 * 60 * 60 * 1000
  return new Date(ms).toISOString().split('T')[0]
}

function getRange(preset: string) {
  const now     = new Date()
  const todayAR = argentinaDateStr(now)
  const yearAR  = todayAR.slice(0, 4)

  const startOfToday      = new Date(todayAR + 'T00:00:00.000-03:00')
  const startOfYesterday  = new Date(new Date(startOfToday).setDate(startOfToday.getDate() - 1))
  const endOfYesterday    = new Date(startOfToday.getTime() - 1)
  const start7d           = new Date(new Date(startOfToday).setDate(startOfToday.getDate() - 6))
  const start30d          = new Date(new Date(startOfToday).setDate(startOfToday.getDate() - 29))
  const startYTD          = new Date(`${yearAR}-01-01T00:00:00.000-03:00`)

  const fmt = (d: Date) => d.toISOString()
  switch (preset) {
    case 'today':     return { created_at_min: fmt(startOfToday),     created_at_max: fmt(now) }
    case 'yesterday': return { created_at_min: fmt(startOfYesterday), created_at_max: fmt(endOfYesterday) }
    case '7d':        return { created_at_min: fmt(start7d),          created_at_max: fmt(now) }
    case '30d':       return { created_at_min: fmt(start30d),         created_at_max: fmt(now) }
    case 'ytd':       return { created_at_min: fmt(startYTD),         created_at_max: fmt(now) }
    default:          return { created_at_min: fmt(start7d),          created_at_max: fmt(now) }
  }
}

async function fetchOrders(preset: string) {
  const { created_at_min, created_at_max } = getRange(preset)
  const params = new URLSearchParams({
    created_at_min, created_at_max,
    status: 'open,closed,paid',
    per_page: '200',
  })
  const res = await fetch(`${TN_API}/${USER_ID}/orders?${params}`, {
    headers: {
      'Authentication': `bearer ${TOKEN}`,
      'User-Agent': 'ForeverDashboard/1.0 (francojah@gmail.com)',
    },
    cache: 'no-store',
  })
  const data = await res.json()
  if (data.error || data.code) throw new Error(`TN orders [${preset}]: ${data.description || data.error}`)
  return Array.isArray(data) ? data : []
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

  // Products grouped by product_id, revenue proportional to o.total
  const productMap: Record<string, { name: string; quantity: number; revenue: number }> = {}
  paid.forEach((o: { total: string; subtotal: string; products: { product_id: number; name: string; price: string; quantity: string }[] }) => {
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
      if (!productMap[key]) productMap[key] = { name: baseName, quantity: 0, revenue: 0 }
      productMap[key].quantity += qty
      productMap[key].revenue  += propRev
    })
  })
  const top_products = Object.values(productMap)
    .sort((a, b) => b.revenue - a.revenue)
    .slice(0, 10)
    .map(p => ({ ...p, revenue: Math.round(p.revenue) }))

  // Payment methods
  const payment_methods: Record<string, number> = {}
  paid.forEach((o: { payment_details?: { method?: string } }) => {
    const m = o.payment_details?.method || 'otro'
    payment_methods[m] = (payment_methods[m] || 0) + 1
  })

  // Shipping methods — normalized to 3 categories: Correo, Retiro, Moto
  const shippingCounts: Record<string, number> = {}
  paid.forEach((o: { shipping_option?: { name?: string }; shipping?: { option_reference?: string }; shipping_pickup_type?: string }) => {
    const cat = normalizeShipping(o)
    shippingCounts[cat] = (shippingCounts[cat] || 0) + 1
  })
  const shipping_methods: Record<string, number> = {}
  if (shippingCounts['Correo']) shipping_methods['Correo'] = shippingCounts['Correo']
  if (shippingCounts['Retiro']) shipping_methods['Retiro'] = shippingCounts['Retiro']
  if (shippingCounts['Moto'])   shipping_methods['Moto']   = shippingCounts['Moto']

  // Total units sold
  const total_units_sold = paid.reduce((sum: number, o: { products?: { quantity?: string }[] }) =>
    sum + (o.products || []).reduce((s, p) => s + parseInt(p.quantity || '1'), 0), 0)

  // Total carts (all orders regardless of status)
  const total_carts = orders.length

  // Provinces
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
  const conversion_rate  = orders.length > 0 ? parseFloat(((total_orders / orders.length) * 100).toFixed(1)) : 0

  const shipping_revenue = Math.round(
    paid.reduce((s: number, o: { shipping_cost_owner?: string }) => s + parseFloat(o.shipping_cost_owner || '0'), 0)
  )

  return {
    total_revenue: Math.round(total_revenue), total_orders, aov: Math.round(aov),
    unique_customers, top_products, payment_methods, shipping_methods, top_provinces, conversion_rate,
    shipping_revenue, total_units_sold, total_carts,
  }
}

export async function POST() {
  if (!USER_ID || !TOKEN || !SUPABASE_URL || !SUPABASE_KEY) {
    return NextResponse.json({ error: 'Faltan variables de entorno de Tiendanube' }, { status: 500 })
  }

  try {
    const today = argentinaDateStr(new Date())

    const [ordersToday, ordersYesterday, orders7d, orders30d, ordersYTD] = await Promise.al