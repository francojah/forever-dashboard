import { unstable_cache } from 'next/cache'
import { svc } from './db'
import { addDays } from './dates'
import { fetchProducts, StoreRow, TNProduct } from './tiendanube'
import { flatten, TreeNode } from './adsTree'
import { OrderRow, isSale } from './metrics'

export interface SuggestedAction {
  id: string
  kind: 'pause' | 'budget_down' | 'budget_up' | 'rotate' | 'restock' | 'review'
  title: string
  reason: string
  impact: number              // para ordenar (ARS en juego)
  target?: { accountId: string; level: 'adset' | 'campaign' | 'ad'; id: string; name: string; field?: 'status' | 'daily_budget'; value?: unknown; current?: unknown }
  href?: string
  protected?: boolean
}

const TRAFFIC_GOALS = new Set(['LINK_CLICKS', 'LANDING_PAGE_VIEWS', 'REACH', 'IMPRESSIONS', 'POST_ENGAGEMENT', 'THRUPLAY', 'PROFILE_VISIT', 'VISIT_INSTAGRAM_PROFILE', 'AD_RECALL_LIFT', 'TWO_SECOND_CONTINUOUS_VIDEO_VIEWS'])

export const getCachedProducts = (store: StoreRow) =>
  unstable_cache(async () => fetchProducts(store), ['tn-products', store.id], { revalidate: 1800 })()

export function isConversionAdset(n: TreeNode) {
  return n.level === 'adset' && !TRAFFIC_GOALS.has(n.optimizationGoal || '')
}

/** Presupuesto efectivo (del ad set o, si es CBO, de la campaña). */
export function budgetOf(n: TreeNode, campaigns: Map<string, TreeNode>): { owner: TreeNode; daily: number } | null {
  if (n.dailyBudget) return { owner: n, daily: n.dailyBudget }
  const c = n.campaignId ? campaigns.get(n.campaignId) : undefined
  if (c?.dailyBudget) return { owner: c, daily: c.dailyBudget }
  return null
}

const fmt = (v: number) => '$ ' + Math.round(v).toLocaleString('es-AR')

export async function suggestActions(args: {
  accountIds: string[]
  tree7d: TreeNode[]
  today: string
  maxCpa: number | null
  stores: StoreRow[]
  orders14d: OrderRow[]
  tz: string
}): Promise<SuggestedAction[]> {
  const out: SuggestedAction[] = []
  const all = flatten(args.tree7d)
  const campaigns = new Map(all.filter((n) => n.level === 'campaign').map((n) => [n.id, n]))
  const activeAdsets = all.filter((n) => isConversionAdset(n) && n.effectiveStatus === 'ACTIVE')

  // ── Costo por compra sobre el máximo 3 días seguidos ─────────────────────
  if (args.maxCpa && args.maxCpa > 0 && args.accountIds.length) {
    const from = addDays(args.today, -3)
    const to = addDays(args.today, -1)
    const { data } = await svc().rpc('faro_ads_adset_daily', { p_accounts: args.accountIds, p_from: from, p_to: to })
    const byAdset = new Map<string, { spend: number; purchases: number }[]>()
    for (const r of (data || []) as { adset_id: string; spend: number; purchases: number }[]) {
      const l = byAdset.get(String(r.adset_id)) || []
      l.push({ spend: Number(r.spend) || 0, purchases: Number(r.purchases) || 0 })
      byAdset.set(String(r.adset_id), l)
    }
    for (const s of activeAdsets) {
      const days = byAdset.get(s.id) || []
      if (days.length < 3) continue
      const bad = days.every((d) => d.spend > 0 && (d.purchases > 0 ? d.spend / d.purchases : Infinity) > args.maxCpa!)
      if (!bad) continue
      const spend = days.reduce((a, d) => a + d.spend, 0)
      const purchases = days.reduce((a, d) => a + d.purchases, 0)
      const cpa = purchases > 0 ? spend / purchases : null
      const reason = `Costo por compra ${cpa ? fmt(cpa) : 'sin compras'} contra un máximo de ${fmt(args.maxCpa)} los últimos 3 días (${fmt(spend)} gastados).`
      if (s.protected) {
        out.push({ id: `review-${s.id}`, kind: 'review', title: `Revisar creativos de ${s.name}`, reason: `${reason} Está protegido: no se propone pausar ni tocar presupuesto.`, impact: spend, href: `/anuncios?focus=${s.id}`, protected: true })
        continue
      }
      const b = budgetOf(s, campaigns)
      const severe = cpa == null || cpa > args.maxCpa * 1.5
      if (severe || !b) {
        out.push({ id: `pause-${s.id}`, kind: 'pause', title: `Pausar ${s.name}`, reason, impact: spend,
          target: { accountId: s.accountId, level: 'adset', id: s.id, name: s.name, field: 'status', value: 'PAUSED', current: s.status } })
      } else {
        const next = Math.round(b.daily * 0.8)
        out.push({ id: `down-${s.id}`, kind: 'budget_down', title: `Bajar 20% el presupuesto de ${b.owner.name}`, reason: `${reason} De ${fmt(b.daily)} a ${fmt(next)} por día.`, impact: spend,
          target: { accountId: s.accountId, level: b.owner.level as 'adset' | 'campaign', id: b.owner.id, name: b.owner.name, field: 'daily_budget', value: next, current: b.daily } })
      }
    }
  }

  // ── Stock para menos de 7 días ───────────────────────────────────────────
  if (args.stores.length) {
    const sold = new Map<string, { units: number; name: string }>()
    for (const o of args.orders14d) {
      if (!isSale(o)) continue
      for (const it of o.items) {
        if (!it.variant_id) continue
        const k = `${o.store_id}|${it.variant_id}`
        const cur = sold.get(k) || { units: 0, name: it.name }
        cur.units += it.qty || 1
        sold.set(k, cur)
      }
    }
    for (const st of args.stores) {
      let products: TNProduct[] = []
      try { products = await getCachedProducts(st) } catch { continue }
      for (const p of products) {
        for (const v of p.variants) {
          if (v.stock == null) continue
          const s = sold.get(`${st.id}|${v.id}`)
          if (!s || s.units < 3) continue
          const perDay = s.units / 14
          const daysLeft = v.stock / perDay
          if (daysLeft < 7) {
            out.push({
              id: `stock-${v.id}`, kind: 'restock', title: `Reponer ${s.name}`,
              reason: v.stock <= 0 ? `Sin stock. Vendía ${perDay.toFixed(1)} por día.` : `Quedan ${v.stock} unidades: alcanzan para ~${Math.max(1, Math.floor(daysLeft))} días al ritmo de las últimas 2 semanas.`,
              impact: perDay * 7 * (v.price || 0), href: '/ventas?tab=productos',
            })
          }
        }
      }
    }
  }

  // ── Escalar lo que funciona ───────────────────────────────────────────────
  if (args.maxCpa && args.maxCpa > 0) {
    for (const s of activeAdsets) {
      if (s.m.purchases < 5) continue
      const cpa = s.m.spend / s.m.purchases
      if (cpa > args.maxCpa * 0.6) continue
      const b = budgetOf(s, campaigns)
      if (!b) continue
      const next = Math.round(b.daily * 1.15)
      out.push({
        id: `up-${b.owner.id}`, kind: 'budget_up', title: `Subir 15% el presupuesto de ${b.owner.name}`,
        reason: `Costo por compra de ${fmt(cpa)} en 7 días, ${Math.round((1 - cpa / args.maxCpa) * 100)}% por debajo del máximo. Un aumento chico no reinicia el aprendizaje.`,
        impact: s.m.spend * 0.15, protected: b.owner.protected,
        target: { accountId: s.accountId, level: b.owner.level as 'adset' | 'campaign', id: b.owner.id, name: b.owner.name, field: 'daily_budget', value: next, current: b.daily },
      })
    }
  }

  // Dedupe por objetivo y orden por impacto
  const seen = new Set<string>()
  const order: Record<SuggestedAction['kind'], number> = { pause: 0, budget_down: 1, review: 1, restock: 2, budget_up: 3, rotate: 4 }
  return out
    .filter((a) => { const k = a.target ? `${a.target.id}` : a.id; if (seen.has(k)) return false; seen.add(k); return true })
    .sort((a, b) => order[a.kind] - order[b.kind] || b.impact - a.impact)
}
