/**
 * Análisis puros (sin base de datos) para las vistas de decisión: mapa de calor, cohortes, segmentos,
 * canasta, curva de saturación, simulador, experimentos, caja proyectada y objetivos.
 * Todo recibe filas ya cargadas y devuelve números: fácil de testear.
 */
import type { OrderRow, AdsDaily, CostIndex, DayPoint } from './metrics'
import { isSale, orderEconomics } from './metrics'
import type { WorkspaceSettings } from './settings'
import { localDate, addDays, localMinutes } from './dates'

// ── Mapa de calor día × hora ────────────────────────────────────────────────
export interface HeatCell { dow: number; hour: number; orders: number; net: number }
export function heatmap(orders: OrderRow[], tz: string): { cells: HeatCell[]; max: number; best: HeatCell | null; worst: HeatCell | null } {
  const grid = new Map<string, HeatCell>()
  for (const o of orders) {
    if (!isSale(o)) continue
    const d = new Date(o.created_at)
    const dow = new Date(`${localDate(d, tz)}T12:00:00Z`).getUTCDay()
    const hour = Math.floor(localMinutes(d, tz) / 60)
    const k = `${dow}:${hour}`
    const c = grid.get(k) || { dow, hour, orders: 0, net: 0 }
    c.orders++; c.net += Math.max(0, o.total - o.shipping_customer)
    grid.set(k, c)
  }
  const cells = Array.from(grid.values())
  const max = Math.max(1, ...cells.map((c) => c.net))
  const sorted = [...cells].sort((a, b) => b.net - a.net)
  return { cells, max, best: sorted[0] || null, worst: sorted.length > 5 ? sorted[sorted.length - 1] : null }
}

// ── Cohortes de recompra ────────────────────────────────────────────────────
export interface Cohort { month: string; customers: number; back: number[] }  // back[i] = % que volvió a comprar i meses después (acumulado)
const monthOfIso = (iso: string, tz: string) => localDate(new Date(iso), tz).slice(0, 7)
const monthDiff = (a: string, b: string) => (Number(b.slice(0, 4)) - Number(a.slice(0, 4))) * 12 + (Number(b.slice(5, 7)) - Number(a.slice(5, 7)))

export function cohorts(orders: { customer_id: string | null; created_at: string; payment_status: string | null; status: string | null; cancelled_at: string | null }[], tz: string, maxMonths = 6): Cohort[] {
  const byCust = new Map<string, string[]>()
  for (const o of orders) {
    if (!o.customer_id || !isSale(o)) continue
    const l = byCust.get(o.customer_id) || []
    l.push(monthOfIso(o.created_at, tz))
    byCust.set(o.customer_id, l)
  }
  const co = new Map<string, { customers: number; back: Set<string>[] }>()
  for (const [cust, months] of Array.from(byCust)) {
    const sorted = [...months].sort()
    const first = sorted[0]
    const c = co.get(first) || { customers: 0, back: Array.from({ length: maxMonths + 1 }, () => new Set<string>()) }
    c.customers++
    for (const m of sorted.slice(1)) { const i = monthDiff(first, m); if (i >= 1 && i <= maxMonths) for (let j = i; j <= maxMonths; j++) c.back[j].add(cust) }
    co.set(first, c)
  }
  return Array.from(co.entries()).sort((a, b) => a[0].localeCompare(b[0])).map(([month, c]) => ({
    month, customers: c.customers, back: c.back.slice(1).map((s) => (c.customers ? s.size / c.customers : 0)),
  }))
}

// ── Segmentos de clientes ───────────────────────────────────────────────────
export interface Customer { id: string; email: string | null; orders: number; net: number; first: string; last: string }
export interface Segment { key: string; label: string; why: string; customers: Customer[] }

export function customerTable(orders: OrderRow[]): Customer[] {
  const m = new Map<string, Customer>()
  for (const o of orders) {
    if (!o.customer_id || !isSale(o)) continue
    const c = m.get(o.customer_id) || { id: o.customer_id, email: o.customer_email, orders: 0, net: 0, first: o.created_at, last: o.created_at }
    c.orders++; c.net += Math.max(0, o.total - o.shipping_customer)
    if (o.created_at < c.first) c.first = o.created_at
    if (o.created_at > c.last) { c.last = o.created_at; c.email = o.customer_email || c.email }
    m.set(o.customer_id, c)
  }
  return Array.from(m.values())
}

export function segments(customers: Customer[], today: string): Segment[] {
  const days = (iso: string) => (Date.parse(`${today}T12:00:00Z`) - Date.parse(iso)) / 86400000
  const vip = customers.filter((c) => c.orders >= 3)
  const once = customers.filter((c) => c.orders === 1 && days(c.last) >= 60 && days(c.last) <= 180)
  const lost = customers.filter((c) => c.orders >= 2 && days(c.last) > 120)
  const recent = customers.filter((c) => days(c.last) <= 30)
  const sortNet = (l: Customer[]) => [...l].sort((a, b) => b.net - a.net)
  return [
    { key: 'vip', label: 'Compraron 3 o más veces', why: 'Tus mejores clientes: para lanzamientos, preventas y públicos similares en Meta.', customers: sortNet(vip) },
    { key: 'once', label: 'Compraron una vez y no volvieron (60 a 180 días)', why: 'La segunda compra es la más difícil: un cupón o un recordatorio por WhatsApp suele alcanzar.', customers: sortNet(once) },
    { key: 'lost', label: 'Compraban y dejaron de comprar (más de 120 días)', why: 'Clientes que ya confiaron: una campaña de recuperación es más barata que conseguir nuevos.', customers: sortNet(lost) },
    { key: 'recent', label: 'Compraron en los últimos 30 días', why: 'Excluilos de la prospección en Meta para no gastar en quien ya compró.', customers: sortNet(recent) },
  ]
}

export function segmentCsv(list: Customer[]): string {
  const esc = (v: string | number | null) => `"${String(v ?? '').replace(/"/g, '""')}"`
  return ['email,compras,total_neto,primera_compra,ultima_compra', ...list.map((c) => [c.email, c.orders, Math.round(c.net), c.first.slice(0, 10), c.last.slice(0, 10)].map(esc).join(','))].join('\n')
}

// ── Valor a 90 días por canal de origen ─────────────────────────────────────
export interface ChannelLtv { channel: string; customers: number; first: number; ltv90: number; repeat: number }
export function ltvByChannel(orders: OrderRow[], origin: Map<string, string>, tz: string, today: string): ChannelLtv[] {
  const custFirst = new Map<string, OrderRow>()
  const sorted = [...orders].filter((o) => o.customer_id && isSale(o)).sort((a, b) => a.created_at.localeCompare(b.created_at))
  for (const o of sorted) if (!custFirst.has(o.customer_id!)) custFirst.set(o.customer_id!, o)
  const acc = new Map<string, { customers: number; first: number; ltv: number; repeat: number }>()
  const cutoff = addDays(today, -90)
  for (const [cust, f] of Array.from(custFirst)) {
    if (localDate(new Date(f.created_at), tz) > cutoff) continue   // solo clientes con 90 días de historia
    const ch = origin.get(f.order_id) || 'Sin origen'
    const a = acc.get(ch) || { customers: 0, first: 0, ltv: 0, repeat: 0 }
    const net = (o: OrderRow) => Math.max(0, o.total - o.shipping_customer)
    const until = Date.parse(f.created_at) + 90 * 86400000
    const mine = sorted.filter((o) => o.customer_id === cust && Date.parse(o.created_at) <= until)
    a.customers++; a.first += net(f); a.ltv += mine.reduce((s, o) => s + net(o), 0); if (mine.length > 1) a.repeat++
    acc.set(ch, a)
  }
  return Array.from(acc.entries()).map(([channel, a]) => ({ channel, customers: a.customers, first: a.first / a.customers, ltv90: a.ltv / a.customers, repeat: a.repeat / a.customers })).sort((a, b) => b.customers - a.customers)
}

/** Nombre del producto sin la variante: "Remera (Negro, L)" → "Remera". */
export const productName = (n: string) => n.replace(/\s*\([^)]*\)\s*$/, '').trim() || n

// ── Productos que se compran juntos ─────────────────────────────────────────
export interface Pair { a: string; b: string; together: number; share: number }  // share = % de las órdenes de A que también llevan B
export function basketPairs(orders: OrderRow[], min = 3): Pair[] {
  const count = new Map<string, number>(), pair = new Map<string, number>()
  for (const o of orders) {
    if (!isSale(o)) continue
    const names = Array.from(new Set(o.items.map((i) => productName(i.name)))).sort()
    for (const n of names) count.set(n, (count.get(n) || 0) + 1)
    for (let i = 0; i < names.length; i++) for (let j = i + 1; j < names.length; j++) { const k = `${names[i]}\u0000${names[j]}`; pair.set(k, (pair.get(k) || 0) + 1) }
  }
  const out: Pair[] = []
  for (const [k, together] of Array.from(pair)) {
    if (together < min) continue
    const [a, b] = k.split('\u0000')
    const base = Math.min(count.get(a) || 1, count.get(b) || 1)
    out.push({ a, b, together, share: together / base })
  }
  return out.sort((x, y) => y.together - x.together).slice(0, 12)
}

// ── Cobertura de stock por variante ─────────────────────────────────────────
export interface Coverage { product: string; variant: string; stock: number; perDay: number; days: number | null; suggest: number }
export function coverage(products: { id: string; name: string; variants: { id: string; name: string; stock: number | null }[] }[], orders: OrderRow[], windowDays: number, targetDays = 30): Coverage[] {
  const sold = new Map<string, number>()
  for (const o of orders) if (isSale(o)) for (const it of o.items) if (it.variant_id) sold.set(it.variant_id, (sold.get(it.variant_id) || 0) + it.qty)
  const out: Coverage[] = []
  for (const p of products) for (const v of p.variants) {
    if (v.stock == null) continue
    const perDay = (sold.get(v.id) || 0) / windowDays
    const days = perDay > 0 ? v.stock / perDay : null
    const suggest = Math.max(0, Math.ceil(perDay * targetDays - v.stock))
    if (perDay === 0 && v.stock > 0) continue
    out.push({ product: p.name, variant: v.name, stock: v.stock, perDay, days, suggest })
  }
  return out.sort((a, b) => (a.days ?? 1e9) - (b.days ?? 1e9))
}

// ── Margen por producto después de publicidad ───────────────────────────────
export interface ProductAfterAds { name: string; units: number; net: number; contribution: number; adSpend: number; afterAds: number; marginAfter: number | null }
/** Reparte la inversión del período entre productos según las ventas atribuidas a anuncios; si no hay atribución, según las ventas netas. */
export function productAfterAds(orders: OrderRow[], tz: string, idx: CostIndex, s: WorkspaceSettings, adSpendTotal: number, attributed: Set<string>): ProductAfterAds[] {
  const m = new Map<string, ProductAfterAds & { attrNet: number }>()
  let attrTotal = 0, netTotal = 0
  for (const o of orders) {
    if (!isSale(o)) continue
    const e = orderEconomics(o, tz, idx, s)
    const list = o.items.reduce((a, i) => a + i.price * i.qty, 0) || 1
    const isAttr = attributed.has(o.order_id)
    for (const it of o.items) {
      const share = (it.price * it.qty) / list
      const key = productName(it.name)
      const r = m.get(key) || { name: key, units: 0, net: 0, contribution: 0, adSpend: 0, afterAds: 0, marginAfter: null, attrNet: 0 }
      r.units += it.qty; r.net += e.net * share; r.contribution += e.contribution * share
      if (isAttr) { r.attrNet += e.net * share; attrTotal += e.net * share }
      netTotal += e.net * share
      m.set(key, r)
    }
  }
  const useAttr = attrTotal > 0
  return Array.from(m.values()).map((r) => {
    const w = useAttr ? r.attrNet / attrTotal : netTotal ? r.net / netTotal : 0
    const adSpend = adSpendTotal * w
    const afterAds = r.contribution - adSpend
    return { name: r.name, units: r.units, net: r.net, contribution: r.contribution, adSpend, afterAds, marginAfter: r.net > 0 ? afterAds / r.net : null }
  }).sort((a, b) => b.afterAds - a.afterAds)
}

// ── Curva de saturación y simulador ─────────────────────────────────────────
export interface SatPoint { spend: number; cpa: number; purchases: number; n: number }
export interface Saturation { points: SatPoint[]; bins: SatPoint[]; knee: number | null; maxUseful: number | null }
/** Días con gasto: a medida que sube el gasto diario, ¿cómo se mueve el costo por compra? Agrupa en 6 niveles de gasto. */
export function saturation(days: AdsDaily[], maxCpa: number | null): Saturation {
  const pts = days.filter((d) => d.spend > 0 && d.purchases > 0).map((d) => ({ spend: d.spend, cpa: d.spend / d.purchases, purchases: d.purchases, n: 1 }))
  if (pts.length < 8) return { points: pts, bins: [], knee: null, maxUseful: null }
  const sorted = [...pts].sort((a, b) => a.spend - b.spend)
  const k = 6, size = Math.ceil(sorted.length / k)
  const bins: SatPoint[] = []
  for (let i = 0; i < sorted.length; i += size) {
    const g = sorted.slice(i, i + size)
    const spend = g.reduce((a, p) => a + p.spend, 0), purchases = g.reduce((a, p) => a + p.purchases, 0)
    bins.push({ spend: spend / g.length, cpa: spend / purchases, purchases: purchases / g.length, n: g.length })
  }
  // Rodilla: primer nivel a partir del cual todos los niveles siguientes quedan 15% arriba del mejor costo por compra visto hasta ahí
  let knee: number | null = null
  for (let i = 1; i < bins.length; i++) {
    const bestBefore = Math.min(...bins.slice(0, i).map((b) => b.cpa))
    const worstAfter = Math.min(...bins.slice(i).map((b) => b.cpa))
    if (worstAfter > bestBefore * 1.15) { knee = bins[i - 1].spend; break }
  }
  const under = maxCpa ? bins.filter((b) => b.cpa <= maxCpa) : bins
  return { points: pts, bins, knee, maxUseful: under.length ? under[under.length - 1].spend : null }
}

export interface SimResult { spend: number; purchases: number; cpa: number; profit: number; delta: { spend: number; purchases: number; profit: number } }
/** Qué pasa con compras y ganancia si cambio el gasto diario un %. Usa la elasticidad observada entre niveles de gasto. */
export function simulate(bins: SatPoint[], current: { spend: number; purchases: number }, pct: number, contributionPerOrder: number, adTaxPct: number): SimResult | null {
  if (bins.length < 2 || current.spend <= 0) return null
  const target = current.spend * (1 + pct / 100)
  // elasticidad local: log(compras)/log(gasto) entre los dos niveles que rodean al gasto actual
  const i = Math.max(1, Math.min(bins.length - 1, bins.findIndex((b) => b.spend >= current.spend) === -1 ? bins.length - 1 : bins.findIndex((b) => b.spend >= current.spend)))
  const a = bins[i - 1], b = bins[i]
  const el = a.spend > 0 && b.spend > a.spend && a.purchases > 0 ? Math.log(b.purchases / a.purchases) / Math.log(b.spend / a.spend) : 0.7
  const elasticity = Math.max(0.1, Math.min(1, el))
  const purchases = current.purchases * Math.pow(target / current.spend, elasticity)
  const cost = (sp: number) => sp * (1 + adTaxPct / 100)
  const profit = purchases * contributionPerOrder - cost(target)
  const profitNow = current.purchases * contributionPerOrder - cost(current.spend)
  return { spend: target, purchases, cpa: purchases > 0 ? target / purchases : Infinity, profit, delta: { spend: target - current.spend, purchases: purchases - current.purchases, profit: profit - profitNow } }
}

// ── Experimentos y promos: antes / durante / después ────────────────────────
export interface WindowStats { days: number; net: number; orders: number; spend: number; purchases: number; cpa: number | null; profit: number }
export function windowStats(series: DayPoint[], from: string, to: string): WindowStats {
  const w = series.filter((d) => d.date >= from && d.date <= to)
  const net = w.reduce((a, d) => a + d.netSales, 0), orders = w.reduce((a, d) => a + d.orders, 0), spend = w.reduce((a, d) => a + d.spend, 0), purchases = w.reduce((a, d) => a + d.purchases, 0), profit = w.reduce((a, d) => a + d.profit, 0)
  return { days: w.length, net, orders, spend, purchases, cpa: purchases > 0 ? spend / purchases : null, profit }
}
export function beforeDuringAfter(series: DayPoint[], from: string, to: string, today: string) {
  const len = Math.max(1, Math.round((Date.parse(to) - Date.parse(from)) / 86400000) + 1)
  const before = windowStats(series, addDays(from, -len), addDays(from, -1))
  const during = windowStats(series, from, to)
  const afterTo = addDays(to, len) < today ? addDays(to, len) : addDays(today, -1)
  const after = to < today ? windowStats(series, addDays(to, 1), afterTo) : null
  return { before, during, after }
}

// ── Caja proyectada ─────────────────────────────────────────────────────────
export interface CashWeek { week: string; amount: number; orders: number }
/** Cuándo se acredita lo vendido, según los días de acreditación de cada medio de pago. */
export function cashForecast(orders: OrderRow[], s: WorkspaceSettings, accredit: Record<string, number>, today: string, weeks = 6): CashWeek[] {
  const out = new Map<string, CashWeek>()
  const monday = (d: string) => { const x = new Date(`${d}T12:00:00Z`); const dow = (x.getUTCDay() + 6) % 7; x.setUTCDate(x.getUTCDate() - dow); return x.toISOString().slice(0, 10) }
  const end = addDays(today, weeks * 7)
  for (const o of orders) {
    if (!isSale(o)) continue
    const method = (o.payment_method || '*').toLowerCase()
    const days = accredit[method] ?? accredit['*'] ?? 0
    const fee = o.total * (( s.payment_fees.find((f) => f.method === method) || s.payment_fees.find((f) => f.method === '*'))?.pct || 0) / 100
    const when = addDays(o.created_at.slice(0, 10), days)
    if (when < today || when > end) continue
    const w = monday(when)
    const c = out.get(w) || { week: w, amount: 0, orders: 0 }
    c.amount += o.total - fee; c.orders++
    out.set(w, c)
  }
  return Array.from(out.values()).sort((a, b) => a.week.localeCompare(b.week))
}

// ── Objetivos del mes ───────────────────────────────────────────────────────
export interface Goal { metric: 'net_sales' | 'orders' | 'profit' | 'cpa' | 'margin'; target: number }
export const GOAL_LABEL: Record<Goal['metric'], { label: string; better: 'up' | 'down'; kind: 'money' | 'int' | 'pct' }> = {
  net_sales: { label: 'Ventas netas', better: 'up', kind: 'money' }, orders: { label: 'Órdenes', better: 'up', kind: 'int' }, profit: { label: 'Ganancia después de publicidad', better: 'up', kind: 'money' },
  cpa: { label: 'Costo por compra', better: 'down', kind: 'money' }, margin: { label: 'Margen de contribución', better: 'up', kind: 'pct' },
}
export function goalProgress(g: Goal, actual: number, dayShare: number): { pace: number; status: 'ok' | 'warn' | 'bad'; expected: number } {
  const info = GOAL_LABEL[g.metric]
  const cumulative = g.metric === 'net_sales' || g.metric === 'orders' || g.metric === 'profit'
  const expected = cumulative ? g.target * dayShare : g.target
  const pace = cumulative ? (dayShare > 0 ? actual / dayShare / g.target : 0) : info.better === 'down' ? (actual > 0 ? g.target / actual : 1) : (g.target > 0 ? actual / g.target : 0)
  return { pace, expected, status: pace >= 0.97 ? 'ok' : pace >= 0.85 ? 'warn' : 'bad' }
}
