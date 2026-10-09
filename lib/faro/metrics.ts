import { svc, fetchAll } from './db'
import { WorkspaceSettings, feePctFor } from './settings'
import { Period, startOfLocalDayUTC, addDays, localDate, localMinutes, eachDay } from './dates'

export interface OrderRow {
  store_id: string
  order_id: string
  number: string | null
  created_at: string
  status: string | null
  payment_status: string | null
  cancelled_at: string | null
  subtotal: number
  discount: number
  total: number
  shipping_customer: number
  shipping_owner: number
  payment_method: string | null
  gateway: string | null
  installments: number | null
  units: number
  customer_id: string | null
  customer_email: string | null
  province: string | null
  shipping_option: string | null
  shipping_pickup: string | null
  items: { product_id: string | null; variant_id: string | null; name: string; qty: number; price: number; cost: number | null }[]
}

const ORDER_COLS = 'store_id,order_id,number,created_at,status,payment_status,cancelled_at,subtotal,discount,total,shipping_customer,shipping_owner,payment_method,gateway,installments,units,customer_id,customer_email,province,shipping_option,shipping_pickup,items'

export function isSale(o: Pick<OrderRow, 'payment_status' | 'status' | 'cancelled_at'>) {
  return o.payment_status === 'paid' && o.status !== 'cancelled' && !o.cancelled_at
}

export async function loadOrders(storeIds: string[], from: string, to: string, tz: string): Promise<OrderRow[]> {
  if (!storeIds.length) return []
  const fromUtc = startOfLocalDayUTC(from, tz)
  const toUtc = startOfLocalDayUTC(addDays(to, 1), tz)
  const rows = await fetchAll<OrderRow>((a, b) =>
    svc().from('orders').select(ORDER_COLS).in('store_id', storeIds).gte('created_at', fromUtc).lt('created_at', toUtc)
      .order('created_at', { ascending: true }).range(a, b))
  return rows.map((r) => ({
    ...r,
    subtotal: Number(r.subtotal) || 0, discount: Number(r.discount) || 0, total: Number(r.total) || 0,
    shipping_customer: Number(r.shipping_customer) || 0, shipping_owner: Number(r.shipping_owner) || 0,
    items: Array.isArray(r.items) ? r.items : [],
  }))
}

// ── Costos de mercadería ───────────────────────────────────────────────────
export interface CostEntry { product_id: string; variant_id: string; unit_cost: number; valid_from: string; store_id: string; name: string }
export type CostIndex = Map<string, CostEntry[]>

export async function loadCostIndex(storeIds: string[]): Promise<CostIndex> {
  const idx: CostIndex = new Map()
  if (!storeIds.length) return idx
  const rows = await fetchAll<CostEntry>((a, b) =>
    svc().from('cost_items').select('store_id,product_id,variant_id,unit_cost,valid_from,name').in('store_id', storeIds).order('valid_from').range(a, b))
  for (const r of rows) {
    const k = `${r.store_id}|${r.product_id}|${r.variant_id || ''}`
    const list = idx.get(k) || []
    list.push({ ...r, unit_cost: Number(r.unit_cost) })
    idx.set(k, list)
  }
  return idx
}

function costAt(list: CostEntry[] | undefined, ymd: string): number | null {
  if (!list?.length) return null
  let found: number | null = null
  for (const c of list) if (c.valid_from <= ymd) found = c.unit_cost
  return found ?? list[0].unit_cost
}

export type CostSource = 'manual' | 'platform' | 'estimated'

export function itemUnitCost(
  storeId: string, item: OrderRow['items'][number], ymd: string, idx: CostIndex, s: WorkspaceSettings,
): { cost: number; source: CostSource } {
  const pid = item.product_id || ''
  const variant = costAt(idx.get(`${storeId}|${pid}|${item.variant_id || ''}`), ymd)
  if (variant != null) return { cost: variant, source: 'manual' }
  const product = costAt(idx.get(`${storeId}|${pid}|`), ymd)
  if (product != null) return { cost: product, source: 'manual' }
  if (s.use_platform_cost && item.cost != null && item.cost > 0) return { cost: item.cost, source: 'platform' }
  return { cost: (item.price || 0) * (s.cost_fallback_pct / 100), source: 'estimated' }
}

// ── Ventas y margen de contribución ────────────────────────────────────────
export interface SalesSummary {
  orders: number
  units: number
  customers: number
  productsGross: number      // a precio de lista
  discounts: number
  netSales: number           // lo cobrado por productos (sin envío)
  shippingCustomer: number
  shippingOwner: number
  cogs: number
  cogsCoverage: { manual: number; platform: number; estimated: number }   // % de unidades
  platformFee: number
  paymentFees: number
  paymentFeesUnknownShare: number   // % de ventas sin comisión configurada
  packaging: number
  iibb: number
  contribution: number
  cancelled: number
  pending: number
}

const zeroSales = (): SalesSummary => ({
  orders: 0, units: 0, customers: 0, productsGross: 0, discounts: 0, netSales: 0, shippingCustomer: 0, shippingOwner: 0,
  cogs: 0, cogsCoverage: { manual: 0, platform: 0, estimated: 0 }, platformFee: 0, paymentFees: 0, paymentFeesUnknownShare: 0,
  packaging: 0, iibb: 0, contribution: 0, cancelled: 0, pending: 0,
})

export interface OrderEconomics {
  net: number
  cogs: number
  fees: number
  feeKnown: boolean
  contribution: number
  units: { manual: number; platform: number; estimated: number }
}

export function orderEconomics(o: OrderRow, tz: string, idx: CostIndex, s: WorkspaceSettings): OrderEconomics {
  const ymd = localDate(new Date(o.created_at), tz)
  const net = Math.max(0, o.total - o.shipping_customer)
  let cogs = 0
  const units = { manual: 0, platform: 0, estimated: 0 }
  for (const it of o.items) {
    const c = itemUnitCost(o.store_id, it, ymd, idx, s)
    cogs += c.cost * (it.qty || 1)
    units[c.source] += it.qty || 1
  }
  const fee = feePctFor(s, o.payment_method)
  const fees = o.total * (fee.pct / 100)
  const platform = net * (s.platform_fee_pct / 100)
  const iibb = net * (s.iibb_pct / 100)
  const contribution = net + o.shipping_customer - cogs - o.shipping_owner - platform - fees - s.packaging_per_order - iibb
  return { net, cogs, fees, feeKnown: fee.known, contribution, units }
}

export function summarizeSales(orders: OrderRow[], tz: string, idx: CostIndex, s: WorkspaceSettings): SalesSummary {
  const r = zeroSales()
  const customers = new Set<string>()
  let unitsTotal = 0
  let unknownFeeSales = 0
  for (const o of orders) {
    if (!isSale(o)) {
      if (o.status === 'cancelled' || o.cancelled_at) r.cancelled++
      else if (o.payment_status === 'pending' || o.payment_status === 'authorized') r.pending++
      continue
    }
    const e = orderEconomics(o, tz, idx, s)
    r.orders++
    r.units += o.units
    if (o.customer_id) customers.add(o.customer_id)
    r.productsGross += o.subtotal
    r.netSales += e.net
    r.shippingCustomer += o.shipping_customer
    r.shippingOwner += o.shipping_owner
    r.cogs += e.cogs
    r.cogsCoverage.manual += e.units.manual
    r.cogsCoverage.platform += e.units.platform
    r.cogsCoverage.estimated += e.units.estimated
    unitsTotal += e.units.manual + e.units.platform + e.units.estimated
    r.paymentFees += e.fees
    if (!e.feeKnown) unknownFeeSales += o.total
    r.platformFee += e.net * (s.platform_fee_pct / 100)
    r.iibb += e.net * (s.iibb_pct / 100)
    r.packaging += s.packaging_per_order
    r.contribution += e.contribution
  }
  r.discounts = Math.max(0, r.productsGross - r.netSales)
  r.customers = customers.size
  if (unitsTotal > 0) {
    r.cogsCoverage = {
      manual: r.cogsCoverage.manual / unitsTotal,
      platform: r.cogsCoverage.platform / unitsTotal,
      estimated: r.cogsCoverage.estimated / unitsTotal,
    }
  }
  const salesTotal = r.netSales + r.shippingCustomer
  r.paymentFeesUnknownShare = salesTotal > 0 ? unknownFeeSales / salesTotal : 0
  return r
}

// ── Meta ───────────────────────────────────────────────────────────────────
export interface AdsDaily { date: string; spend: number; impressions: number; link_clicks: number; lpv: number; atc: number; ic: number; purchases: number; purchase_value: number }
export interface AdsSummary { spend: number; impressions: number; linkClicks: number; lpv: number; atc: number; ic: number; purchases: number; purchaseValue: number }

export async function loadAdsDaily(accountIds: string[], from: string, to: string): Promise<AdsDaily[]> {
  if (!accountIds.length) return []
  const { data, error } = await svc().rpc('faro_ads_daily', { p_accounts: accountIds, p_from: from, p_to: to })
  if (error) throw new Error(error.message)
  return ((data || []) as AdsDaily[]).map((d) => ({
    date: String(d.date), spend: Number(d.spend) || 0, impressions: Number(d.impressions) || 0, link_clicks: Number(d.link_clicks) || 0,
    lpv: Number(d.lpv) || 0, atc: Number(d.atc) || 0, ic: Number(d.ic) || 0, purchases: Number(d.purchases) || 0, purchase_value: Number(d.purchase_value) || 0,
  }))
}

export function summarizeAds(rows: AdsDaily[], scale = 1): AdsSummary {
  const s = rows.reduce((a, d) => ({
    spend: a.spend + d.spend, impressions: a.impressions + d.impressions, linkClicks: a.linkClicks + d.link_clicks,
    lpv: a.lpv + d.lpv, atc: a.atc + d.atc, ic: a.ic + d.ic, purchases: a.purchases + d.purchases, purchaseValue: a.purchaseValue + d.purchase_value,
  }), { spend: 0, impressions: 0, linkClicks: 0, lpv: 0, atc: 0, ic: 0, purchases: 0, purchaseValue: 0 })
  if (scale !== 1) (Object.keys(s) as (keyof AdsSummary)[]).forEach((k) => { s[k] = s[k] * scale })
  return s
}

// ── Resumen de un período ──────────────────────────────────────────────────
export interface PeriodSummary {
  sales: SalesSummary
  ads: AdsSummary
  adTax: number
  adCost: number            // gasto + impuestos no recuperables
  profitAfterAds: number
  mer: number | null
  roasMeta: number | null
  cpa: number | null
  maxCpa: number | null     // ganancia por orden antes de publicidad
  breakevenMer: number | null
  aov: number | null
  contributionMargin: number | null
}

export function buildSummary(sales: SalesSummary, ads: AdsSummary, s: WorkspaceSettings): PeriodSummary {
  const adTax = ads.spend * (s.ad_tax_pct / 100)
  const adCost = ads.spend + adTax
  return {
    sales, ads, adTax, adCost,
    profitAfterAds: sales.contribution - adCost,
    mer: adCost > 0 ? sales.netSales / adCost : null,
    roasMeta: ads.spend > 0 ? ads.purchaseValue / ads.spend : null,
    cpa: ads.purchases > 0 ? adCost / ads.purchases : null,
    maxCpa: sales.orders > 0 ? sales.contribution / sales.orders : null,
    breakevenMer: sales.contribution > 0 ? sales.netSales / sales.contribution : null,
    aov: sales.orders > 0 ? sales.netSales / sales.orders : null,
    contributionMargin: sales.netSales > 0 ? sales.contribution / sales.netSales : null,
  }
}

export interface DayPoint { date: string; netSales: number; orders: number; spend: number; profit: number; contribution: number; purchases: number }

export function dailySeries(period: Period, orders: OrderRow[], ads: AdsDaily[], tz: string, idx: CostIndex, s: WorkspaceSettings): DayPoint[] {
  const map = new Map<string, DayPoint>()
  for (const d of eachDay(period.from, period.to)) map.set(d, { date: d, netSales: 0, orders: 0, spend: 0, profit: 0, contribution: 0, purchases: 0 })
  for (const o of orders) {
    if (!isSale(o)) continue
    const d = localDate(new Date(o.created_at), tz)
    const p = map.get(d)
    if (!p) continue
    const e = orderEconomics(o, tz, idx, s)
    p.netSales += e.net
    p.orders++
    p.contribution += e.contribution
  }
  for (const a of ads) {
    const p = map.get(a.date)
    if (!p) continue
    p.spend += a.spend
    p.purchases += a.purchases
  }
  map.forEach((p) => { p.profit = p.contribution - p.spend * (1 + s.ad_tax_pct / 100) })
  return Array.from(map.values())
}

/** Filtra órdenes del período anterior hasta la misma hora del día (para comparar "hoy"). */
export function clipToTimeOfDay(orders: OrderRow[], tz: string, now = new Date()): OrderRow[] {
  const limit = localMinutes(now, tz)
  return orders.filter((o) => localMinutes(new Date(o.created_at), tz) <= limit)
}

export function pctDelta(cur: number | null | undefined, prev: number | null | undefined): number | null {
  if (cur == null || prev == null || !isFinite(cur) || !isFinite(prev) || prev === 0) return null
  return (cur - prev) / Math.abs(prev)
}
