import { NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

export const dynamic = 'force-dynamic'

/**
 * GET /api/analytics/cogs?since=ISO&until=ISO&fallback=6500
 * Costo de mercadería REAL del período: suma de (unit_cost × qty) por línea,
 * usando product_costs. Para unidades sin costo cargado usa `fallback`.
 * Devuelve el desglose para que el Balance muestre un COGS preciso.
 */

type OrderProduct = { product_id: string | null; quantity: number }
type OrderRow = { order_date: string | null; payment_status: string | null; products: OrderProduct[] | null }
type CostRow = { product_id: string; unit_cost: number }

const PAID = new Set(['paid', 'closed'])

export async function GET(req: Request) {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!url || !key) return NextResponse.json({ error: 'Sin credenciales' }, { status: 500 })
  const sb = createClient(url, key)

  const { searchParams } = new URL(req.url)
  const now = new Date()
  const since = searchParams.get('since') || new Date(now.getFullYear(), now.getMonth(), 1).toISOString()
  const until = searchParams.get('until') || now.toISOString()
  const fallback = Number(searchParams.get('fallback')) || 6500

  const [ordersRes, costsRes] = await Promise.all([
    sb.from('tn_orders').select('order_date, payment_status, products').gte('order_date', since).lte('order_date', until),
    sb.from('product_costs').select('product_id, unit_cost'),
  ])
  if (ordersRes.error) return NextResponse.json({ empty: true, merch: 0, error: ordersRes.error.message })

  const costMap = new Map<string, number>()
  ;((costsRes.data || []) as unknown as CostRow[]).forEach((c) => costMap.set(String(c.product_id), c.unit_cost))

  const orders = ((ordersRes.data || []) as unknown as OrderRow[]).filter((o) => o.payment_status && PAID.has(o.payment_status))

  let merch = 0, units = 0, unitsWithCost = 0
  for (const o of orders) {
    for (const p of o.products || []) {
      const qty = p.quantity || 0
      units += qty
      const c = p.product_id != null ? costMap.get(String(p.product_id)) : undefined
      if (c != null) { merch += c * qty; unitsWithCost += qty }
      else { merch += fallback * qty }
    }
  }

  return NextResponse.json({
    merch: Math.round(merch),
    units,
    units_with_cost: unitsWithCost,
    units_without_cost: units - unitsWithCost,
    coverage_pct: units > 0 ? Math.round((unitsWithCost / units) * 100) : 0,
    since, until,
  })
}
