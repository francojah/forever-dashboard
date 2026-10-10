import { svc } from './db'
import type { FaroContext } from './context'
import { loadOrders, loadCostIndex, summarizeSales, loadAdsDaily, summarizeAds } from './metrics'
import { addDays, localDate } from './dates'

export interface UnitEconomics {
  days: number
  orders: number
  netSales: number
  shipping: number
  aov: number | null                 // ventas netas por orden
  contribution: number               // antes de publicidad
  contributionPerOrder: number | null
  contributionPct: number | null     // sobre ventas netas
  adSpend: number                    // con impuestos no recuperables
  adTaxPct: number
  fixedMonthly: number
  fixedItems: { name: string; amount: number }[]
  maxCpa: number | null              // contribución por orden ÷ (1 + impuestos de la pauta)
  breakevenMer: number | null
}

/** Costos fijos vigentes hoy (por mes). */
export async function loadFixedMonthly(workspaceId: string, ymd: string): Promise<{ total: number; items: { name: string; amount: number }[] }> {
  const { data } = await svc().from('fixed_costs').select('name,amount,valid_from,valid_to').eq('workspace_id', workspaceId)
  const items = ((data || []) as { name: string; amount: number; valid_from: string; valid_to: string | null }[])
    .filter((f) => f.valid_from <= ymd && (!f.valid_to || f.valid_to >= ymd))
    .map((f) => ({ name: f.name, amount: Number(f.amount) || 0 }))
  return { total: items.reduce((a, f) => a + f.amount, 0), items }
}

/** Números por orden de los últimos N días: la base del punto de equilibrio y del costo por compra máximo. */
export async function loadUnitEconomics(ctx: FaroContext, days = 30): Promise<UnitEconomics> {
  const tz = ctx.workspace.timezone
  const s = ctx.workspace.settings
  const today = localDate(new Date(), tz)
  const from = addDays(today, -days)
  const to = addDays(today, -1)
  const storeIds = ctx.stores.filter((x) => x.active).map((x) => x.id)
  const accountIds = ctx.adAccounts.filter((a) => a.active).map((a) => a.id)
  const [orders, idx, ads, fixed] = await Promise.all([
    loadOrders(storeIds, from, to, tz),
    loadCostIndex(storeIds),
    loadAdsDaily(accountIds, from, to),
    loadFixedMonthly(ctx.workspace.id, today),
  ])
  const sales = summarizeSales(orders, tz, idx, s)
  const adsSum = summarizeAds(ads)
  const taxK = 1 + s.ad_tax_pct / 100
  const cpo = sales.orders > 0 ? sales.contribution / sales.orders : null
  const cPct = sales.netSales > 0 ? sales.contribution / sales.netSales : null
  return {
    days, orders: sales.orders, netSales: sales.netSales, shipping: sales.shippingCustomer,
    aov: sales.orders > 0 ? sales.netSales / sales.orders : null,
    contribution: sales.contribution, contributionPerOrder: cpo, contributionPct: cPct,
    adSpend: adsSum.spend * taxK, adTaxPct: s.ad_tax_pct,
    fixedMonthly: fixed.total, fixedItems: fixed.items,
    maxCpa: cpo != null ? cpo / taxK : null,
    breakevenMer: cPct && cPct > 0 ? 1 / cPct : null,
  }
}
