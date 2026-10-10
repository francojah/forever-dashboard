import { svc, fetchAll } from './db'
import { graphGet, getMetaToken } from './meta'

export interface Metrics {
  spend: number
  impressions: number
  reach: number
  linkClicks: number
  lpv: number
  atc: number
  ic: number
  purchases: number
  purchaseValue: number
  video3s: number
  videoP50: number
}

export interface TreeNode {
  id: string
  accountId: string        // uuid de ad_accounts
  accountExternal: string  // act_...
  level: 'campaign' | 'adset' | 'ad'
  name: string
  status: string | null
  effectiveStatus: string | null
  objective: string | null
  optimizationGoal: string | null
  dailyBudget: number | null
  lifetimeBudget: number | null
  budgetOwner: 'campaign' | 'adset' | null
  parentId: string | null
  campaignId: string | null
  thumbnail: string | null
  image: string | null
  isVideo: boolean
  copy: { body: string | null; title: string | null } | null
  targeting: Record<string, unknown> | null
  frequency: number | null
  m: Metrics
  children: TreeNode[]
  protected: boolean
}

const zero = (): Metrics => ({ spend: 0, impressions: 0, reach: 0, linkClicks: 0, lpv: 0, atc: 0, ic: 0, purchases: 0, purchaseValue: 0, video3s: 0, videoP50: 0 })
const addM = (a: Metrics, b: Metrics) => { (Object.keys(a) as (keyof Metrics)[]).forEach((k) => { a[k] += b[k] }) }

interface EntityRow {
  ad_account_id: string; entity_id: string; level: 'campaign' | 'adset' | 'ad'; parent_id: string | null; campaign_id: string | null
  name: string; status: string | null; effective_status: string | null; objective: string | null; optimization_goal: string | null
  daily_budget: number | null; lifetime_budget: number | null; targeting: Record<string, unknown> | null
  creative: { thumbnail_url?: string; image_url?: string; video_id?: string; object_type?: string; body?: string; title?: string } | null
}

export async function loadAdsTree(
  accounts: { id: string; external_id: string; protected_ids: string[] }[],
  from: string, to: string,
  opts: { includeInactive?: boolean } = {},
): Promise<TreeNode[]> {
  if (!accounts.length) return []
  const ids = accounts.map((a) => a.id)
  const [entities, metricsRes] = await Promise.all([
    fetchAll<EntityRow>((a, b) => svc().from('ad_entities')
      .select('ad_account_id,entity_id,level,parent_id,campaign_id,name,status,effective_status,objective,optimization_goal,daily_budget,lifetime_budget,targeting,creative')
      .in('ad_account_id', ids).range(a, b)),
    svc().rpc('faro_ads_by_ad', { p_accounts: ids, p_from: from, p_to: to }),
  ])
  if (metricsRes.error) throw new Error(metricsRes.error.message)
  const accById = new Map(accounts.map((a) => [a.id, a]))
  const metricsByAd = new Map<string, Metrics>()
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  for (const r of (metricsRes.data || []) as any[]) {
    metricsByAd.set(String(r.ad_id), {
      spend: Number(r.spend) || 0, impressions: Number(r.impressions) || 0, reach: Number(r.reach) || 0,
      linkClicks: Number(r.link_clicks) || 0, lpv: Number(r.lpv) || 0, atc: Number(r.atc) || 0, ic: Number(r.ic) || 0,
      purchases: Number(r.purchases) || 0, purchaseValue: Number(r.purchase_value) || 0, video3s: Number(r.video_3s) || 0, videoP50: Number(r.video_p50) || 0,
    })
  }

  const nodes = new Map<string, TreeNode>()
  const mk = (e: EntityRow): TreeNode => {
    const acc = accById.get(e.ad_account_id)!
    return {
      id: e.entity_id, accountId: e.ad_account_id, accountExternal: acc.external_id, level: e.level, name: e.name,
      status: e.status, effectiveStatus: e.effective_status, objective: e.objective, optimizationGoal: e.optimization_goal,
      dailyBudget: e.daily_budget != null ? Number(e.daily_budget) : null, lifetimeBudget: e.lifetime_budget != null ? Number(e.lifetime_budget) : null,
      budgetOwner: null, parentId: e.parent_id, campaignId: e.campaign_id,
      thumbnail: e.creative?.thumbnail_url || e.creative?.image_url || null,
      image: e.creative?.image_url || e.creative?.thumbnail_url || null,
      isVideo: !!e.creative?.video_id || e.creative?.object_type === 'VIDEO',
      copy: e.creative ? { body: e.creative.body || null, title: e.creative.title || null } : null,
      targeting: e.targeting, frequency: null, m: zero(), children: [],
      protected: (acc.protected_ids || []).includes(e.entity_id) || (!!e.campaign_id && (acc.protected_ids || []).includes(e.campaign_id)),
    }
  }
  for (const e of entities) nodes.set(e.entity_id, mk(e))

  // Métricas de anuncios que ya no existen localmente (archivados) → se suman igual al padre si existe
  for (const [adId, m] of Array.from(metricsByAd.entries())) {
    const n = nodes.get(adId)
    if (n) addM(n.m, m)
  }
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const orphan = ((metricsRes.data || []) as any[]).filter((r) => !nodes.has(String(r.ad_id)))

  const ads = Array.from(nodes.values()).filter((n) => n.level === 'ad')
  const adsets = Array.from(nodes.values()).filter((n) => n.level === 'adset')
  const campaigns = Array.from(nodes.values()).filter((n) => n.level === 'campaign')

  for (const ad of ads) {
    const p = ad.parentId ? nodes.get(ad.parentId) : undefined
    if (p) { p.children.push(ad); addM(p.m, ad.m) }
  }
  for (const r of orphan) {
    const m = metricsByAd.get(String(r.ad_id))!
    const adset = r.adset_id ? nodes.get(String(r.adset_id)) : undefined
    if (adset) addM(adset.m, m)
    else {
      const camp = r.campaign_id ? nodes.get(String(r.campaign_id)) : undefined
      if (camp) addM(camp.m, m)
    }
  }
  for (const s of adsets) {
    const c = s.parentId ? nodes.get(s.parentId) : undefined
    if (c) { c.children.push(s); addM(c.m, s.m) }
    s.budgetOwner = s.dailyBudget != null || s.lifetimeBudget != null ? 'adset' : null
  }
  for (const c of campaigns) {
    c.budgetOwner = c.dailyBudget != null || c.lifetimeBudget != null ? 'campaign' : null
    // Campañas sin ad sets locales pero con gasto de anuncios huérfanos ya sumado arriba
  }

  const keep = (n: TreeNode): boolean => opts.includeInactive || n.m.spend > 0 || n.effectiveStatus === 'ACTIVE'
  const prune = (list: TreeNode[]): TreeNode[] => list
    .filter(keep)
    .map((n) => ({ ...n, children: prune(n.children) }))
    .sort((a, b) => b.m.spend - a.m.spend || a.name.localeCompare(b.name))
  return prune(campaigns)
}

/** Frecuencia real del período por ad set (Meta deduplica el alcance; no se puede sumar por día). */
export async function loadFrequency(
  accounts: { id: string; external_id: string; connection_id: string | null }[], from: string, to: string,
): Promise<Map<string, number>> {
  const out = new Map<string, number>()
  await Promise.all(accounts.map(async (a) => {
    try {
      const token = await getMetaToken(a.connection_id)
      const res = await graphGet<{ data?: { adset_id: string; campaign_id: string; frequency: string }[] }>(`${a.external_id}/insights`, token, {
        level: 'adset', fields: 'adset_id,campaign_id,frequency', time_range: JSON.stringify({ since: from, until: to }), limit: '500',
      })
      for (const r of res.data || []) out.set(String(r.adset_id), parseFloat(r.frequency) || 0)
    } catch { /* sin frecuencia */ }
  }))
  return out
}

export function flatten(tree: TreeNode[]): TreeNode[] {
  const out: TreeNode[] = []
  const walk = (l: TreeNode[]) => l.forEach((n) => { out.push(n); walk(n.children) })
  walk(tree)
  return out
}
