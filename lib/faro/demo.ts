/**
 * Datos de ejemplo para la demo pública de Faro: una marca de ropa inventada ("Bruma"), con órdenes,
 * inversión y estructura de campañas generadas de forma determinística. Pasan por las mismas funciones
 * de cálculo que los datos reales, así la demo muestra exactamente lo que vería un cliente.
 */
import type { OrderRow, CostIndex, AdsDaily } from './metrics'
import { summarizeSales, summarizeAds, buildSummary, dailySeries } from './metrics'
import type { TreeNode, Metrics } from './adsTree'
import { normalizeSettings } from './settings'
import { addDays, localDate, resolvePeriod, previousPeriod, startOfLocalDayUTC, type Period } from './dates'
import { productTable } from './home'
import type { SuggestedAction } from './actions'

export const DEMO_TZ = 'America/Argentina/Buenos_Aires'
export const DEMO_STORE = 'demo-store'
export const DEMO_ACCOUNT = 'demo-account'

export const demoSettings = normalizeSettings({
  configured: true, platform_fee_pct: 0, packaging_per_order: 900, iibb_pct: 3, tax_regime: 'responsable_inscripto', ad_tax_pct: 7,
  payment_fees: [{ method: '*', pct: 6.5 }],
})

// PRNG determinístico (mulberry32) para que la demo no cambie en cada recarga
function rng(seed: number) {
  return () => {
    seed |= 0; seed = (seed + 0x6d2b79f5) | 0
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed)
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}
const seedOf = (s: string) => Array.from(s).reduce((a, c) => (a * 31 + c.charCodeAt(0)) | 0, 7)

const PRODUCTS = [
  { id: 'p1', name: 'Remera Clásica Algodón', price: 24900, cost: 8200, w: 0.34 },
  { id: 'p2', name: 'Remera Oversize', price: 29900, cost: 10100, w: 0.24 },
  { id: 'p3', name: 'Buzo Canguro Frisa', price: 54900, cost: 21800, w: 0.14 },
  { id: 'p4', name: 'Pack x3 Remeras Básicas', price: 64900, cost: 24600, w: 0.16 },
  { id: 'p5', name: 'Jogger Rústico', price: 42900, cost: 17200, w: 0.12 },
]
const PROVINCES = ['Buenos Aires', 'Capital Federal', 'Córdoba', 'Santa Fe', 'Mendoza', 'Tucumán']

export function demoCostIndex(): CostIndex {
  const idx: CostIndex = new Map()
  for (const p of PRODUCTS) idx.set(`${DEMO_STORE}|${p.id}|`, [{ product_id: p.id, variant_id: '', unit_cost: p.cost, valid_from: '2025-01-01', store_id: DEMO_STORE, name: p.name }])
  return idx
}

/** Factor diario: fin de semana más flojo, una leve tendencia al alza y ruido. */
function dayFactor(date: string, r: () => number) {
  const dow = new Date(`${date}T12:00:00Z`).getUTCDay()
  const wk = dow === 0 ? 0.78 : dow === 6 ? 0.86 : dow === 1 ? 1.08 : 1
  return wk * (0.85 + r() * 0.3)
}

export function demoOrders(from: string, to: string): OrderRow[] {
  const out: OrderRow[] = []
  let n = 18000
  for (let d = from; d <= to; d = addDays(d, 1)) {
    const r = rng(seedOf(d))
    const trend = 1 + (Date.parse(d) - Date.parse(from)) / (86400000 * 400)
    const count = Math.round(22 * dayFactor(d, r) * trend)
    for (let i = 0; i < count; i++) {
      const items: OrderRow['items'] = []
      const lines = r() < 0.72 ? 1 : 2
      for (let l = 0; l < lines; l++) {
        let x = r(), p = PRODUCTS[0]
        for (const c of PRODUCTS) { if (x < c.w) { p = c; break } x -= c.w }
        const qty = r() < 0.8 ? 1 : 2
        items.push({ product_id: p.id, variant_id: null, name: p.name, qty, price: p.price, cost: null })
      }
      const gross = items.reduce((a, it) => a + it.price * it.qty, 0)
      const discount = r() < 0.35 ? Math.round(gross * 0.1) : 0
      const ship = r() < 0.4 ? 0 : 5900
      const hour = 9 + Math.floor(r() * 14), min = Math.floor(r() * 60)
      const created = new Date(new Date(startOfLocalDayUTC(d, DEMO_TZ)).getTime() + (hour * 60 + min) * 60000).toISOString()
      const cancelled = r() < 0.03
      n++
      out.push({
        store_id: DEMO_STORE, order_id: String(n), number: String(n), created_at: created,
        status: cancelled ? 'cancelled' : 'open', payment_status: cancelled ? 'voided' : 'paid', cancelled_at: cancelled ? created : null,
        subtotal: gross, discount, total: gross - discount + ship, shipping_customer: ship, shipping_owner: ship ? 0 : 6200,
        payment_method: 'credit_card', gateway: 'pago_nube', installments: r() < 0.5 ? 3 : 1, units: items.reduce((a, it) => a + it.qty, 0),
        customer_id: String(Math.floor(r() * 9000)), customer_email: null, province: PROVINCES[Math.floor(r() * PROVINCES.length)],
        shipping_option: ship ? 'Correo a domicilio' : 'Envío gratis', shipping_pickup: null, items,
      })
    }
  }
  return out
}

export function demoAdsDaily(from: string, to: string): AdsDaily[] {
  const out: AdsDaily[] = []
  for (let d = from; d <= to; d = addDays(d, 1)) {
    const r = rng(seedOf(`ads${d}`))
    const spend = Math.round(380000 * (0.9 + r() * 0.2))
    const impressions = Math.round(spend / (2400 + r() * 500) * 1000)
    const link_clicks = Math.round(impressions * (0.011 + r() * 0.004))
    const lpv = Math.round(link_clicks * 0.78)
    const atc = Math.round(lpv * 0.09)
    const ic = Math.round(atc * 0.55)
    const purchases = Math.min(ic, Math.round(spend / (12500 + r() * 3500)))
    out.push({ date: d, spend, impressions, link_clicks, lpv, atc, ic, purchases, purchase_value: purchases * 41000 })
  }
  return out
}

const M = (spend: number, cpa: number, ctr: number, cpm: number, video = false): Metrics => {
  const impressions = Math.round((spend / cpm) * 1000)
  const linkClicks = Math.round(impressions * ctr)
  const purchases = cpa > 0 ? Math.round(spend / cpa) : 0
  return {
    spend, impressions, reach: Math.round(impressions / 1.7), linkClicks, lpv: Math.round(linkClicks * 0.78), atc: Math.round(linkClicks * 0.07),
    ic: Math.round(linkClicks * 0.04), purchases, purchaseValue: purchases * 41000,
    video3s: video ? Math.round(impressions * 0.27) : 0, videoP50: video ? Math.round(impressions * 0.09) : 0,
  }
}

/** Estructura de campañas para un período de `days` días. */
export function demoTree(days: number, k = 1, vary = false): TreeNode[] {
  // vary: período anterior con diferencias por anuncio (para que las comparaciones no sean todas iguales)
  let n = 0
  const f = () => (vary ? 0.75 + rng(++n * 7919)() * 0.5 : 1)
  const s = (x: number) => Math.round(x * 2.5 * days * k * f())
  const Mv = (spend: number, cpa: number, ctr: number, cpm: number, video = false) => M(spend, cpa > 0 ? cpa * f() : 0, ctr * f(), cpm, video)
  const base = { accountId: DEMO_ACCOUNT, accountExternal: 'act_demo', status: 'ACTIVE', effectiveStatus: 'ACTIVE', objective: 'OUTCOME_SALES', optimizationGoal: 'OFFSITE_CONVERSIONS', lifetimeBudget: null, thumbnail: null, image: null, isVideo: false, copy: null, targeting: null, frequency: null, protected: false }
  const ad = (id: string, name: string, parent: string, camp: string, m: Metrics, video = false, extra: Partial<TreeNode> = {}): TreeNode => ({
    ...base, id, level: 'ad', name, parentId: parent, campaignId: camp, dailyBudget: null, budgetOwner: null, isVideo: video, thumbnail: demoCreativeImage(id), image: demoCreativeImage(id), m, children: [], ...extra,
  })
  const sum = (list: TreeNode[]): Metrics => {
    const z = M(0, 0, 0, 1)
    for (const n of list) (Object.keys(z) as (keyof Metrics)[]).forEach((key) => { z[key] += n.m[key] })
    return z
  }
  const adset = (id: string, name: string, camp: string, budget: number | null, kids: TreeNode[], extra: Partial<TreeNode> = {}): TreeNode => ({
    ...base, id, level: 'adset', name, parentId: camp, campaignId: camp, dailyBudget: budget, budgetOwner: budget ? 'adset' : null, m: sum(kids), children: kids, frequency: 1.9, ...extra,
  })
  const campaign = (id: string, name: string, budget: number | null, kids: TreeNode[], extra: Partial<TreeNode> = {}): TreeNode => ({
    ...base, id, level: 'campaign', name, parentId: null, campaignId: id, dailyBudget: budget, budgetOwner: budget ? 'campaign' : null, m: sum(kids), children: kids, ...extra,
  })
  return [
    campaign('c1', 'PROSPECTING · Advantage+', 90000, [
      adset('s1', 'Amplio · 18-45', 'c1', null, [
        ad('a1', 'Video · Remera en uso · gancho precio', 's1', 'c1', Mv(s(31000), 13800, 0.0165, 2300, true), true),
        ad('a2', 'Imagen · Pack x3 · beneficio', 's1', 'c1', Mv(s(22000), 17700, 0.0128, 2600)),
        ad('a3', 'Video · UGC talles', 's1', 'c1', Mv(s(14000), 29400, 0.0086, 2900, true), true),
      ]),
      adset('s2', 'Intereses moda · Mujeres', 'c1', null, [
        ad('a4', 'Carrusel · colores', 's2', 'c1', Mv(s(15000), 21600, 0.0104, 2500)),
        ad('a5', 'Imagen · Oversize lifestyle', 's2', 'c1', Mv(s(8000), 0, 0.0071, 2800)),
      ]),
    ], { protected: true }),
    campaign('c2', 'RETARGETING · Visitantes 30 días', null, [
      adset('s3', 'Visitas web + IG 30d', 'c2', 35000, [
        ad('a6', 'Catálogo dinámico', 's3', 'c2', Mv(s(19000), 9300, 0.021, 3400)),
        ad('a7', 'Imagen · envío gratis', 's3', 'c2', Mv(s(9000), 12600, 0.017, 3300)),
      ]),
    ]),
    campaign('c3', 'TESTING · Creativos nuevos', null, [
      adset('s4', 'Test · ángulo calidad', 'c3', 25000, [
        ad('a8', 'Video · prueba de lavado', 's4', 'c3', Mv(s(12000), 15600, 0.0141, 2400, true), true),
        ad('a9', 'Imagen · comparación', 's4', 'c3', Mv(s(9000), 35400, 0.0079, 2700)),
      ]),
      adset('s5', 'Test · ángulo precio', 'c3', 18000, [
        ad('a10', 'Imagen · 3 cuotas', 's5', 'c3', Mv(s(11000), 0, 0.0068, 2900)),
      ], { effectiveStatus: 'ACTIVE' }),
    ]),
  ]
}

export function demoActions(): SuggestedAction[] {
  return [
    { id: 'd1', kind: 'pause', title: 'Pausar "Imagen · 3 cuotas"', reason: 'Gastó $192.000 en 7 días sin ninguna compra. Tu costo máximo rentable es $27.000.', impact: 77000, target: { accountId: DEMO_ACCOUNT, level: 'ad', id: 'a10', name: 'Imagen · 3 cuotas', field: 'status', value: 'PAUSED', current: 'ACTIVE' } },
    { id: 'd2', kind: 'budget_up', title: 'Subir 15% "Visitas web + IG 30d"', reason: 'Costo por compra $9.300, 65% debajo del máximo, con 59 compras en 7 días.', impact: 52000, target: { accountId: DEMO_ACCOUNT, level: 'adset', id: 's3', name: 'Visitas web + IG 30d', field: 'daily_budget', value: 40250, current: 35000 } },
    { id: 'd3', kind: 'rotate', title: 'Rotar creativos en "Intereses moda · Mujeres"', reason: 'El CTR cayó 31% contra la semana anterior y la frecuencia ya pasa 3.', impact: 23000, href: '/demo?v=anuncios' },
    { id: 'd4', kind: 'restock', title: 'Reponer "Buzo Canguro Frisa" talle M', reason: 'Quedan 6 unidades: al ritmo de venta actual se termina en 3 días.', impact: 18000 },
  ]
}

export interface DemoHome {
  period: Period; prev: Period
  cur: ReturnType<typeof buildSummary>; before: ReturnType<typeof buildSummary>
  series: ReturnType<typeof dailySeries>
  products: ReturnType<typeof productTable>
  tree: TreeNode[]; prevTree: TreeNode[]
  maxCpa: number | null
  daily: { date: string; spend: number; purchases: number; value: number }[]
}

export function demoHome(now = new Date()): DemoHome {
  const period = resolvePeriod('30d', DEMO_TZ, now)
  const prev = previousPeriod(period)
  const idx = demoCostIndex()
  const orders = demoOrders(prev.from, period.to)
  const ads = demoAdsDaily(prev.from, period.to)
  const inR = (o: OrderRow, p: Period) => { const d = localDate(new Date(o.created_at), DEMO_TZ); return d >= p.from && d <= p.to }
  const curO = orders.filter((o) => inR(o, period)), prevO = orders.filter((o) => inR(o, prev))
  const adsIn = (p: Period) => ads.filter((a) => a.date >= p.from && a.date <= p.to)
  const cur = buildSummary(summarizeSales(curO, DEMO_TZ, idx, demoSettings), summarizeAds(adsIn(period)), demoSettings)
  const before = buildSummary(summarizeSales(prevO, DEMO_TZ, idx, demoSettings), summarizeAds(adsIn(prev)), demoSettings)
  const ref = summarizeSales(orders.filter((o) => localDate(new Date(o.created_at), DEMO_TZ) >= addDays(period.to, -13)), DEMO_TZ, idx, demoSettings)
  const maxCpa = ref.orders > 0 ? ref.contribution / ref.orders / (1 + demoSettings.ad_tax_pct / 100) : null
  return {
    period, prev, cur, before, maxCpa,
    series: dailySeries(period, curO, adsIn(period), DEMO_TZ, idx, demoSettings),
    products: productTable(curO, DEMO_TZ, idx, demoSettings),
    tree: demoTree(period.days), prevTree: demoTree(prev.days, 0.92, true),
    daily: adsIn(period).map((d) => ({ date: d.date, spend: d.spend, purchases: d.purchases, value: d.purchase_value })),
  }
}

/** Imágenes ilustradas para los creativos de la demo (SVG inline, sin fotos reales). */
const ART: Record<string, [string, string, string, string]> = {
  a1: ['#d9cbb8', '#1d1d1f', 'Desde $24.900', 'tee'],
  a2: ['#1f3a5f', '#f2efe9', 'Pack x3', 'stack'],
  a3: ['#e6e1d8', '#7a5c3e', 'Encontrá tu talle', 'tee'],
  a4: ['#f2c6b4', '#2d4a3e', '6 colores', 'colors'],
  a5: ['#2b2b2b', '#e9e4dc', 'Oversize', 'tee'],
  a6: ['#f4f1ec', '#1f3a5f', 'Lo que viste', 'stack'],
  a7: ['#e8a33d', '#1a1206', 'Envío gratis', 'tee'],
  a8: ['#cfd8d3', '#23332c', '50 lavados', 'tee'],
  a9: ['#ffffff', '#c2413a', 'Nosotros vs. ellos', 'colors'],
  a10: ['#3d2c5c', '#f6e7c1', '3 cuotas', 'tee'],
}
const TEE = 'M150 70 L200 50 Q240 75 280 50 L330 70 L380 130 L340 160 L320 140 L320 340 L160 340 L160 140 L140 160 L100 130 Z'

export function demoCreativeImage(id: string): string | null {
  const a = ART[id]
  if (!a) return null
  const [bg, fg, label, kind] = a
  const shape = kind === 'stack'
    ? `<path d="${TEE}" fill="${fg}" opacity=".35" transform="translate(-40 10)"/><path d="${TEE}" fill="${fg}" opacity=".6" transform="translate(40 10)"/><path d="${TEE}" fill="${fg}" transform="translate(0 20)"/>`
    : kind === 'colors'
      ? ['#c2413a', '#1f3a5f', '#e8a33d', '#2d4a3e'].map((c, i) => `<path d="${TEE}" fill="${c}" transform="translate(${-90 + i * 60} ${20 + (i % 2) * 14}) scale(.62) translate(150 60)"/>`).join('')
      : `<path d="${TEE}" fill="${fg}" transform="translate(0 20)"/>`
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 480 480"><rect width="480" height="480" fill="${bg}"/>${shape}<rect x="0" y="392" width="480" height="88" fill="${fg}" opacity=".92"/><text x="240" y="448" text-anchor="middle" font-family="Helvetica,Arial,sans-serif" font-size="34" font-weight="700" fill="${bg}">${label}</text></svg>`
  return `data:image/svg+xml;utf8,${encodeURIComponent(svg)}`
}
