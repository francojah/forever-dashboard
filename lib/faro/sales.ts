import type { FaroContext } from './context'
import { Period, previousPeriod, localDate, addDays } from './dates'
import { loadOrders, loadCostIndex, summarizeSales, isSale, orderEconomics, OrderRow, SalesSummary, itemUnitCost } from './metrics'
import { svc, fetchAll } from './db'
import { productTable, ProductRow } from './home'
import { getCachedProducts } from './actions'
import { PAYMENT_METHOD_LABELS, feePctFor } from './settings'

export interface Breakdown { key: string; label: string; orders: number; amount: number; extra?: number }

export interface SalesData {
  period: Period
  prevLabel: string
  sales: SalesSummary
  prev: SalesSummary
  payments: Breakdown[]
  shipping: Breakdown[]
  provinces: Breakdown[]
  weekdays: Breakdown[]
  products: (ProductRow & { stock: number | null; daysLeft: number | null; costSource: string })[]
  customers: { newCustomers: number; returning: number; repeatRateAllTime: number | null; ltv: number | null; avgOrdersPerCustomer: number | null; totalCustomers: number }
}

const WEEKDAYS = ['Domingo', 'Lunes', 'Martes', 'Miércoles', 'Jueves', 'Viernes', 'Sábado']

export async function loadSales(ctx: FaroContext, period: Period, withProducts: boolean): Promise<SalesData> {
  const tz = ctx.workspace.timezone
  const s = ctx.workspace.settings
  const stores = ctx.stores.filter((x) => x.active)
  const storeIds = stores.map((x) => x.id)
  const prevP = previousPeriod(period)
  const [orders, idx] = await Promise.all([loadOrders(storeIds, prevP.from, period.to, tz), loadCostIndex(storeIds)])
  const inP = (o: OrderRow, p: Period) => { const d = localDate(new Date(o.created_at), tz); return d >= p.from && d <= p.to }
  const cur = orders.filter((o) => inP(o, period))
  const prv = orders.filter((o) => inP(o, prevP))
  const paid = cur.filter(isSale)

  const group = (keyFn: (o: OrderRow) => string, labelFn: (k: string) => string, extraFn?: (o: OrderRow) => number) => {
    const m = new Map<string, Breakdown>()
    for (const o of paid) {
      const k = keyFn(o)
      const e = orderEconomics(o, tz, idx, s)
      const row = m.get(k) || { key: k, label: labelFn(k), orders: 0, amount: 0, extra: 0 }
      row.orders++
      row.amount += e.net
      if (extraFn) row.extra = (row.extra || 0) + extraFn(o)
      m.set(k, row)
    }
    return Array.from(m.values()).sort((a, b) => b.amount - a.amount)
  }

  const payments = group((o) => o.payment_method || 'otro', (k) => PAYMENT_METHOD_LABELS[k] || k, (o) => o.total * (feePctFor(s, o.payment_method).pct / 100))
  const shipping = group((o) => o.shipping_option || (o.shipping_pickup === 'pickup' ? 'Retiro' : 'Sin dato'), (k) => k, (o) => o.shipping_owner - o.shipping_customer)
  const provinces = group((o) => o.province || 'Sin dato', (k) => k).slice(0, 10)
  const weekdaysMap = new Map<number, Breakdown>()
  for (const o of paid) {
    const d = new Date(`${localDate(new Date(o.created_at), tz)}T12:00:00Z`).getUTCDay()
    const row = weekdaysMap.get(d) || { key: String(d), label: WEEKDAYS[d], orders: 0, amount: 0 }
    row.orders++
    row.amount += Math.max(0, o.total - o.shipping_customer)
    weekdaysMap.set(d, row)
  }
  const weekdays = [1, 2, 3, 4, 5, 6, 0].map((d) => weekdaysMap.get(d) || { key: String(d), label: WEEKDAYS[d], orders: 0, amount: 0 })

  // Clientes: primera compra histórica de cada uno
  const allPaid = await fetchAll<{ customer_id: string | null; created_at: string; total: number; shipping_customer: number; payment_status: string; status: string; cancelled_at: string | null }>((a, b) =>
    svc().from('orders').select('customer_id,created_at,total,shipping_customer,payment_status,status,cancelled_at').in('store_id', storeIds.length ? storeIds : ['00000000-0000-0000-0000-000000000000']).order('created_at').range(a, b))
  const first = new Map<string, string>()
  const perCustomer = new Map<string, { orders: number; net: number }>()
  for (const o of allPaid) {
    if (!o.customer_id || !isSale(o)) continue
    if (!first.has(o.customer_id)) first.set(o.customer_id, o.created_at)
    const c = perCustomer.get(o.customer_id) || { orders: 0, net: 0 }
    c.orders++
    c.net += Math.max(0, Number(o.total) - Number(o.shipping_customer))
    perCustomer.set(o.customer_id, c)
  }
  const fromUtc = period.from
  let newCustomers = 0
  let returning = 0
  const seen = new Set<string>()
  for (const o of paid) {
    if (!o.customer_id || seen.has(o.customer_id)) continue
    seen.add(o.customer_id)
    const f = first.get(o.customer_id)
    if (f && localDate(new Date(f), tz) < fromUtc) returning++
    else newCustomers++
  }
  const totals = Array.from(perCustomer.values())
  const customers = {
    newCustomers, returning,
    totalCustomers: totals.length,
    repeatRateAllTime: totals.length ? totals.filter((c) => c.orders > 1).length / totals.length : null,
    ltv: totals.length ? totals.reduce((a, c) => a + c.net, 0) / totals.length : null,
    avgOrdersPerCustomer: totals.length ? totals.reduce((a, c) => a + c.orders, 0) / totals.length : null,
  }

  let products: SalesData['products'] = []
  if (withProducts) {
    const base = productTable(cur, tz, idx, s)
    // Velocidad de los últimos 14 días para días de stock
    const today = localDate(new Date(), tz)
    const recent = await loadOrders(storeIds, addDays(today, -13), today, tz)
    const sold14 = new Map<string, number>()
    for (const o of recent) if (isSale(o)) for (const it of o.items) if (it.product_id) sold14.set(it.product_id, (sold14.get(it.product_id) || 0) + it.qty)
    const stock = new Map<string, number | null>()
    for (const st of stores) {
      try { (await getCachedProducts(st)).forEach((p) => stock.set(p.id, p.stock)) } catch { /* sin stock */ }
    }
    const src = new Map<string, string>()
    for (const o of paid) for (const it of o.items) {
      const k = it.product_id || it.name
      if (src.has(k)) continue
      src.set(k, itemUnitCost(o.store_id, it, localDate(new Date(o.created_at), tz), idx, s).source)
    }
    products = base.map((p) => {
      const st = stock.has(p.id) ? stock.get(p.id)! : null
      const perDay = (sold14.get(p.id) || 0) / 14
      return { ...p, stock: st, daysLeft: st != null && perDay > 0 ? st / perDay : null, costSource: src.get(p.id) || 'estimated' }
    })
  }

  return {
    period, prevLabel: prevP.label,
    sales: summarizeSales(cur, tz, idx, s), prev: summarizeSales(prv, tz, idx, s),
    payments, shipping, provinces, weekdays, products, customers,
  }
}
