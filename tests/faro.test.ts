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
