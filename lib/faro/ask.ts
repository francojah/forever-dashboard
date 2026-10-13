import type { FaroContext } from './context'
import { AI_MODEL } from './ai'
import { svc } from './db'
import { loadOrders, loadCostIndex, loadAdsDaily, summarizeSales, summarizeAds, buildSummary, dailySeries, type OrderRow } from './metrics'
import { loadAdsTree, flatten } from './adsTree'
import { loadPnL } from './pnl'
import { addDays, localDate, resolvePeriod } from './dates'
import { customerTable, segments, productName } from './insights'
import { loadDiagnosis } from './diagnose'

/**
 * "Preguntale a Faro": arma un paquete compacto con los datos del negocio y deja que el modelo responda
 * en lenguaje natural, citando números del paquete. Puede pedir que se muestre una serie ya calculada.
 */

export interface AskAnswer { respuesta: string; serie?: 'ventas_diarias' | 'ganancia_diaria' | 'inversion_diaria' | 'cpa_diario' | 'resultado_mensual' | 'ninguna'; datos_usados: string[] }
export interface AskResult { answer: AskAnswer; series: { label: string; unit: 'money' | 'int'; points: { x: string; y: number }[] } | null; usage: { input: number; output: number } }

const r0 = (n: number | null | undefined) => (n == null || !isFinite(n) ? null : Math.round(n))
const r2 = (n: number | null | undefined) => (n == null || !isFinite(n) ? null : Math.round(n * 100) / 100)

export async function buildPack(ctx: FaroContext) {
  const tz = ctx.workspace.timezone, s = ctx.workspace.settings
  const today = localDate(new Date(), tz)
  const storeIds = ctx.stores.filter((x) => x.active).map((x) => x.id)
  const accounts = ctx.adAccounts.filter((a) => a.active)
  const accountIds = accounts.map((a) => a.id)
  const from90 = addDays(today, -89)
  const months = Array.from({ length: 6 }, (_, i) => { const d = new Date(Date.UTC(Number(today.slice(0, 4)), Number(today.slice(5, 7)) - 1 - (5 - i), 1)); return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}` })
  const [orders, idx, ads, tree7, tree30, pnl, goals, diag] = await Promise.all([
    loadOrders(storeIds, addDays(today, -365), today, tz), loadCostIndex(storeIds), loadAdsDaily(accountIds, from90, today),
    loadAdsTree(accounts, addDays(today, -7), addDays(today, -1)), loadAdsTree(accounts, addDays(today, -30), addDays(today, -1)),
    loadPnL({ workspaceId: ctx.workspace.id, tz, settings: s, storeIds, accountIds }, months),
    svc().from('goals').select('month,metric,target').eq('workspace_id', ctx.workspace.id).eq('month', today.slice(0, 7)),
    loadDiagnosis(ctx).catch(() => null),
  ])
  const inR = (o: OrderRow, a: string, b: string) => { const d = localDate(new Date(o.created_at), tz); return d >= a && d <= b }
  const per = (a: string, b: string) => buildSummary(summarizeSales(orders.filter((o) => inR(o, a, b)), tz, idx, s), summarizeAds(ads.filter((d) => d.date >= a && d.date <= b)), s)
  const periodo = (label: string, a: string, b: string) => { const p = per(a, b); return { label, desde: a, hasta: b, ventas_netas: r0(p.sales.netSales), facturacion: r0(p.sales.netSales + p.sales.shippingCustomer), ordenes: p.sales.orders, unidades: p.sales.units, ticket: r0(p.sales.orders ? p.sales.netSales / p.sales.orders : null), margen_contribucion_pct: r2(p.sales.netSales ? (p.sales.contribution / p.sales.netSales) * 100 : null), inversion: r0(p.ads.spend), compras_meta: r2(p.ads.purchases), cpa_meta: r0(p.ads.purchases ? p.ads.spend / p.ads.purchases : null), ganancia_despues_publicidad: r0(p.profitAfterAds), mer: r2(p.mer) } }
  const series = dailySeries(resolvePeriod('custom', tz, new Date(), { from: from90, to: today }), orders.filter((o) => inR(o, from90, today)), ads, tz, idx, s)
  const prodUnits = new Map<string, { unidades: number; ventas: number }>()
  for (const o of orders.filter((o) => inR(o, addDays(today, -30), today))) if (o.payment_status === 'paid' && o.status !== 'cancelled') for (const it of o.items) { const k = productName(it.name); const r = prodUnits.get(k) || { unidades: 0, ventas: 0 }; r.unidades += it.qty; r.ventas += it.price * it.qty; prodUnits.set(k, r) }
  const compact = (n: ReturnType<typeof flatten>[number]) => ({ id: n.id, nivel: n.level, nombre: n.name, estado: n.effectiveStatus, presupuesto_diario: n.dailyBudget ?? undefined, gasto: r0(n.m.spend), compras: r2(n.m.purchases), cpa: r0(n.m.purchases ? n.m.spend / n.m.purchases : null), ctr_pct: r2(n.m.impressions ? (n.m.linkClicks / n.m.impressions) * 100 : null), roas: r2(n.m.spend ? n.m.purchaseValue / n.m.spend : null) })
  const segs = segments(customerTable(orders), today)
  return {
    negocio: ctx.workspace.name, hoy: today, moneda: ctx.workspace.currency,
    periodos: [periodo('hoy', today, today), periodo('ayer', addDays(today, -1), addDays(today, -1)), periodo('ultimos_7_dias', addDays(today, -7), addDays(today, -1)), periodo('7_dias_anteriores', addDays(today, -14), addDays(today, -8)), periodo('ultimos_30_dias', addDays(today, -30), addDays(today, -1)), periodo('mes_actual', `${today.slice(0, 7)}-01`, today)],
    meses: pnl.map((p) => ({ mes: p.month, facturacion: r0(p.sales.netSales + p.sales.shippingCustomer), ventas_netas: r0(p.sales.netSales), ordenes: p.sales.orders, mercaderia: r0(p.sales.cogs), envios: r0(p.sales.shippingOwner), comisiones: r0(p.sales.platformFee + p.sales.paymentFees), publicidad: r0(p.ads.spend + p.adTax), fijos: r0(p.fixedTotal + p.extraTotal), ganancia_despues_publicidad: r0(p.profitAfterAds), resultado_operativo: r0(p.operatingResult), cerrado: p.closed })),
    campanias_7d: tree7.map(compact), ad_sets_7d: flatten(tree7).filter((n) => n.level === 'adset' && n.m.spend > 0).map(compact), anuncios_30d: flatten(tree30).filter((n) => n.level === 'ad' && n.m.spend > 0).sort((a, b) => b.m.spend - a.m.spend).slice(0, 25).map(compact),
    productos_30d: Array.from(prodUnits.entries()).sort((a, b) => b[1].ventas - a[1].ventas).slice(0, 20).map(([nombre, v]) => ({ nombre, unidades: v.unidades, ventas_lista: r0(v.ventas) })),
    clientes: { total: segs.reduce((a, x) => Math.max(a, x.customers.length), 0), segmentos: segs.map((x) => ({ segmento: x.label, cantidad: x.customers.length })) },
    objetivos_mes: (goals.data || []), costos_config: { comisiones: s.payment_fees, packaging_por_orden: s.packaging_per_order, iibb_pct: s.iibb_pct, impuestos_pauta_pct: s.ad_tax_pct },
    diagnostico_semana: diag ? { resumen: diag.summary, hallazgos: diag.findings.map((f) => `${f.title}: ${f.detail}`) } : null,
    _series: {
      ventas_diarias: series.map((d) => ({ x: d.date, y: Math.round(d.netSales) })), ganancia_diaria: series.map((d) => ({ x: d.date, y: Math.round(d.profit) })),
      inversion_diaria: series.map((d) => ({ x: d.date, y: Math.round(d.spend) })), cpa_diario: series.filter((d) => d.purchases > 0).map((d) => ({ x: d.date, y: Math.round(d.spend / d.purchases) })),
      resultado_mensual: pnl.map((p) => ({ x: p.month, y: Math.round(p.operatingResult) })),
    },
  }
}

const SCHEMA = {
  type: 'object', additionalProperties: false, required: ['respuesta', 'serie', 'datos_usados'],
  properties: {
    respuesta: { type: 'string', description: 'Respuesta en español rioplatense, directa, con los números que la sostienen. 1 a 4 oraciones, sin listas.' },
    serie: { type: 'string', enum: ['ventas_diarias', 'ganancia_diaria', 'inversion_diaria', 'cpa_diario', 'resultado_mensual', 'ninguna'], description: 'Gráfico que ayuda a ver la respuesta, o ninguna.' },
    datos_usados: { type: 'array', items: { type: 'string' }, description: 'Claves del paquete que usaste (periodos.ultimos_7_dias, meses, ad_sets_7d...).' },
  },
}
const SYSTEM = `Sos Faro, el tablero de un ecommerce. Respondés preguntas del dueño sobre su negocio usando SOLO el paquete de datos (JSON) que recibís.
Reglas: hablá en español rioplatense, con "vos". Sé concreto: citá los números del paquete (pesos con separador de miles, sin decimales). Si la pregunta no se puede responder con el paquete, decilo y sugerí dónde mirar en Faro (Ventas, Anuncios, Finanzas). No inventes datos ni fechas. "Ganancia" es ganancia después de publicidad salvo que pregunten por resultado operativo (que descuenta fijos). "Costo por compra" es el de Meta (inversión ÷ compras de Meta). Nunca recomiendes tocar campañas protegidas.`
const SERIES_LABEL: Record<Exclude<AskAnswer['serie'], undefined | 'ninguna'>, { label: string; unit: 'money' | 'int' }> = {
  ventas_diarias: { label: 'Ventas netas por día', unit: 'money' }, ganancia_diaria: { label: 'Ganancia después de publicidad por día', unit: 'money' }, inversion_diaria: { label: 'Inversión por día', unit: 'money' }, cpa_diario: { label: 'Costo por compra por día', unit: 'money' }, resultado_mensual: { label: 'Resultado operativo por mes', unit: 'money' },
}

export async function ask(ctx: FaroContext, question: string): Promise<AskResult> {
  const key = process.env.ANTHROPIC_API_KEY
  if (!key) throw new Error('Falta configurar ANTHROPIC_API_KEY en Vercel')
  const pack = await buildPack(ctx)
  const { _series, ...data } = pack
  const res = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST', headers: { 'x-api-key': key, 'anthropic-version': '2023-06-01', 'content-type': 'application/json' },
    body: JSON.stringify({ model: AI_MODEL, max_tokens: 6000, system: SYSTEM, output_config: { effort: 'low', format: { type: 'json_schema', schema: SCHEMA } }, messages: [{ role: 'user', content: `Paquete de datos:\n${JSON.stringify(data)}\n\nPregunta: ${question.slice(0, 500)}` }] }),
  })
  const j = await res.json().catch(() => ({}))
  if (!res.ok) throw new Error(j?.error?.message || `Error de la IA (${res.status})`)
  const text = ((j.content || []) as { type: string; text?: string }[]).filter((b) => b.type === 'text').map((b) => b.text || '').join('')
  let answer: AskAnswer
  try { answer = JSON.parse(text) } catch { const m = text.match(/\{[\s\S]*\}/); answer = m ? JSON.parse(m[0]) : { respuesta: text, serie: 'ninguna', datos_usados: [] } }
  const serie = answer.serie && answer.serie !== 'ninguna' ? answer.serie : null
  return { answer, series: serie ? { ...SERIES_LABEL[serie], points: _series[serie] } : null, usage: { input: j.usage?.input_tokens || 0, output: j.usage?.output_tokens || 0 } }
}
