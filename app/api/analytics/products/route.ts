import { NextResponse } from 'next/server'
import { createClientServer } from '@/lib/supabase'

export const dynamic = 'force-dynamic'

/**
 * GET /api/analytics/products?days=30
 * Ventas por producto + margen real + revenue neto, desde tn_orders.
 * Cruza con product_costs (unit_cost) para margen; si falta el costo, lo marca.
 */

type OrderProduct = { product_id: string | null; name: string; quantity: number; price: number }
type OrderRow = {
  order_date: string | null
  total: number | null
  payment_status: string | null
  status: string | null
  products: OrderProduct[] | null
}
type CostRow = { product_id: string; product_name: string; unit_cost: number }

const PAID = new Set(['paid', 'closed'])

export async function GET(req: Request) {
  const { searchParams } = new URL(req.url)
  const days = Math.min(Math.max(parseInt(searchParams.get('days') || '30', 10), 1), 365)
  const since = new Date()
  since.setDate(since.getDate() - days)
  const sinceIso = since.toISOString()

  const supabase = createClientServer()
  const [ordersRes, costsRes] = await Promise.all([
    supabase
      .from('tn_orders')
      .select('order_date, total, payment_status, status, products')
      .gte('order_date', sinceIso),
    supabase.from('product_costs').select('product_id, product_name, unit_cost'),
  ])

  if (ordersRes.error) {
    return NextResponse.json({ error: ordersRes.error.message }, { status: 500 })
  }

  const orders = (ordersRes.data || []) as unknown as OrderRow[]
  if (!orders.length) {
    return NextResponse.json({ empty: true, message: 'Sin órdenes persistidas todavía. Corré el sync de TN.' })
  }

  const costMap = new Map<string, number>()
  ;((costsRes.data || []) as unknown as CostRow[]).forEach((c) => costMap.set(c.product_id, c.unit_cost))

  // Revenue neto: pagadas vs canceladas
  let grossRevenue = 0
  let cancelledRevenue = 0
  let cancelledCount = 0
  const paidOrders = orders.filter((o) => o.payment_status && PAID.has(o.payment_status))
  paidOrders.forEach((o) => (grossRevenue += o.total || 0))
  orders
    .filter((o) => o.status === 'cancelled' || o.payment_status === 'refunded' || o.payment_status === 'voided')
    .forEach((o) => {
      cancelledRevenue += o.total || 0
      cancelledCount += 1
    })

  // Agregación por producto (solo pagadas)
  const prodMap = new Map<string, { name: string; units: number; revenue: number; cost: number; hasCost: boolean }>()
  for (const o of paidOrders) {
    for (const p of o.products || []) {
      const key = p.product_id || p.name
      const baseName = (p.name || '').replace(/\s*\([^)]*\)\s*$/, '').trim() || p.name
      const lineRev = (p.price || 0) * (p.quantity || 0)
      const unitCost = p.product_id != null ? costMap.get(p.product_id) : undefined
      const acc = prodMap.get(key) || { name: baseName, units: 0, revenue: 0, cost: 0, hasCost: unitCost != null }
      acc.units += p.quantity || 0
      acc.revenue += lineRev
      if (unitCost != null) acc.cost += unitCost * (p.quantity || 0)
      else acc.hasCost = false
      prodMap.set(key, acc)
    }
  }

  const products = Array.from(prodMap.values())
    .map((p) => ({
      name: p.name,
      units: p.units,
      revenue: Math.round(p.revenue),
      cost: Math.round(p.cost),
      margin: p.hasCost ? Math.round(p.revenue - p.cost) : null,
      margin_pct: p.hasCost && p.revenue > 0 ? Math.round(((p.revenue - p.cost) / p.revenue) * 100) : null,
      has_cost: p.hasCost,
    }))
    .sort((a, b) => b.revenue - a.revenue)
    .slice(0, 25)

  const withCost = products.filter((p) => p.has_cost)
  const totalMargin = withCost.reduce((s, p) => s + (p.margin || 0), 0)
  const totalRevWithCost = withCost.reduce((s, p) => s + p.revenue, 0)

  return NextResponse.json({
    days,
    gross_revenue: Math.round(grossRevenue),
    net_revenue: Math.round(grossRevenue - cancelledRevenue),
    cancelled_revenue: Math.round(cancelledRevenue),
    cancelled_count: cancelledCount,
    blended_margin_pct: totalRevWithCost > 0 ? Math.round((totalMargin / totalRevWithCost) * 100) : null,
    products_without_cost: products.filter((p) => !p.has_cost).length,
    products,
  })
}
