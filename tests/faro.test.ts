import { describe, it, expect } from 'vitest'
import { resolvePeriod, previousPeriod, startOfLocalDayUTC, localDate } from '../lib/faro/dates'
import { summarizeSales, buildSummary, OrderRow } from '../lib/faro/metrics'
import { normalizeSettings, feePctFor } from '../lib/faro/settings'

const TZ = 'America/Argentina/Buenos_Aires'

describe('fechas en la zona del negocio', () => {
  it('a las 23:30 de Argentina sigue siendo el mismo día (no el siguiente UTC)', () => {
    const now = new Date('2026-10-10T02:30:00Z') // 9/10 23:30 ART
    expect(localDate(now, TZ)).toBe('2026-10-09')
    expect(resolvePeriod('today', TZ, now).from).toBe('2026-10-09')
  })
  it('7 días incluye hoy y el anterior es la semana previa', () => {
    const p = resolvePeriod('7d', TZ, new Date('2026-10-09T15:00:00Z'))
    expect([p.from, p.to]).toEqual(['2026-10-03', '2026-10-09'])
    const q = previousPeriod(p)
    expect([q.from, q.to]).toEqual(['2026-09-26', '2026-10-02'])
  })
  it('el día local empieza a las 03:00 UTC', () => {
    expect(startOfLocalDayUTC('2026-10-09', TZ)).toBe('2026-10-09T03:00:00.000Z')
  })
})

const order = (o: Partial<OrderRow>): OrderRow => ({
  store_id: 's', order_id: Math.random().toString(), number: null, created_at: '2026-10-09T15:00:00Z', status: 'open', payment_status: 'paid', cancelled_at: null,
  subtotal: 109200, discount: 36400, total: 78085, shipping_customer: 5285, shipping_owner: 5285, payment_method: 'credit_card', gateway: null, installments: 3,
  units: 3, customer_id: 'c1', customer_email: null, province: null, shipping_option: null, shipping_pickup: null,
  items: [{ product_id: 'p', variant_id: 'v', name: 'Remera', qty: 3, price: 36400, cost: 6500 }], ...o,
})

describe('margen de contribución', () => {
  it('usa lo cobrado sin envío como venta neta y descuenta comisiones', () => {
    const s = normalizeSettings({ platform_fee_pct: 1, packaging_per_order: 350, payment_fees: [{ method: 'credit_card', pct: 6 }], ad_tax_pct: 21 })
    const r = summarizeSales([order({}), order({ payment_status: 'pending' }), order({ status: 'cancelled' })], TZ, new Map(), s)
    expect(r.orders).toBe(1)
    expect(r.pending).toBe(1)
    expect(r.cancelled).toBe(1)
    expect(r.netSales).toBe(72800)
    expect(r.cogs).toBe(19500) // costo de Tiendanube
    const fees = 78085 * 0.06
    expect(Math.round(r.contribution)).toBe(Math.round(72800 + 5285 - 19500 - 5285 - 728 - fees - 350))
    const sum = buildSummary(r, { spend: 10000, impressions: 0, linkClicks: 0, lpv: 0, atc: 0, ic: 0, purchases: 1, purchaseValue: 0 }, s)
    expect(sum.adCost).toBe(12100)
    expect(Math.round(sum.profitAfterAds)).toBe(Math.round(r.contribution - 12100))
  })
  it('comisión: método exacto, luego comodín, si no 0 y "desconocida"', () => {
    const s = normalizeSettings({ payment_fees: [{ method: 'credit_card', pct: 6 }, { method: '*', pct: 4 }] })
    expect(feePctFor(s, 'credit_card').pct).toBe(6)
    expect(feePctFor(s, 'wallet').pct).toBe(4)
    expect(feePctFor(normalizeSettings({}), 'wallet')).toEqual({ pct: 0, known: false })
  })
})

describe('Meta: pedidos grandes y límites', () => {
  it('achica la página cuando Meta pide menos datos', async () => {
    const { graphAll } = await import('../lib/faro/meta')
    const limits: string[] = []
    const orig = globalThis.fetch
    globalThis.fetch = (async (url: string) => {
      const l = new URL(url).searchParams.get('limit')!
      limits.push(l)
      const body = Number(l) > 50
        ? { error: { code: 1, message: "Please reduce the amount of data you're asking for, then retry your request" } }
        : { data: [{ id: 1 }, { id: 2 }] }
      return { json: async () => body } as Response
    }) as typeof fetch
    try {
      const rows = await graphAll('act_1/ads', 'tok', { limit: '200' })
      expect(rows.length).toBe(2)
      expect(limits).toEqual(['200', '100', '50'])
    } finally { globalThis.fetch = orig }
  })

  it('no reintenta en el momento si la cuenta está limitada', async () => {
    const { graphGet, isRateLimit } = await import('../lib/faro/meta')
    let calls = 0
    const orig = globalThis.fetch
    globalThis.fetch = (async () => { calls++; return { json: async () => ({ error: { code: 80004, message: 'Se han realizado demasiadas llamadas desde esta cuenta publicitaria.' } }) } as Response }) as typeof fetch
    try {
      await expect(graphGet('act_1/insights', 'tok')).rejects.toSatisfy(isRateLimit)
      expect(calls).toBe(1)
    } finally { globalThis.fetch = orig }
  })
})

describe('Meta: uso del límite', () => {
  it('lee el porcentaje de uso de la cuenta desde el header', async () => {
    const { graphGet, accountUsage } = await import('../lib/faro/meta')
    const orig = globalThis.fetch
    globalThis.fetch = (async () => ({
      headers: new Headers({ 'x-business-use-case-usage': JSON.stringify({ '123': [{ type: 'ads_insights', call_count: 12, total_cputime: 71, total_time: 40 }] }) }),
      json: async () => ({ data: [] }),
    }) as unknown as Response) as typeof fetch
    try {
      await graphGet('act_123/insights', 'tok')
      expect(accountUsage('act_123')).toBe(71)
    } finally { globalThis.fetch = orig }
  })
})

describe('embudo', () => {
  it('marca como traba el paso más flojo contra su referencia', async () => {
    const { funnelSteps } = await import('../lib/faro/funnel')
    const { weakest } = await import('../lib/faro/funnel')
    const ads = { spend: 1000, impressions: 100000, linkClicks: 1500, lpv: 1200, atc: 30, ic: 15, purchases: 8, purchaseValue: 0 }
    const store = { abandoned: 50, abandonedValue: 0, abandonedWithEmail: 0, ordersCreated: 40, ordersPaid: 36, unpaid: 4, unpaidValue: 0, cancelled: 0, partial: false }
    const s = funnelSteps({ ads, store }, { ads, store })
    const w = weakest([...s.ads, ...s.store])
    expect(w?.key).toBe('atc') // 30/1200 = 2,5% contra 4%
  })
})

describe('mejoras automáticas de Meta', () => {
  it('manda todo explícito y respeta el tipo de anuncio', async () => {
    const { degreesOfFreedomSpec, normalizePrefs } = await import('../lib/faro/enhancements')
    const p = normalizePrefs({ features: { inline_comment: false } })
    const img = degreesOfFreedomSpec(p, 'image').creative_features_spec
    const vid = degreesOfFreedomSpec(p, 'video').creative_features_spec
    expect(img.text_optimizations.enroll_status).toBe('OPT_OUT')
    expect(img.image_touchups.enroll_status).toBe('OPT_IN')
    expect(img.inline_comment.enroll_status).toBe('OPT_OUT')
    expect(vid.image_touchups).toBeUndefined()
    expect(vid.video_auto_crop.enroll_status).toBe('OPT_OUT')
    expect(img.adapt_to_placement).toBeUndefined()
    expect(p.music).toBe(false)
  })
})

describe('registro de actividad de Meta', () => {
  it('traduce presupuestos y estados', async () => {
    const { parseActivity } = await import('../lib/faro/activity')
    const b = parseActivity({ event_type: 'update_campaign_budget', translated_event_type: 'Presupuesto de campaña actualizado', event_time: '2026-10-08T21:43:02+0000', object_id: '1', object_name: 'RETARGETING', object_type: 'CAMPAIGN_GROUP',
      extra_data: JSON.stringify({ old_value: { type: 'payment_amount', currency: 'ARS', old_value: 160000, additional_value: 'Diario' }, new_value: { type: 'payment_amount', currency: 'ARS', new_value: 200000, additional_value: 'Diario' } }) }, 'Forever')
    expect(b.level).toBe('campaign')
    expect(b.from).toBe('$ 1.600 (diario)')
    expect(b.to).toBe('$ 2.000 (diario)')
    const s = parseActivity({ event_type: 'update_ad_set_run_status', object_type: 'CAMPAIGN', extra_data: '{"old_value":"Activo","new_value":"Inactivo"}' }, 'Forever')
    expect([s.level, s.from, s.to, s.app]).toEqual(['adset', 'Activo', 'Inactivo', null])
    expect(parseActivity({ event_type: 'ad_account_billing_charge', object_type: 'ACCOUNT' }, 'x').billing).toBe(true)
  })
})

describe('versiones feed + historias', () => {
  it('junta por nombre y por tipo', async () => {
    const { autoPair, pairKey } = await import('../lib/faro/creativePairs')
    expect(pairKey('Remera_negra_STORY.jpg')).toBe(pairKey('remera-negra-feed.png'))
    const f = (key: string, name: string, vertical: boolean, type: 'image' | 'video' = 'image'): import('../lib/faro/creativePairs').PairableFile => ({ key, file: { name }, type, state: 'listo', vertical })
    const out = autoPair([f('a', 'oversize 4x5.jpg', false), f('b', 'oversize 9x16.jpg', true), f('c', 'slim feed.jpg', false), f('d', 'slim story.mp4', true, 'video')])
    expect(out.find((x) => x.key === 'a')?.story).toBe('b')
    expect(out.find((x) => x.key === 'b')?.partOf).toBe('a')
    expect(out.find((x) => x.key === 'd')?.partOf).toBeUndefined()
    const two = autoPair([f('x', 'IMG_123.jpg', false), f('y', 'IMG_999.jpg', true)])
    expect(two[0].story).toBe('y')
  })
})

describe('cifrado de tokens', () => {
  it('cifra, descifra y lee tokens viejos sin cifrar', async () => {
    process.env.FARO_ENC_KEY = Buffer.alloc(32, 7).toString('base64')
    const { encryptSecret, decryptSecret, isEncrypted } = await import('../lib/faro/secret')
    const e = encryptSecret('EAAB-token-123')
    expect(isEncrypted(e)).toBe(true)
    expect(e).not.toContain('EAAB')
    expect(decryptSecret(e)).toBe('EAAB-token-123')
    expect(decryptSecret('viejo-sin-cifrar')).toBe('viejo-sin-cifrar')
    expect(encryptSecret(e)).toBe(e)
    delete process.env.FARO_ENC_KEY
    expect(encryptSecret('x')).toBe('x')
  })
})

describe('fatiga de creativos', () => {
  it('detecta caída de CTR y suba de costo por compra', async () => {
    const { detectFatigue } = await import('../lib/faro/fatigue')
    const { addDays } = await import('../lib/faro/dates')
    const today = '2026-10-12'
    const rows = Array.from({ length: 14 }, (_, i) => {
      const late = i >= 7
      return { ad_id: 'A', date: addDays(today, i - 14), spend: 10000, impressions: 5000, link_clicks: late ? 40 : 100, purchases: late ? 1 : 3, video_3s: 0 }
    })
    const ok = Array.from({ length: 14 }, (_, i) => ({ ad_id: 'B', date: addDays(today, i - 14), spend: 10000, impressions: 5000, link_clicks: 100, purchases: 3, video_3s: 0 }))
    const f = detectFatigue([...rows, ...ok], today, 40000)
    expect(f.A.status).toBe('fatiga')
    expect(f.A.reasons.length).toBe(2)
    expect(f.B).toBeUndefined()
    expect(f.A.ctrSeries.length).toBe(14)
  })
})

import { evaluateRule, mergeProposals, type Rule } from '../lib/faro/rules'
import { planPacing } from '../lib/faro/budgetPlan'

describe('reglas con aprobación', () => {
  const m = (spend: number, purchases: number) => ({ spend, impressions: 10000, reach: 5000, linkClicks: 100, lpv: 80, atc: 10, ic: 5, purchases, purchaseValue: purchases * 30000, video3s: 0, videoP50: 0 })
  const node = (id: string, spend: number, purchases: number, extra: Record<string, unknown> = {}) => ({
    id, accountId: 'a', accountExternal: 'act_1', level: 'adset', name: id, status: 'ACTIVE', effectiveStatus: 'ACTIVE', objective: null, optimizationGoal: null,
    dailyBudget: 10000, lifetimeBudget: null, budgetOwner: 'adset', parentId: 'c', campaignId: 'c', thumbnail: null, image: null, isVideo: false, copy: null, targeting: null,
    frequency: null, m: m(spend, purchases), children: [], protected: false, ...extra,
  }) as never
  const rule = (x: Partial<Rule>): Rule => ({ id: 'r', name: 'R', active: true, level: 'adset', metric: 'cpa_over_max', threshold: 150, days: 3, action: 'budget_down', action_pct: 20, ...x })
  it('propone bajar presupuesto al caro y no toca protegidos ni pausados', () => {
    const nodes = [node('caro', 40000, 2), node('prot', 40000, 2, { protected: true }), node('pausado', 40000, 2, { effectiveStatus: 'PAUSED' }), node('bien', 10000, 2)]
    const p = evaluateRule(rule({}), nodes, 10000)
    expect(p.map((x) => x.nodeId)).toEqual(['caro'])
    expect(p[0].to).toBe(8000)
  })
  it('pausar gana sobre bajar presupuesto en el mismo ad set', () => {
    const nodes = [node('x', 40000, 0)]
    const a = evaluateRule(rule({ id: 'a', metric: 'no_purchases', action: 'pause' }), nodes, 10000)
    const b = evaluateRule(rule({ id: 'b', metric: 'no_purchases', action: 'budget_down' }), nodes, 10000)
    const merged = mergeProposals([...b, ...a])
    expect(merged).toHaveLength(1)
    expect(merged[0].action).toBe('pause')
  })
})

describe('plan de inversión mensual', () => {
  it('proyecta el cierre y el presupuesto diario necesario', () => {
    const p = planPacing({ plan: 3_000_000, spent: 1_000_000, today: '2026-10-11', hourShare: 0, dailyNow: 100_000 })
    expect(p.daysInMonth).toBe(31)
    expect(Math.round(p.forecast)).toBe(3_100_000)
    expect(p.status).toBe('ok')
    expect(Math.round(p.dailyNeeded)).toBe(Math.round(2_000_000 / 21))
  })
})

import { parseLanding, attribute } from '../lib/faro/attribution'

describe('ventas reales por anuncio (UTM)', () => {
  it('lee las UTMs de la URL de llegada', () => {
    const p = parseLanding('https://www.foreverbasics.com.ar/productos/remera/?utm_source=facebook&utm_content=Remera%20negra&utm_term=120200&fbclid=abc')!
    expect(p.utm_source).toBe('facebook'); expect(p.utm_content).toBe('Remera negra'); expect(p.utm_term).toBe('120200'); expect(p.fbclid).toBe(true)
    expect(parseLanding('')).toBeNull()
  })
  it('cruza por id y por nombre, y no cuenta pedidos cancelados', () => {
    const ads = [{ id: '1', name: 'Remera', spend: 100 }, { id: '2', name: 'remera', spend: 500 }, { id: '3', name: 'Buzo', spend: 50 }]
    const r = attribute([
      { order_id: 'a', utm_source: 'facebook', utm_content: 'x', utm_term: '3', fbclid: false, net: 1000, valid: true },
      { order_id: 'b', utm_source: 'facebook', utm_content: 'Remera', utm_term: null, fbclid: false, net: 2000, valid: true },
      { order_id: 'c', utm_source: 'facebook', utm_content: 'Remera', utm_term: null, fbclid: false, net: 9999, valid: false },
      { order_id: 'd', utm_source: 'google', utm_content: null, utm_term: null, fbclid: false, net: 500, valid: true },
    ], ads)
    expect(r.byAd['3']).toEqual({ orders: 1, revenue: 1000 })
    expect(r.byAd['2']).toEqual({ orders: 1, revenue: 2000 })
    expect(r.matched).toBe(2); expect(r.fromMeta).toBe(2)
  })
})
