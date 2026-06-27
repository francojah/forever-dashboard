/**
 * sync-tiendanube.js — Sincronización diaria con Tiendanube API
 *
 * Se ejecuta junto con sync-meta.js via GitHub Actions.
 * También podés correrlo manualmente: node scripts/sync-tiendanube.js
 *
 * Requiere en .env.local:
 *   TIENDANUBE_USER_ID, TIENDANUBE_ACCESS_TOKEN, SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY
 */

const https = require('https')
const { createClient } = require('@supabase/supabase-js')

require('dotenv').config({ path: '.env.local' })

const USER_ID      = process.env.TIENDANUBE_USER_ID
const TOKEN        = process.env.TIENDANUBE_ACCESS_TOKEN
const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL
const SUPABASE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY

if (!USER_ID || !TOKEN || !SUPABASE_URL || !SUPABASE_KEY) {
  console.error('❌ Faltan variables de entorno para Tiendanube')
  process.exit(1)
}

const supabase = createClient(SUPABASE_URL, SUPABASE_KEY)

// ── Helper HTTP ────────────────────────────────────────────────
function fetchTN(path) {
  return new Promise((resolve, reject) => {
    const opts = {
      hostname: 'api.tiendanube.com',
      path: `/v1/${USER_ID}/${path}`,
      headers: {
        'Authentication': `bearer ${TOKEN}`,
        'User-Agent': 'ForeverDashboard/1.0 (francojah@gmail.com)',
        'Content-Type': 'application/json',
      },
    }
    https.get(opts, (res) => {
      let data = ''
      res.on('data', chunk => data += chunk)
      res.on('end', () => {
        try { resolve(JSON.parse(data)) }
        catch (e) { reject(e) }
      })
    }).on('error', reject)
  })
}

// ── Date helpers (UTC-3 Argentina) ─────────────────────────────
function argentinaDateStr(date) {
  const ms = date.getTime() - 3 * 60 * 60 * 1000
  return new Date(ms).toISOString().split('T')[0]
}

function getRange(preset) {
  const now      = new Date()
  const todayAR  = argentinaDateStr(now)
  const yearAR   = todayAR.slice(0, 4)

  const startOfToday     = new Date(todayAR + 'T00:00:00.000-03:00')
  const startOfYesterday = new Date(new Date(startOfToday).setDate(startOfToday.getDate() - 1))
  const endOfYesterday   = new Date(startOfToday.getTime() - 1)
  const start7d          = new Date(new Date(startOfToday).setDate(startOfToday.getDate() - 6))
  const start30d         = new Date(new Date(startOfToday).setDate(startOfToday.getDate() - 29))
  const startYTD         = new Date(`${yearAR}-01-01T00:00:00.000-03:00`)

  const fmt = (d) => d.toISOString()

  switch (preset) {
    case 'today':     return { created_at_min: fmt(startOfToday),     created_at_max: fmt(now) }
    case 'yesterday': return { created_at_min: fmt(startOfYesterday), created_at_max: fmt(endOfYesterday) }
    case '7d':        return { created_at_min: fmt(start7d),          created_at_max: fmt(now) }
    case '30d':       return { created_at_min: fmt(start30d),         created_at_max: fmt(now) }
    case 'ytd':       return { created_at_min: fmt(startYTD),         created_at_max: fmt(now) }
    default:          return { created_at_min: fmt(start7d),          created_at_max: fmt(now) }
  }
}

// ── Fetch orders para un preset ────────────────────────────────
async function fetchOrders(preset = '7d') {
  const { created_at_min, created_at_max } = getRange(preset)
  const params = new URLSearchParams({
    created_at_min,
    created_at_max,
    status: 'open,closed,paid',
    per_page: '200',
  })
  const res = await fetchTN(`orders?${params}`)
  if (res.error || res.code) throw new Error(`Tiendanube orders [${preset}]: ${res.description || res.error}`)
  return Array.isArray(res) ? res : []
}

// ── Calcular métricas de Tiendanube ───────────────────────────
function buildTNSummary(orders) {
  const paid = orders.filter(o => ['paid', 'closed'].includes(o.payment_status))

  const total_revenue = paid.reduce((sum, o) => sum + parseFloat(o.total || '0'), 0)
  const total_orders  = paid.length
  const aov           = total_orders > 0 ? total_revenue / total_orders : 0

  // Top productos — agrupado por product_id, revenue proporcional al o.total real
  const productMap = {}
  paid.forEach(o => {
    const items = o.products || []
    if (!items.length) return

    const listTotal = items.reduce(
      (sum, p) => sum + parseFloat(p.price || '0') * parseInt(p.quantity || '1'), 0
    )
    const paidSubtotal = parseFloat(o.total || '0')

    items.forEach(p => {
      const key = String(p.product_id || p.name)
      const baseName = p.name.replace(/\s*\([^)]*\)\s*$/, '').trim() || p.name
      const qty = parseInt(p.quantity || '1')
      const listValue = parseFloat(p.price || '0') * qty
      const proportionalRevenue = listTotal > 0
        ? (listValue / listTotal) * paidSubtotal
        : listValue

      if (!productMap[key]) productMap[key] = { name: baseName, quantity: 0, revenue: 0 }
      productMap[key].quantity += qty
      productMap[key].revenue  += proportionalRevenue
    })
  })

  const top_products = Object.values(productMap)
    .sort((a, b) => b.revenue - a.revenue)
    .slice(0, 10)

  // Métodos de pago — conteo, revenue y costo real de cuotas por orden
  const payment_methods = {}
  const payment_revenue = {}   // ARS por método de pago
  let total_installments_cost = 0  // suma de payment_details.installments_cost (cuotas s/interés absorbidas por el negocio)
  let total_orders_with_installments = 0
  paid.forEach(o => {
    const method = o.payment_details?.method || 'otro'
    const amount = parseFloat(o.total || '0')
    payment_methods[method] = (payment_methods[method] || 0) + 1
    payment_revenue[method] = Math.round((payment_revenue[method] || 0) + amount)

    // Costo real de cuotas que absorbió el negocio (campo TN: installments_cost)
    const cuotasCost = parseFloat(o.payment_details?.installments_cost || '0')
    if (cuotasCost > 0) {
      total_installments_cost += cuotasCost
      total_orders_with_installments += 1
    }
  })
  total_installments_cost = Math.round(total_installments_cost)

  // Metodos de envio normalizado en 3 categorias: Correo, Retiro, Moto
  function normalizeShipping(o) {
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
  const shipping_counts = {}
  paid.forEach(o => {
    const cat = normalizeShipping(o)
    shipping_counts[cat] = (shipping_counts[cat] || 0) + 1
  })
  const shipping_methods = {}
  if (shipping_counts['Correo']) shipping_methods['Correo'] = shipping_counts['Correo']
  if (shipping_counts['Retiro']) shipping_methods['Retiro'] = shipping_counts['Retiro']
  if (shipping_counts['Moto'])   shipping_methods['Moto']   = shipping_counts['Moto']

  // Provincias / geografía
  const provinces = {}
  paid.forEach(o => {
    const prov = o.shipping_address?.province || 'Desconocida'
    provinces[prov] = (provinces[prov] || 0) + 1
  })
  const top_provinces = Object.entries(provinces)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 5)
    .map(([name, count]) => ({ name, count }))

  // Clientes únicos
  const customerIds = paid.map(o => o.customer?.id).filter(Boolean)
  const unique_customers = new Set(customerIds).size

  // Costo de envío cobrado al cliente
  const shipping_revenue = Math.round(
    paid.reduce((s, o) => s + parseFloat(o.shipping_cost_owner || '0'), 0)
  )

  // Total unidades vendidas
  const total_units_sold = paid.reduce((sum, o) => {
    return sum + (o.products || []).reduce((s, p) => s + parseInt(p.quantity || '1'), 0)
  }, 0)

  return {
    total_revenue:   Math.round(total_revenue),
    total_orders,
    aov:             Math.round(aov),
    unique_customers,
    top_products:    top_products.map(p => ({ ...p, revenue: Math.round(p.revenue) })),
    payment_methods,
    payment_revenue,
    total_installments_cost,
    total_orders_with_installments,
    shipping_methods,
    top_provinces,
    shipping_revenue,
    total_units_sold,
  }
}

// ── Main ───────────────────────────────────────────────────────
async function main() {
  const today = new Date().toISOString().split('T')[0]
  console.log(`\n🛍️ Sincronizando Tiendanube — ${today}`)

  try {
    console.log('  📦 Fetching órdenes hoy...')
    const ordersToday = await fetchOrders('today')
    const summaryToday = buildTNSummary(ordersToday)

    console.log('  📦 Fetching órdenes ayer...')
    const ordersYesterday = await fetchOrders('yesterday')
    const summaryYesterday = buildTNSummary(ordersYesterday)

    console.log('  📦 Fetching órdenes últimos 7d...')
    const orders7d = await fetchOrders('7d')
    const summary7d = buildTNSummary(orders7d)
    console.log(`  ✅ ${summary7d.total_orders} órdenes · $${summary7d.total_revenue.toLocaleString('es-AR')} ARS`)

    console.log('  📦 Fetching órdenes últimos 30d...')
    const orders30d = await fetchOrders('30d')
    const summary30d = buildTNSummary(orders30d)

    console.log('  📦 Fetching órdenes YTD...')
    const ordersYTD = await fetchOrders('ytd')
    const summaryYTD = buildTNSummary(ordersYTD)

    const snapshot = {
      snapshot_date:     today,
      summary_today:     summaryToday,
      summary_yesterday: summaryYesterday,
      summary_7d:        summary7d,
      summary_30d:       summary30d,
      summary_ytd:       summaryYTD,
      orders_count:      orders7d.length,
    }

    console.log('  💾 Guardando en Supabase...')
    const { error } = await supabase
      .from('tiendanube_snapshots')
      .upsert(snapshot, { onConflict: 'snapshot_date' })

    if (error) throw error

    console.log(`\n✅ Tiendanube sync completado — ${today}`)
    console.log(`   Hoy:  ${summaryToday.total_orders} órdenes · $${summaryToday.total_revenue.toLocaleString('es-AR')}`)
    console.log(`   7d:   ${summary7d.total_orders} órdenes · $${summary7d.total_revenue.toLocaleString('es-AR')} · AOV $${summary7d.aov.toLocaleString('es-AR')}`)
    console.log(`   30d:  ${summary30d.total_orders} órdenes · $${summary30d.total_revenue.toLocaleString('es-AR')}`)
    console.log(`   YTD:  ${summaryYTD.total_orders} órdenes · $${summaryYTD.total_revenue.toLocaleString('es-AR')}\n`)

  } catch (err) {
    console.error('\n❌ Error en Tiendanube sync:', err.message)
    process.exit(1)
  }
}

main()
