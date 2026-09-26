import { NextRequest, NextResponse } from 'next/server'

export const dynamic = 'force-dynamic'

const TN_BASE = 'https://api.tiendanube.com/2021-10'
const STORE_ID = process.env.TN_STORE_ID!
const TOKEN    = process.env.TN_ACCESS_TOKEN!

interface TNOrderProduct {
  product_id: number | null
  name: string
  quantity: number
  price: string
  variant_id?: number | null
}

interface TNOrder {
  id: number
  payment_status: string
  created_at: string
  products?: TNOrderProduct[]
}

interface ProductEntry {
  product_id: number
  name: string
  units_sold: number
  revenue: number
}

async function fetchOrdersWithProducts(month: string): Promise<TNOrder[]> {
  // month = "2026-05"
  const [year, m] = month.split('-').map(Number)
  // TN timestamps are in store timezone — use date-only range to be safe
  const from = `${year}-${String(m).padStart(2, '0')}-01T00:00:00-03:00`
  const lastDay = new Date(year, m, 0).getDate()
  const to   = `${year}-${String(m).padStart(2, '0')}-${String(lastDay).padStart(2, '0')}T23:59:59-03:00`

  const orders: TNOrder[] = []
  let page = 1
  while (true) {
    const url = `${TN_BASE}/${STORE_ID}/orders?payment_status=paid&created_at_min=${encodeURIComponent(from)}&created_at_max=${encodeURIComponent(to)}&per_page=200&page=${page}`
    const res = await fetch(url, {
      headers: {
        'Authentication': `bearer ${TOKEN}`,
        'User-Agent': 'ForeverApp/1.0 (francojah@gmail.com)',
      },
      next: { revalidate: 0 },
    })
    if (!res.ok) {
      const errText = await res.text().catch(() => '')
      throw new Error(`TN API error ${res.status}: ${errText.slice(0, 200)}`)
    }
    const batch: TNOrder[] = await res.json()
    if (!batch || !batch.length) break
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

    const orders = await fetchOrdersWithProducts(month)

    // Aggregate by product_id — skip items without product_id (deleted products or custom items)
    const map: Record<number, ProductEntry> = {}
    for (const o of orders) {
      const items = o.products ?? []
      for (const p of items) {
        // Skip line items with no product_id (custom/deleted products)
        if (!p.product_id) continue
        const pid = Number(p.product_id)
        if (!map[pid]) {
          map[pid] = { product_id: pid, name: p.name, units_sold: 0, revenue: 0 }
        }
        map[pid].units_sold += Number(p.quantity) || 0
        map[pid].revenue   += (Number(p.quantity) || 0) * (parseFloat(p.price || '0') || 0)
      }
    }

    const products = Object.values(map).sort((a, b) => b.units_sold - a.units_sold)

    return NextResponse.json({
      month,
      total_orders: orders.length,
      products,
      debug: {
        orders_fetched: orders.length,
        sample_has_products: orders.length > 0 ? (orders[0].products?.length ?? 0) : 0,
      },
    })
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'Error'
    return NextResponse.json({ error: msg }, { status: 500 })
  }
}
