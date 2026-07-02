import { NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import Anthropic from '@anthropic-ai/sdk'
import { DEFAULT_BREAKEVEN_CPA, DEFAULT_ROAS_MIN, LOCALE } from '@/lib/config'

export const dynamic = 'force-dynamic'
export const maxDuration = 30

/**
 * GET /api/recommendations
 * Motor de recomendaciones: cruza señales de Meta + Tiendanube + clientes + stock
 * y devuelve recomendaciones agrupadas por área con impacto estimado.
 */

type Rec = {
  area: 'Marketing' | 'Stock' | 'Clientes' | 'Producto' | 'Finanzas'
  priority: 'alta' | 'media' | 'baja'
  title: string
  why: string
  action: string
  impact?: string
  link?: string
}

const fmt = (n: number | null | undefined) => (n == null ? 'N/A' : '$' + Math.round(n).toLocaleString(LOCALE))

export async function GET() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!url || !key) return NextResponse.json({ error: 'Sin credenciales' }, { status: 500 })
  const supabase = createClient(url, key)

  const [{ data: meta }, { data: tn }, { data: orders }] = await Promise.all([
    supabase.from('meta_snapshots').select('summary, adsets').order('snapshot_date', { ascending: false }).limit(1).single(),
    supabase.from('tiendanube_snapshots').select('summary_7d, summary_30d').order('snapshot_date', { ascending: false }).limit(1).single(),
    supabase.from('tn_orders').select('customer_id, payment_status').limit(5000),
  ])

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const s = (meta?.summary || {}) as any
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const adsets = (meta?.adsets || []) as any[]
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const tn7d = (tn?.summary_7d || {}) as any
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const tn30 = (tn?.summary_30d || {}) as any

  const activos = adsets.filter((a) => a.status === 'ACTIVE' && (a.spend || 0) > 0)
  const sobreCPA = activos.filter((a) => a.cost_per_result > DEFAULT_BREAKEVEN_CPA && a.optimization_goal === 'OFFSITE_CONVERSIONS').sort((a, b) => (b.spend || 0) - (a.spend || 0)).slice(0, 5)
  const ganadores = activos.filter((a) => a.roas && a.roas >= 4).sort((a, b) => (b.roas || 0) - (a.roas || 0)).slice(0, 5)

  // Recurrencia de clientes
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const paid = ((orders || []) as any[]).filter((o) => ['paid', 'closed'].includes(o.payment_status) && o.customer_id)
  const custCounts = new Map<string, number>()
  paid.forEach((o) => custCounts.set(o.customer_id, (custCounts.get(o.customer_id) || 0) + 1))
  const totalCust = custCounts.size
  const repeat = Array.from(custCounts.values()).filter((c) => c > 1).length
  const repeatRate = totalCust ? Math.round((repeat / totalCust) * 100) : null

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const topProducts = (tn30?.top_products || []).slice(0, 5).map((p: any) => `${p.name} (${p.quantity}u, ${fmt(p.revenue)})`).join(' · ')
  const realRoas = tn7d?.total_revenue && s.total_spend_7d ? (tn7d.total_revenue / s.total_spend_7d).toFixed(2) : 'N/A'

  const prompt = `Sos el copiloto estratégico de un ecommerce de indumentaria (Argentina, ARS) que produce sus propios productos.
Breakeven CPA ~${fmt(DEFAULT_BREAKEVEN_CPA)}, ROAS mínimo ${DEFAULT_ROAS_MIN}x, target 10x, margen ~53%.

SEÑALES (7-30 días):
- Ventas 7d: ${fmt(tn7d?.total_revenue)} · ${tn7d?.total_orders || 0} órdenes · AOV ${fmt(tn7d?.aov)}
- Gasto Meta 7d: ${fmt(s.total_spend_7d)} · CPA ${fmt(s.blended_cpa)} · ROAS pixel ${s.blended_roas || 'N/A'}x · ROAS real ${realRoas}x
- Ad sets sobre breakeven: ${sobreCPA.length ? sobreCPA.map((a) => `"${a.name}" CPA ${fmt(a.cost_per_result)}`).join(' · ') : 'ninguno'}
- Ad sets ganadores: ${ganadores.length ? ganadores.map((a) => `"${a.name}" ${a.roas}x`).join(' · ') : 'ninguno'}
- Clientes: ${totalCust} · tasa de recompra ${repeatRate ?? 'N/A'}%
- Top productos 30d: ${topProducts || 'N/A'}

Generá 6 a 8 recomendaciones accionables, repartidas entre las áreas: Marketing, Stock, Clientes, Producto, Finanzas.
Cada una concreta y basada en las señales. Respondé SOLO JSON:
{"recommendations":[{"area":"Marketing|Stock|Clientes|Producto|Finanzas","priority":"alta|media|baja","title":"corta e imperativa","why":"el dato que la justifica","action":"paso concreto","impact":"impacto estimado (ej: '+15% ROAS' o 'recuperar $X')","link":"/campanias|/analytics|/creativos|/tiendanube|/historico"}]}`

  try {
    const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY })
    const message = await client.messages.create({ model: 'claude-sonnet-4-6', max_tokens: 1600, messages: [{ role: 'user', content: prompt }] })
    const text = message.content[0].type === 'text' ? message.content[0].text : ''
    const jsonMatch = text.match(/\{[\s\S]*\}/)
    if (!jsonMatch) throw new Error('Sin JSON')
    const parsed = JSON.parse(jsonMatch[0]) as { recommendations: Rec[] }
    return NextResponse.json({ recommendations: parsed.recommendations || [], generated_at: new Date().toISOString() })
  } catch (e) {
    const fallback: Rec[] = []
    if (sobreCPA.length) fallback.push({ area: 'Marketing', priority: 'alta', title: `Recortá ${sobreCPA.length} ad set(s) sobre breakeven`, why: `Gastan con CPA arriba de ${fmt(DEFAULT_BREAKEVEN_CPA)}.`, action: 'Bajá presupuesto o pausá.', impact: 'recuperar margen', link: '/campanias' })
    if (ganadores.length) fallback.push({ area: 'Marketing', priority: 'media', title: `Escalá "${ganadores[0].name}"`, why: `ROAS ${ganadores[0].roas}x.`, action: 'Subí presupuesto 15-20%.', impact: '+ventas', link: '/campanias' })
    if (repeatRate != null && repeatRate < 25) fallback.push({ area: 'Clientes', priority: 'media', title: 'Activá recompra', why: `Solo ${repeatRate}% de recompra.`, action: 'Email/WhatsApp post-compra + win-back.', impact: '+LTV', link: '/analytics' })
    fallback.push({ area: 'Stock', priority: 'baja', title: 'Revisá quiebres de stock', why: 'Productos pauteados por agotarse.', action: 'Mirá la alerta de stock.', link: '/analytics' })
    return NextResponse.json({ recommendations: fallback, fallback: true, error: (e as Error).message })
  }
}
