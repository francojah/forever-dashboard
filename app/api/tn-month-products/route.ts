import { NextRequest, NextResponse } from 'next/server'

export const dynamic = 'force-dynamic'

const TN_BASE = 'https://api.tiendanube.com/2021-10'
const STORE_ID = process.env.TN_STORE_ID!
const TOKEN    = process.env.TN_ACCESS_TOKEN!

interface TNOrder {
  id: number
  payment_status: string
  created_at: string
  products?: Array<{
    product_id: number
    name: string
    quantity: number
    price: string
  }>
}

interface ProductEntry {
  product_id: number
  name: string
  units_sold: number
  revenue: number
}

async function fetchOrders(month: string): Promise<TNOrder[]> {
  // month = "2026-05"
  const [year, m] = month.split('-').map(Number)
  const from = new Date(year, m - 1, 1).toISOString()
  const to   = new Date(year, m, 0, 23, 59, 59).toISOString()

  const orders: TNOrder[] = []
  let page = 1
  while (true) {
    const url = `${TN_BASE}/${STORE_ID}/orders?payment_status=paid&created_at_min=${from}&created_at_max=${to}&per_page=200&page=${page}`
    const res = await fetch(url, {
      headers: { 'Authentication': `bearer ${TOKEN}`, 'User-Agent': 'ForeverApp/1.0 (francojah@gmail.com)' },
    })
    if (!res.ok) break
    const batch: TNOrder[] = await res.json()
    if (!batch.length) break
    orders.push(...batch)
    if (batch.length < 200) break
    page++
  }
  return orders
}

export async function GET(req: NextRequest) {
  try {
    const month = req.nextUrl.searchParams.get('month')
    if (!month || !/^\d{4}-\d{2}$/.test(month)) {
      return NextResponse.json({ error: 'Parámetro month requerido (YYYY-MM)' }, { status: 400 })
    }

    const orders = await fetchOrders(month)

    // Aggregate by product
    const map: Record<number, ProductEntry> = {}
    for (const o of orders) {
      for (const p of o.products ?? []) {
        if (!map[p.product_id]) {
          map[p.product_id] = { product_id: p.product_id, name: p.name, units_sold: 0, revenue: 0 }
        }
        map[p.product_id].units_sold += p.quantity
        map[p.product_id].revenue   += p.quantity * parseFloat(p.price || '0')
      }
    }

    const products = Object.values(map).sort((a, b) => b.units_sold - a.units_sold)

    return NextResponse.json({
      month,
      total_orders: orders.length,
      products,
    })
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'Error'
    return NextResponse.json({ error: msg }, { status: 500 })
  }
}
