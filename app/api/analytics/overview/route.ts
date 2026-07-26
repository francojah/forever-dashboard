import { NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import Anthropic from '@anthropic-ai/sdk'

export const dynamic = 'force-dynamic'
export const maxDuration = 30

/**
 * GET /api/analytics/overview
 * Señales estructurales del negocio + score de salud (0-100) + diagnóstico IA.
 * Cruza tn_orders (recompra), product_costs (COGS real), y los últimos snapshots
 * de Meta/Tiendanube (revenue, gasto, mix de producto).
 */

type OrderProduct = { product_id: string | null; quantity: number; price: number; name: string }
type OrderRow = { order_date: string | null; payment_status: string | null; customer_id: string | null; total: number | null; products: OrderProduct[] | null }
const PAID = new Set(['paid', 'closed'])

function scoreBand(v: number, bands: [number, number][]): number {
  for (const [thr, sc] of bands) if (v >= thr) return sc
  return bands[bands.length - 1][1]
}

export async function GET() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!url || !key) return NextResponse.json({ error: 'Sin credenciales' }, { status: 500 })
  const sb = createClient(url, key)

  const since = new Date(); since.setDate(since.getDate() - 30)
  const [metaRes, tnRes, ordersRes, costsRes] = await Promise.all([
    sb.from('meta_snapshots').select('summary, periods').order('snapshot_date', { ascending: false }).limit(1).single(),
    sb.from('tiendanube_snapshots').select('summary_30d').order('snapshot_date', { ascending: false }).limit(1).single(),
    sb.from('tn_orders').select('order_date, payment_status, customer_id, total, products').gte('order_date', since.toISOString()),
    sb.from('product_costs').select('product_id, unit_cost'),
  ])

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const tn30 = (tnRes.data?.summary_30d || {}) as any
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const meta = (metaRes.data as any) || {}
  const metaSpend30 = meta?.periods?.last_30d?.summary?.total_spend_7d ?? meta?.summary?.total_spend_7d ?? 0
  const revenue30 = tn30?.total_revenue || 0

  const costMap = new Map<string, number>()
  ;((costsRes.data || []) as { product_id: string; unit_cost: number }[]).forEach((c) => costMap.set(String(c.product_id), c.unit_cost))
  const orders = ((ordersRes.data || []) as unknown as OrderRow[]).filter((o) => o.payment_status && PAID.has(o.payment_status))

  // COGS real 30d + recompra + concentración
  let merch = 0, units = 0
  const custCount = new Map<string, number>()
  const prodRev = new Map<string, number>()
  for (const o of orders) {
    if (o.customer_id) custCount.set(o.customer_id, (custCount.get(o.customer_id) || 0) + 1)
    for (const p of o.products || []) {
      const q = p.quantity || 0; units += q
      const c = p.product_id != null ? costMap.get(String(p.product_id)) : undefined
      merch += (c != null ? c : 6500) * q
      const base = (p.name || '').replace(/\s*\([^)]*\)\s*$/, '').trim() || p.name
      prodRev.set(base, (prodRev.get(base) || 0) + (p.price || 0) * q)
    }
  }
  const totalCust = custCount.size
  const repeatRate = totalCust ? Math.round((Array.from(custCount.values()).filter((n) => n > 1).length / totalCust) * 100) : 0
  const prodRevArr = Array.from(prodRev.values()).sort((a, b) => b - a)
  const prodTotal = prodRevArr.reduce((s, v) => s + v, 0)
  const topShare = prodTotal > 0 ? Math.round((prodRevArr[0] / prodTotal) * 100) : 0

  // Margen neto aprox: revenue - merch - gasto Meta - ~13% (envío+comisión+packaging+cuotas)
  const opsCost = revenue30 * 0.13
  const netMargin = revenue30 - merch - metaSpend30 - opsCost
  const netMarginPct = revenue30 > 0 ? Math.round((netMargin / revenue30) * 100) : 0
  const realRoas = metaSpend30 > 0 ? +(revenue30 / metaSpend30).toFixed(2) : null
  const adDependency = revenue30 > 0 ? Math.round((metaSpend30 / revenue30) * 100) : 0

  const signals = [
    { key: 'margen', label: 'Margen neto', value: netMarginPct + '%', score: scoreBand(netMarginPct, [[30, 100], [15, 70], [0, 40], [-999, 10]]), hint: 'Rentabilidad después de todos los costos.' },
    { key: 'recompra', label: 'Recompra', value: repeatRate + '%', score: scoreBand(repeatRate, [[30, 100], [20, 75], [10, 50], [-999, 25]]), hint: 'Clientes que vuelven a comprar (LTV).' },
    { key: 'dependencia', label: 'Dependencia de ads', value: adDependency + '%', score: scoreBand(-adDependency, [[-30, 100], [-50, 70], [-70, 40], [-999, 20]]), hint: 'Cuánto de tu venta banca la pauta. Menos es más sano.' },
    { key: 'concentracion', label: 'Concentración producto', value: topShare + '%', score: scoreBand(-topShare, [[-40, 100], [-60, 70], [-80, 40], [-999, 20]]), hint: 'Peso del producto #1. Muy alto = frágil.' },
  ]
  const health = Math.round(signals.reduce((s, x) => s + x.score, 0) / signals.length)

  // Diagnóstico IA (rule fallback)
  let diagnosis = ''
  try {
    const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY })
    const msg = await client.messages.create({
      model: 'claude-sonnet-4-6', max_tokens: 350,
      messages: [{ role: 'user', content: `Sos analista de negocio de un ecommerce (ARS). Señales 30d: margen neto ${netMarginPct}%, recompra ${repeatRate}%, dependencia de ads ${adDependency}%, concentración del producto top ${topShare}%, ROAS real ${realRoas}x, revenue ${Math.round(revenue30)}. Escribí un diagnóstico ESTRUCTURAL de 2-3 oraciones: el mayor riesgo de fondo y la palanca #1 para mejorar la salud del negocio. Directo, sin rodeos, sin markdown.` }],
    })
    diagnosis = msg.content[0].type === 'text' ? msg.content[0].text.trim() : ''
  } catch {
    diagnosis = topShare > 60 ? `Tu negocio depende demasiado de un solo producto (${topShare}%). Diversificar el mix es la palanca estructural #1.` : `Margen neto ${netMarginPct}% y recompra ${repeatRate}%. Trabajar retención bajaría tu dependencia de la pauta.`
  }

  return NextResponse.json({
    health, signals, diagnosis,
    kpis: { revenue_30d: Math.round(revenue30), meta_spend_30d: Math.round(metaSpend30), real_roas: realRoas, net_margin_30d: Math.round(netMargin), customers_30d: totalCust },
  })
}
