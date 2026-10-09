import type { FaroContext } from './context'
import { Period, previousPeriod, addDays, localDate, resolvePeriod } from './dates'
import {
  loadOrders, loadCostIndex, summarizeSales, loadAdsDaily, summarizeAds, buildSummary, dailySeries,
  clipToTimeOfDay, OrderRow, PeriodSummary, DayPoint, orderEconomics, isSale, CostIndex,
} from './metrics'
import { loadAdsTree, TreeNode } from './adsTree'
import { suggestActions, SuggestedAction } from './actions'
import type { WorkspaceSettings } from './settings'

export interface ProductRow { id: string; name: string; units: number; netSales: number; cogs: number; margin: number | null }

export interface HomeData {
  period: Period
  prev: Period
  cur: PeriodSummary
  before: PeriodSummary
  series: DayPoint[]
  seriesLabel: string
  campaigns: TreeNode[]
  products: ProductRow[]
  actions: SuggestedAction[]
  maxCpaRef: number | null
  hasStores: boolean
  hasAds: boolean
}

export function productTable(orders: OrderRow[], tz: string, idx: CostIndex, s: WorkspaceSettings): ProductRow[] {
  const map = new Map<string, ProductRow>()
  for (const o of orders) {
    if (!isSale(o)) continue
    const e = orderEconomics(o, tz, idx, s)
    const listTotal = o.items.reduce((a, i) => a + i.price * i.qty, 0)
    for (const it of o.items) {
      const key = it.product_id || it.name
      const share = listTotal > 0 ? (it.price * it.qty) / listTotal : 0
      const row = map.get(key) || { id: key, name: it.name.replace(/\s*\([^)]*\)\s*$/, ''), units: 0, netSales: 0, cogs: 0, margin: null }
      row.units += it.qty
      row.netSales += e.net * share
      row.cogs += listTotal > 0 ? e.cogs * share : 0
      map.set(key, row)
    }
  }
  return Array.from(map.values())
    .map((r) => ({ ...r, margin: r.netSales > 0 ? (r.netSales - r.cogs) / r.netSales : null }))
    .sort((a, b) => b.netSales - a.netSales)
}

export async function loadHome(ctx: FaroContext, period: Period): Promise<HomeData> {
  const tz = ctx.workspace.timezone
  const s = ctx.workspace.settings
  const storeIds = ctx.stores.filter((x) => x.active).map((x) => x.id)
  const accounts = ctx.adAccounts.filter((a) => a.active)
  const accountIds = accounts.map((a) => a.id)
  const prev = previousPeriod(period)
  const today = localDate(new Date(), tz)

  const chartPeriod = period.days >= 7 ? period : resolvePeriod('custom', tz, new Date(), { from: addDays(period.to, -13), to: period.to })
  const loadFrom = [prev.from, chartPeriod.from, addDays(today, -13)].sort()[0]
  const [orders, idx, ads] = await Promise.all([
    loadOrders(storeIds, loadFrom, period.to > today ? period.to : today, tz),
    loadCostIndex(storeIds),
    loadAdsDaily(accountIds, loadFrom, period.to > today ? period.to : today),
  ])

  const inRange = (o: OrderRow, p: Period) => { const d = localDate(new Date(o.created_at), tz); return d >= p.from && d <= p.to }
  const curOrders = orders.filter((o) => inRange(o, period))
  let prevOrders = orders.filter((o) => inRange(o, prev))
  let adsScale = 1
  if (period.key === 'today') {
    prevOrders = clipToTimeOfDay(prevOrders, tz)
    adsScale = period.partialDayFraction ?? 1
  }
  const cur = buildSummary(summarizeSales(curOrders, tz, idx, s), summarizeAds(ads.filter((a) => a.date >= period.from && a.date <= period.to)), s)
  const before = buildSummary(summarizeSales(prevOrders, tz, idx, s), summarizeAds(ads.filter((a) => a.date >= prev.from && a.date <= prev.to), adsScale), s)

  // Máximo costo por compra de referencia: ganancia por orden de los últimos 14 días (más estable que la de hoy)
  const ref14 = orders.filter((o) => { const d = localDate(new Date(o.created_at), tz); return d >= addDays(today, -13) && d <= today })
  const refSales = summarizeSales(ref14, tz, idx, s)
  // En términos de gasto de Meta (sin impuestos), para comparar contra spend ÷ compras
  const maxCpaRef = refSales.orders > 0 ? refSales.contribution / refSales.orders / (1 + s.ad_tax_pct / 100) : null

  const [tree, tree7] = await Promise.all([
    loadAdsTree(accounts, period.from, period.to),
    period.key === '7d' ? Promise.resolve(null) : loadAdsTree(accounts, addDays(today, -6), today),
  ])
  const actions = await suggestActions({
    accountIds, tree7d: tree7 || tree, today, maxCpa: maxCpaRef, stores: ctx.stores.filter((x) => x.active), orders14d: ref14, tz,
  }).catch(() => [])

  return {
    period, prev, cur, before,
    series: dailySeries(chartPeriod, orders.filter((o) => inRange(o, chartPeriod)), ads.filter((a) => a.date >= chartPeriod.from && a.date <= chartPeriod.to), tz, idx, s),
    seriesLabel: chartPeriod === period ? period.label : 'Últimos 14 días',
    campaigns: tree,
    products: productTable(curOrders, tz, idx, s),
    actions,
    maxCpaRef,
    hasStores: storeIds.length > 0,
    hasAds: accountIds.length > 0,
  }
}
