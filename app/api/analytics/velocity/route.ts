import { NextResponse } from 'next/server'
import { createClientServer } from '@/lib/supabase'

export const dynamic = 'force-dynamic'

/**
 * GET /api/analytics/velocity?days=14
 * Velocidad de venta por producto (unidades/día) desde tn_orders.
 * Se cruza en el cliente con /api/tn-stock para estimar días de stock restante.
 */

type OrderProduct = { product_id: string | null; name: string; quantity: number }
type OrderRow = { order_date: string | null; payment_status: string | null; products: OrderProduct[] | null }

const PAID = new Set(['paid', 'closed'])

export async function GET(req: Request) {
  const { searchParams } = new URL(req.url)
  const days = Math.min(Math.max(parseInt(searchParams.get('days') || '14', 10), 1), 90)
  const since = new Date()
  since.setDate(since.getDate() - days)

  const supabase = createClientServer()
  const { data, error } = await supabase
    .from('tn_orders')
    .select('order_date, payment_status, products')
    .gte('order_date', since.toISOString())

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  const orders = ((data || []) as unknown as OrderRow[]).filter(
    (o) => o.payment_status && PAID.has(o.payment_status)
  )
  if (!orders.length) return NextResponse.json({ empty: true, days, products: [] })

  const map = new Map<string, { name: string; units: number }>()
  for (const o of orders) {
    for (const p of o.products || []) {
      if (!p.product_id) continue
      const acc = map.get(p.product_id) || { name: p.name.replace(/\s*\([^)]*\)\s*$/, '').trim() || p.name, units: 0 }
      acc.units += p.quantity || 0
      map.set(p.product_id, acc)
    }
  }

  const products = Array.from(map.entries()).map(([product_id, v]) => ({
    product_id,
    name: v.name,
    units_sold: v.units,
    units_per_day: Math.round((v.units / days) * 100) / 100,
  }))

  return NextResponse.json({ days, products })
}
