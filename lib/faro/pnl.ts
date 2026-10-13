import { svc } from './db'
import { WorkspaceSettings } from './settings'
import { loadOrders, loadCostIndex, summarizeSales, loadAdsDaily, summarizeAds, SalesSummary, AdsSummary, OrderRow } from './metrics'
import { localDate, monthRange } from './dates'

export interface PnL {
  month: string
  closed: boolean
  sales: SalesSummary
  ads: AdsSummary
  adTax: number
  fixed: { name: string; category: string; amount: number }[]
  extra: { description: string; category: string; amount: number }[]
  fixedTotal: number
  extraTotal: number
  contribution: number
  profitAfterAds: number
  operatingResult: number
  breakEvenSales: number | null   // ventas netas necesarias para cubrir fijos + extras
}

interface Ctx { workspaceId: string; tz: string; settings: WorkspaceSettings; storeIds: string[]; accountIds: string[] }

export async function loadPnL(ctx: Ctx, months: string[]): Promise<PnL[]> {
  if (!months.length) return []
  const sorted = [...months].sort()
  const from = monthRange(sorted[0]).from
  const to = monthRange(sorted[sorted.length - 1]).to
  const sb = svc()
  const [orders, idx, adsDaily, fixedRes, extraRes, closedRes] = await Promise.all([
    loadOrders(ctx.storeIds, from, to, ctx.tz),
    loadCostIndex(ctx.storeIds),
    loadAdsDaily(ctx.accountIds, from, to),
    sb.from('fixed_costs').select('name,category,amount,valid_from,valid_to').eq('workspace_id', ctx.workspaceId),
    sb.from('extra_costs').select('month,category,description,amount').eq('workspace_id', ctx.workspaceId).in('month', months),
    sb.from('closed_periods').select('month,pnl').eq('workspace_id', ctx.workspaceId).in('month', months),
  ])
  const closed = new Map<string, PnL>((closedRes.data || []).map((c: { month: string; pnl: PnL }) => [c.month, { ...c.pnl, closed: true }]))

  const byMonth = new Map<string, OrderRow[]>()
  for (const o of orders) {
    const m = localDate(new Date(o.created_at), ctx.tz).slice(0, 7)
    const l = byMonth.get(m) || []
    l.push(o)
    byMonth.set(m, l)
  }

  return months.map((month) => {
    const c = closed.get(month)
    if (c) return c
    const { from: mf, to: mt } = monthRange(month)
    const sales = summarizeSales(byMonth.get(month) || [], ctx.tz, idx, ctx.settings)
    const ads = summarizeAds(adsDaily.filter((d) => d.date >= mf && d.date <= mt))
    const adTax = ads.spend * (ctx.settings.ad_tax_pct / 100)
    const fixed = (fixedRes.data || [])
      .filter((f: { valid_from: string; valid_to: string | null }) => f.valid_from <= mt && (!f.valid_to || f.valid_to >= mf))
      .map((f: { name: string; category: string; amount: number }) => ({ name: f.name, category: f.category, amount: Number(f.amount) }))
    const extra = (extraRes.data || []).filter((e: { month: string }) => e.month === month)
      .map((e: { description: string; category: string; amount: number }) => ({ description: e.description, category: e.category, amount: Number(e.amount) }))
    const fixedTotal = fixed.reduce((s, f) => s + f.amount, 0)
    const extraTotal = extra.reduce((s, e) => s + e.amount, 0)
    const profitAfterAds = sales.contribution - ads.spend - adTax
    const cm = sales.netSales > 0 ? sales.contribution / sales.netSales : 0
    const adShare = sales.netSales > 0 ? (ads.spend + adTax) / sales.netSales : 0
    const marginAfterAds = cm - adShare
    return {
      month, closed: false, sales, ads, adTax, fixed, extra, fixedTotal, extraTotal,
      contribution: sales.contribution, profitAfterAds,
      operatingResult: profitAfterAds - fixedTotal - extraTotal,
      breakEvenSales: marginAfterAds > 0 ? (fixedTotal + extraTotal) / marginAfterAds : null,
    }
  })
}

/** Copia del resultado con todos los montos multiplicados (inflación o dólar). Cantidades y porcentajes no cambian. */
export function scalePnL(p: PnL, f: number): PnL {
  if (f === 1) return p
  const s = p.sales
  const k = (v: number) => v * f
  return {
    ...p,
    sales: {
      ...s, productsGross: k(s.productsGross), discounts: k(s.discounts), netSales: k(s.netSales), shippingCustomer: k(s.shippingCustomer),
      shippingOwner: k(s.shippingOwner), cogs: k(s.cogs), platformFee: k(s.platformFee), paymentFees: k(s.paymentFees), packaging: k(s.packaging),
      iibb: k(s.iibb), contribution: k(s.contribution),
    },
    ads: { ...p.ads, spend: k(p.ads.spend), purchaseValue: k(p.ads.purchaseValue) },
    adTax: k(p.adTax),
    fixed: p.fixed.map((x) => ({ ...x, amount: k(x.amount) })),
    extra: p.extra.map((x) => ({ ...x, amount: k(x.amount) })),
    fixedTotal: k(p.fixedTotal), extraTotal: k(p.extraTotal), contribution: k(p.contribution),
    profitAfterAds: k(p.profitAfterAds), operatingResult: k(p.operatingResult),
    breakEvenSales: p.breakEvenSales == null ? null : k(p.breakEvenSales),
  }
}
