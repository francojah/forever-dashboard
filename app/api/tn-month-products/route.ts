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

interface TNOrderProduct {
  product_id: number | null
  name: string
  quantity: number
  price: string
}

interface TNOrder {
  id: number
  products?: TNOrderProduct[]
}

interface ProductEntry {
  product_id: number
  name: string
  units_sold: number
  revenue: number
}

export async function GET(req: NextRequest) {
  try {
    const month = req.nextUrl.searchParams.get('month')
    if (!month || !/^\d{4}-\d{2}$/.test(month)) {
      return NextResponse.json({ error: 'Parámetro month requerido (YYYY-MM)' }, { status: 400 })
    }

    const { token, userId } = await getTNCredentials()

    const [year, m] = month.split('-').map(Number)
    const lastDay = new Date(year, m, 0).getDate()
    // Use date-only strings to avoid timezone issues — TN interprets them in store's timezone
    const from = `${year}-${String(m).padStart(2, '0')}-01`
    const to   = `${year}-${String(m).padStart(2, '0')}-${String(lastDay).padStart(2, '0')}`

    const orders: TNOrder[] = []
    let page = 1
    while (true) {
      const url = `${TN_API}/${userId}/orders?payment_status=paid&created_at_min=${from}&created_at_max=${to}&per_page=200&page=${page}`
      const res = await fetch(url, {
        headers: {
          'Authentication': `bearer ${token}`,
          'User-Agent': 'ForeverDashboard/1.0 (francojah@gmail.com)',
        },
        cache: 'no-store',
      })
      if (!res.ok) {
        const errText = await res.text().catch(() => '')
        throw new Error(`TN API error ${res.status}: ${errText.slice(0, 300)}`)
      }
      const batch: TNOrder[] = await res.json()
      if (!batch || !batch.length) break
      orders.push(...batch)
      if (batch.length < 200) break
      page++
    }

    // Aggregate by product_id
    const map: Record<number, ProductEntry> = {}
    for (const o of orders) {
      for (const p of o.products ?? []) {
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

    return NextResponse.json({ month, total_orders: orders.length, products })
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'Error'
    return NextResponse.json({ error: msg }, { status: 500 })
  }
}
