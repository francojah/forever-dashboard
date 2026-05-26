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

const USER_ID  = process.env.TIENDANUBE_USER_ID
const TOKEN    = process.env.TIENDANUBE_ACCESS_TOKEN
const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL
const SUPABASE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY
const TN_API   = 'https://api.tiendanube.com/v1'

if (!USER_ID || !TOKEN || !SUPABASE_URL || !SUPABASE_KEY) {
  console.error('❌ Faltan variables de entorno para Tiendanube')
  process.exit(1)
}

const supabase = createClient(SUPABASE_URL, SUPABASE_KEY)

// ── Helper HTTP ────────────────────────────────────────────────
function fetchTN(path) {
  return new Promise((resolve, reject) => {
    const url = `${TN_API}/${USER_ID}/${path}`
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
    void url
  })
}

// ── Date helpers ───────────────────────────────────────────────
function dateRange(daysAgo) {
  const end = new Date()
  const start = new Date()
  start.setDate(start.getDate() - daysAgo)
  return {
    created_at_min: start.toISOString().split('T')[0] + 'T00:00:00-03:00',
    created_at_max: end.toISOString().split('T')[0]   + 'T23:59:59-03:00',
  }
}

// ── Fetch orders para un rango ─────────────────────────────────
async function fetchOrders(daysAgo = 7) {
  const { created_at_min, created_at_max } = dateRange(daysAgo)
  const params = new URLSearchParams({
    created_at_min,
    created_at_max,
    status: 'open,closed,paid',
    per_page: '200',
  })
  const res = await fetchTN(`orders?${params}`)
  if (res.error || res.code) throw new Error(`Tiendanube orders: ${res.description || res.error}`)
  return Array.isArray(res) ? res : []
}

// ── Calcular métricas de Tiendanube ───────────────────────────
function buildTNSummary(orders) {
  const paid = orders.filter(o => ['paid', 'closed'].includes(o.payment_status))

  const total_revenue = paid.reduce((sum, o) => sum + parseFloat(o.total || '0'), 0)
  const total_orders  = paid.length
  const aov           = total_orders > 0 ? total_revenue / total_orders : 0

  // Top productos
  const productMap = {}
  paid.forEach(o => {
    ;(o.products || []).forEach(p => {
      const key = p.product_id
      if (!productMap[key]) productMap[key] = { name: p.name, quantity: 0, revenue: 0 }
      productMap[key].quantity += parseInt(p.quantity || '1')
      productMap[key].revenue  += parseFloat(p.price || '0') * parseInt(p.quantity || '1')
    })
  })

  const top_products = Object.values(productMap)
    .sort((a, b) => b.revenue - a.revenue)
    .slice(0, 10)

  // Pagos
  const payment_methods = {}
  paid.forEach(o => {
    const method = o.payment_details?.method || 'otro'
    payment_methods[method] = (payment_methods[method] || 0) + 1
  })

  // Clientes nuevos vs recurrentes
  const customerIds = paid.map(o => o.customer?.id).filter(Boolean)
  const unique_customers = new Set(customerIds).size

  return {
    total_revenue:    Math.round(total_revenue),
    total_orders,
    aov:              Math.round(aov),
    unique_customers,
    top_products,
    payment_methods,
  }
}

// ── Main ───────────────────────────────────────────────────────
async function main() {
  const today = new Date().toISOString().split('T')[0]
  console.log(`\n🛍️ Sincronizando Tiendanube — ${today}`)

  try {
    // Fetch múltiples períodos
    console.log('  📦 Fetching órdenes últimos 7d...')
    const orders7d = await fetchOrders(7)
    const summary7d = buildTNSummary(orders7d)
    console.log(`  ✅ ${summary7d.total_orders} órdenes · $${summary7d.total_revenue.toLocaleString('es-AR')} ARS`)

    console.log('  📦 Fetching órdenes últimos 30d...')
    const orders30d = await fetchOrders(30)
    const summary30d = buildTNSummary(orders30d)

    console.log('  📦 Fetching órdenes hoy...')
    const ordersToday = await fetchOrders(1)
    const summaryToday = buildTNSummary(ordersToday)

    const snapshot = {
      snapshot_date: today,
      summary_7d:    summary7d,
      summary_30d:   summary30d,
      summary_today: summaryToday,
      orders_count:  orders7d.length,
    }

    console.log('  💾 Guardando en Supabase...')
    const { error } = await supabase
      .from('tiendanube_snapshots')
      .upsert(snapshot, { onConflict: 'snapshot_date' })

    if (error) throw error

    console.log(`\n✅ Tiendanube sync completado — ${today}`)
    console.log(`   7d: ${summary7d.total_orders} órdenes · $${summary7d.total_revenue.toLocaleString('es-AR')} · AOV $${summary7d.aov.toLocaleString('es-AR')}\n`)

  } catch (err) {
    console.error('\n❌ Error en Tiendanube sync:', err.message)
    process.exit(1)
  }
}

main()
