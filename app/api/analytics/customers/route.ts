import { NextResponse } from 'next/server'
import { createClientServer } from '@/lib/supabase'

export const dynamic = 'force-dynamic'

/**
 * GET /api/analytics/customers
 * Recurrencia y LTV a partir de tn_orders (órdenes crudas persistidas).
 *
 * Devuelve: totales de clientes, tasa de recompra, LTV promedio, distribución
 * por # de compras, y serie mensual de nuevos vs recurrentes.
 */

type OrderRow = {
  tn_order_id: string
  order_date: string | null
  customer_id: string | null
  total: number | null
  payment_status: string | null
}

const PAID = new Set(['paid', 'closed'])

export async function GET() {
  const supabase = createClientServer()
  const { data, error } = await supabase
    .from('tn_orders')
    .select('tn_order_id, order_date, customer_id, total, payment_status')
    .order('order_date', { ascending: true })

  if (error) {
    // Tabla puede no existir todavía (migración pendiente) → vacío, no 500
    return NextResponse.json({ empty: true, message: 'Sin órdenes todavía. Corré la migración tn_orders y el sync de TN.' })
  }

  const orders = ((data || []) as unknown as OrderRow[]).filter(
    (o) => o.customer_id && o.payment_status && PAID.has(o.payment_status)
  )

  if (!orders.length) {
    return NextResponse.json({ empty: true, message: 'Sin órdenes persistidas todavía. Corré el sync de TN.' })
  }

  // Agregación por cliente
  const byCustomer = new Map<string, { orders: number; revenue: number; firstDate: string }>()
  for (const o of orders) {
    const c = byCustomer.get(o.customer_id!) || { orders: 0, revenue: 0, firstDate: o.order_date || '' }
    c.orders += 1
    c.revenue += o.total || 0
    if (o.order_date && (!c.firstDate || o.order_date < c.firstDate)) c.firstDate = o.order_date
    byCustomer.set(o.customer_id!, c)
  }

  const customers = Array.from(byCustomer.values())
  const totalCustomers = customers.length
  const repeatCustomers = customers.filter((c) => c.orders > 1).length
  const totalRevenue = customers.reduce((s, c) => s + c.revenue, 0)
  const totalOrders = customers.reduce((s, c) => s + c.orders, 0)

  // Distribución por # de compras (1, 2, 3, 4+)
  const dist = { one: 0, two: 0, three: 0, fourPlus: 0 }
  customers.forEach((c) => {
    if (c.orders === 1) dist.one++
    else if (c.orders === 2) dist.two++
    else if (c.orders === 3) dist.three++
    else dist.fourPlus++
  })

  // Serie mensual: nuevos (primera compra ese mes) vs recurrentes (ya compraron antes)
  const monthly = new Map<string, { nuevos: number; recurrentes: number }>()
  const seen = new Set<string>()
  for (const o of orders) {
    if (!o.order_date) continue
    const month = o.order_date.slice(0, 7)
    const m = monthly.get(month) || { nuevos: 0, recurrentes: 0 }
    if (seen.has(o.customer_id!)) m.recurrentes += 1
    else {
      m.nuevos += 1
      seen.add(o.customer_id!)
    }
    monthly.set(month, m)
  }

  return NextResponse.json({
    total_customers: totalCustomers,
    repeat_customers: repeatCustomers,
    repeat_rate: totalCustomers ? Math.round((repeatCustomers / totalCustomers) * 1000) / 10 : 0,
    avg_ltv: totalCustomers ? Math.round(totalRevenue / totalCustomers) : 0,
    avg_orders_per_customer: totalCustomers ? Math.round((totalOrders / totalCustomers) * 100) / 100 : 0,
    distribution: dist,
    monthly: Array.from(monthly.entries())
      .sort((a, b) => a[0].localeCompare(b[0]))
      .map(([month, v]) => ({ month, ...v })),
  })
}
