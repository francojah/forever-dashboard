import { NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import Anthropic from '@anthropic-ai/sdk'
import { DEFAULT_BREAKEVEN_CPA, DEFAULT_ROAS_MIN, LOCALE } from '@/lib/config'

export const dynamic = 'force-dynamic'
export const maxDuration = 30

/**
 * GET /api/today-actions
 * Genera las "3 acciones para hoy" cruzando señales de Meta + Tiendanube + stock
 * y pasándolas a Claude. Devuelve acciones concretas y priorizadas.
 */

type Action = {
  priority: 'alta' | 'media' | 'baja'
  title: string
  why: string
  action: string
  link?: string
}

const fmt = (n: number | null | undefined) => (n == null ? 'N/A' : '$' + Math.round(n).toLocaleString(LOCALE))

export async function GET() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!url || !key) return NextResponse.json({ error: 'Sin credenciales' }, { status: 500 })
  const supabase = createClient(url, key)

  // Señales
  const [{ data: meta }, { data: tn }] = await Promise.all([
    supabase.from('meta_snapshots').select('summary, adsets').order('snapshot_date', { ascending: false }).limit(1).single(),
    supabase.from('tiendanube_snapshots').select('summary_today, summary_7d, summary_30d, summary_mtd').order('snapshot_date', { ascending: false }).limit(1).single(),
  ])

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const s = (meta?.summary || {}) as any
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const adsets = (meta?.adsets || []) as any[]
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const tnToday = (tn?.summary_today || {}) as any
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const tn7d = (tn?.summary_7d || {}) as any
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const tn30 = (tn?.summary_30d || {}) as any
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const tnMtd = (tn?.summary_mtd || {}) as any

  // Ritmo: venta diaria promedio 7d vs hoy (para leer tendencia, no solo el día)
  const avgDaily7d = tn7d?.total_revenue ? tn7d.total_revenue / 7 : null
  const topProducts30 = (tn30?.top_products || []).slice(0, 4).map((p: { name: string; revenue: number }) => `${p.name} (${fmt(p.revenue)})`).join(', ')

  // Adsets problemáticos y ganadores
  const activos = adsets.filter((a) => a.status === 'ACTIVE' && (a.spend || 0) > 0)
  const sobreCPA = activos
    .filter((a) => a.cost_per_result && a.cost_per_result > DEFAULT_BREAKEVEN_CPA && a.optimization_goal === 'OFFSITE_CONVERSIONS')
    .sort((a, b) => (b.spend || 0) - (a.spend || 0)).slice(0, 4)
  const ganadores = activos
    .filter((a) => a.roas && a.roas >= 4).sort((a, b) => (b.roas || 0) - (a.roas || 0)).slice(0, 4)

  const realRoas = tn7d?.total_revenue && s.total_spend_7d ? (tn7d.total_revenue / s.total_spend_7d).toFixed(2) : 'N/A'

  const prompt = `Sos el copiloto ESTRATÉGICO de un ecommerce (marca de indumentaria, Argentina, ARS).
No sos un apagador de incendios: pensás en estructura, tendencia y rentabilidad sostenible, no solo en el número de hoy.
Breakeven CPA ~${fmt(DEFAULT_BREAKEVEN_CPA)}, ROAS mínimo rentable ${DEFAULT_ROAS_MIN}x, target 10x, margen ~53%.

SEÑALES (día → mes):
- Ventas hoy (TN): ${fmt(tnToday?.total_revenue)} · ${tnToday?.total_orders || 0} órdenes
- Ventas 7d: ${fmt(tn7d?.total_revenue)} · ${tn7d?.total_orders || 0} órdenes · AOV ${fmt(tn7d?.aov)} · promedio diario ${fmt(avgDaily7d)}
- Ventas 30d: ${fmt(tn30?.total_revenue)} · MTD: ${fmt(tnMtd?.total_revenue)}
- Gasto Meta 7d: ${fmt(s.total_spend_7d)} · Compras ${s.total_purchases_7d || 0} · CPA ${fmt(s.blended_cpa)} · ROAS pixel ${s.blended_roas || 'N/A'}x
- ROAS REAL 7d (ventas TN / gasto Meta): ${realRoas}x
- Ad sets sobre breakeven (queman margen): ${sobreCPA.length ? sobreCPA.map((a) => `"${a.name}" CPA ${fmt(a.cost_per_result)} gasto ${fmt(a.spend)}`).join(' · ') : 'ninguno'}
- Ad sets ganadores (escalar): ${ganadores.length ? ganadores.map((a) => `"${a.name}" ROAS ${a.roas}x`).join(' · ') : 'ninguno'}
- Top productos 30d: ${topProducts30 || 'N/A'}

Devolvé EXACTAMENTE 3 acciones priorizadas. REGLAS:
1) Al menos UNA debe ser ESTRUCTURAL / de mediano plazo (estructura de campañas, mix de producto, retención/recompra, presupuesto semanal, stock), NO solo del día.
2) Cada acción debe apoyarse en la tendencia (comparar día vs 7d/30d), no en un dato aislado.
3) Concreta y accionable: qué hacer y por qué.
Ordená de mayor a menor prioridad. Respondé SOLO JSON, sin texto extra:
{"actions":[{"priority":"alta|media|baja","title":"acción corta e imperativa","why":"el dato/tendencia que la justifica, 1 oración","action":"el paso concreto a ejecutar","link":"/campanias|/analytics|/recomendaciones|/creativos|/tiendanube|/historico"}]}`

  try {
    const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY })
    const message = await client.messages.create({
      model: 'claude-sonnet-4-6',
      max_tokens: 900,
      messages: [{ role: 'user', content: prompt }],
    })
    const text = message.content[0].type === 'text' ? message.content[0].text : ''
    const jsonMatch = text.match(/\{[\s\S]*\}/)
    if (!jsonMatch) throw new Error('Sin JSON')
    const parsed = JSON.parse(jsonMatch[0]) as { actions: Action[] }
    return NextResponse.json({ actions: (parsed.actions || []).slice(0, 3), generated_at: new Date().toISOString() })
  } catch (e) {
    // Fallback determinístico si la IA falla: reglas simples sobre las señales
    const fallback: Action[] = []
    if (sobreCPA.length) fallback.push({ priority: 'alta', title: `Revisá ${sobreCPA.length} ad set(s) sobre breakeven`, why: `Están gastando con CPA arriba de ${fmt(DEFAULT_BREAKEVEN_CPA)}.`, action: 'Bajá presupuesto o pausá el peor.', link: '/campanias' })
    if (ganadores.length) fallback.push({ priority: 'media', title: `Escalá "${ganadores[0].name}"`, why: `ROAS ${ganadores[0].roas}x, muy por encima del mínimo.`, action: 'Subí el presupuesto 15-20%.', link: '/campanias' })
    fallback.push({ priority: 'baja', title: 'Revisá stock de lo que pauteás', why: 'Evitá gastar en productos por agotarse.', action: 'Mirá la alerta de stock en Analítica.', link: '/analytics' })
    return NextResponse.json({ actions: fallback.slice(0, 3), fallback: true, error: (e as Error).message })
  }
}
