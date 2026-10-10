import { svc } from './db'
import type { FaroContext } from './context'
import { loadAdsTree, TreeNode } from './adsTree'
import { loadUnitEconomics } from './economics'
import { loadFunnel, funnelSteps } from './funnel'
import { loadOrders, loadCostIndex, summarizeSales } from './metrics'
import { addDays, localDate, resolvePeriod } from './dates'
import type { StoreRow } from './tiendanube'
import { suggestActions } from './actions'

export const AI_MODEL = process.env.FARO_AI_MODEL || 'claude-sonnet-5-5'
export const aiConfigured = () => !!process.env.ANTHROPIC_API_KEY

export interface AiAction {
  tipo: 'escalar' | 'bajar' | 'pausar' | 'estructura' | 'creativos' | 'web' | 'oferta' | 'medicion'
  prioridad: 1 | 2 | 3
  titulo: string
  por_que: string
  como: string[]
  impacto: string
  riesgo: string
  objetivo?: { nivel: 'campaign' | 'adset' | 'ad'; id: string; nombre: string } | null
}
export interface AiReport { resumen: string; acciones: AiAction[]; publicar: string[]; no_tocar: string[] }

const r1 = (n: number | null | undefined, d = 0) => (n == null || !isFinite(n) ? null : Math.round(n * 10 ** d) / 10 ** d)
const div = (a: number, b: number) => (b > 0 ? a / b : null)

function compact(n: TreeNode, n30: Map<string, TreeNode>) {
  const m = n.m, m30 = n30.get(n.id)?.m
  return {
    id: n.id, nombre: n.name, estado: n.effectiveStatus, protegido: n.protected || undefined,
    objetivo: n.objective || n.optimizationGoal || undefined,
    presupuesto_diario: n.dailyBudget ?? undefined,
    '7d': { gasto: r1(m.spend), compras: r1(m.purchases, 1), cpa: r1(div(m.spend, m.purchases)), roas: r1(div(m.purchaseValue, m.spend), 2), ctr: r1((div(m.linkClicks, m.impressions) ?? 0) * 100, 2), cpm: r1(div(m.spend * 1000, m.impressions)), carrito_por_visita: r1((div(m.atc, m.lpv) ?? 0) * 100, 1), hook: m.video3s > 0 ? r1((div(m.video3s, m.impressions) ?? 0) * 100, 1) : undefined },
    '30d': m30 ? { gasto: r1(m30.spend), compras: r1(m30.purchases, 1), cpa: r1(div(m30.spend, m30.purchases)), roas: r1(div(m30.purchaseValue, m30.spend), 2) } : undefined,
  }
}

/** Foto del negocio y de la cuenta, compacta, para que el modelo razone con datos reales. */
export async function buildSnapshot(ctx: FaroContext) {
  const tz = ctx.workspace.timezone
  const today = localDate(new Date(), tz)
  const accounts = ctx.adAccounts.filter((a) => a.active)
  const stores = ctx.stores.filter((s) => s.active)
  const [tree7, tree30, econ, funnel, orders60, idx] = await Promise.all([
    loadAdsTree(accounts, addDays(today, -7), addDays(today, -1)),
    loadAdsTree(accounts, addDays(today, -30), addDays(today, -1)),
    loadUnitEconomics(ctx, 30),
    loadFunnel({ stores: stores as unknown as StoreRow[], accountIds: accounts.map((a) => a.id), tz, period: resolvePeriod('30d', tz) }),
    loadOrders(stores.map((s) => s.id), addDays(today, -60), addDays(today, -1), tz),
    loadCostIndex(stores.map((s) => s.id)),
  ])
  const by30 = new Map<string, TreeNode>()
  const walk = (l: TreeNode[]) => l.forEach((n) => { by30.set(n.id, n); walk(n.children) })
  walk(tree30)
  const cut = addDays(today, -30)
  const last30 = summarizeSales(orders60.filter((o) => localDate(new Date(o.created_at), tz) >= cut), tz, idx, ctx.workspace.settings)
  const prev30 = summarizeSales(orders60.filter((o) => localDate(new Date(o.created_at), tz) < cut), tz, idx, ctx.workspace.settings)
  const steps = funnelSteps(funnel.cur, funnel.prev)
  const restock = (await suggestActions({ accountIds: [], tree7d: [], today, maxCpa: null, stores, orders14d: orders60.filter((o) => localDate(new Date(o.created_at), tz) >= addDays(today, -14)), tz }))
    .filter((a) => a.kind === 'restock').slice(0, 8).map((a) => `${a.title}: ${a.reason}`)

  const campaigns = tree7.filter((c) => c.m.spend > 0 || c.effectiveStatus === 'ACTIVE').slice(0, 25).map((c) => ({
    ...compact(c, by30),
    adsets: c.children.filter((s) => s.m.spend > 0 || s.effectiveStatus === 'ACTIVE').slice(0, 12).map((s) => ({
      ...compact(s, by30),
      anuncios: s.children.filter((a) => a.m.spend > 0).slice(0, 6).map((a) => ({ ...compact(a, by30), video: a.isVideo || undefined, texto: a.copy?.body?.slice(0, 140) || undefined })),
      anuncios_activos: s.children.filter((a) => a.effectiveStatus === 'ACTIVE').length,
    })),
  }))

  return {
    fecha: today,
    moneda: ctx.workspace.currency,
    negocio: {
      ventas_netas_30d: r1(last30.netSales), ventas_netas_30d_previos: r1(prev30.netSales),
      ordenes_30d: last30.orders, ordenes_30d_previos: prev30.orders,
      ticket_promedio: r1(econ.aov), margen_contribucion_pct: r1((econ.contributionPct ?? 0) * 100, 1),
      ganancia_por_orden_antes_de_pauta: r1(econ.contributionPerOrder),
      costo_por_compra_maximo: r1(econ.maxCpa), mer_equilibrio: r1(econ.breakevenMer, 2),
      inversion_pauta_30d_con_impuestos: r1(econ.adSpend), mer_30d: r1(div(last30.netSales, econ.adSpend), 2),
      costos_fijos_mensuales: r1(econ.fixedMonthly),
    },
    embudo_30d: Object.fromEntries([...steps.ads, ...steps.store].filter((s) => s.rate != null).map((s) => [s.label, { conversion_pct: r1((s.rate ?? 0) * 100, 1), antes_pct: r1((s.prevRate ?? 0) * 100, 1), referencia_pct: s.ref ? s.ref.map((x) => r1(x * 100, 1)) : undefined }])),
    carritos_abandonados_30d: { cantidad: funnel.cur.store.abandoned, monto: r1(funnel.cur.store.abandonedValue) },
    stock_en_riesgo: restock,
    campanias: campaigns,
  }
}

const SYSTEM = `Sos el media buyer senior de un ecommerce argentino de indumentaria que vende por Tiendanube y pauta en Meta. Recibís una foto de datos reales (JSON) y devolvés un plan de acción concreto.

Reglas:
- Basate solo en los datos. Citá números en cada "por_que" (gasto, compras, costo por compra contra el máximo, ROAS, CTR, días).
- El costo por compra máximo rentable es "costo_por_compra_maximo". Escalar solo lo que está claramente por debajo, con al menos 5 compras en 7 días.
- Cambios de presupuesto de a 15-20% como máximo por vez: más reinicia el aprendizaje.
- Nunca propongas pausar, cambiar presupuesto, segmentación ni sumar anuncios a lo marcado "protegido": a lo sumo sugerí crear algo aparte para testear. Listalo en "no_tocar".
- Evitá fragmentar el presupuesto en muchos ad sets chicos: preferí consolidar y testear creativos dentro de estructuras que ya funcionan o en un único ad set de testeo.
- Con pocos datos (gasto menor a un costo por compra máximo) decí que hay que esperar, no pausar.
- Mirá el embudo: si el problema está en la web o el checkout, decilo aunque no sea de anuncios.
- "publicar": ideas concretas de creativos o ángulos a producir esta semana, apoyadas en lo que mejor rinde (formato, gancho, producto).
- Máximo 7 acciones, ordenadas por impacto. Español rioplatense, claro y directo, sin relleno.`

/** Esquema del plan (salida estructurada: el JSON viene garantizado con esta forma). */
const PLAN_SCHEMA = {
  type: 'object',
  additionalProperties: false,
  required: ['resumen', 'acciones', 'publicar', 'no_tocar'],
  properties: {
    resumen: { type: 'string', description: 'Diagnóstico en 2-3 oraciones' },
    acciones: {
      type: 'array',
      items: {
        type: 'object',
        additionalProperties: false,
        required: ['tipo', 'prioridad', 'titulo', 'por_que', 'como', 'impacto', 'riesgo', 'objetivo_id', 'objetivo_nombre'],
        properties: {
          tipo: { type: 'string', enum: ['escalar', 'bajar', 'pausar', 'estructura', 'creativos', 'web', 'oferta', 'medicion'] },
          prioridad: { type: 'integer', description: '1 urgente, 2 importante, 3 cuando se pueda' },
          titulo: { type: 'string' },
          por_que: { type: 'string' },
          como: { type: 'array', items: { type: 'string' } },
          impacto: { type: 'string' },
          riesgo: { type: 'string' },
          objetivo_id: { type: 'string', description: 'id de la campaña, ad set o anuncio afectado; vacío si no aplica' },
          objetivo_nombre: { type: 'string', description: 'nombre del objetivo; vacío si no aplica' },
        },
      },
    },
    publicar: { type: 'array', items: { type: 'string' } },
    no_tocar: { type: 'array', items: { type: 'string' } },
  },
}

export async function runAdvisor(ctx: FaroContext, userId: string | null): Promise<{ report: AiReport; usage: { input: number; output: number }; createdAt: string }> {
  const key = process.env.ANTHROPIC_API_KEY
  if (!key) throw new Error('Falta configurar ANTHROPIC_API_KEY en Vercel')
  const snapshot = await buildSnapshot(ctx)
  const res = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: { 'x-api-key': key, 'anthropic-version': '2023-06-01', 'content-type': 'application/json' },
    body: JSON.stringify({
      model: AI_MODEL,
      // El razonamiento del modelo también cuenta acá: con poco margen se queda sin espacio para el plan
      max_tokens: 16000,
      system: SYSTEM,
      output_config: { effort: 'medium', format: { type: 'json_schema', schema: PLAN_SCHEMA } },
      messages: [{ role: 'user', content: `Datos del negocio "${ctx.workspace.name}":\n${JSON.stringify(snapshot)}` }],
    }),
  })
  const j = await res.json().catch(() => ({}))
  if (!res.ok) throw new Error(j?.error?.message || `Error de la IA (${res.status})`)
  const content = (j.content || []) as { type: string; text?: string }[]
  const text = content.filter((b) => b.type === 'text').map((b) => b.text || '').join('')
  let raw: (Omit<AiReport, 'acciones'> & { acciones: (AiAction & { objetivo_id?: string; objetivo_nombre?: string })[] }) | undefined
  try { raw = JSON.parse(text) } catch {
    const m = text.match(/\{[\s\S]*\}/)
    try { raw = m ? JSON.parse(m[0]) : undefined } catch { raw = undefined }
  }
  if (!raw?.acciones) {
    const why = j.stop_reason === 'max_tokens' ? 'se quedó sin espacio para responder' : j.stop_reason === 'refusal' ? 'se negó a responder' : `respuesta inesperada (${j.stop_reason || 'sin motivo'})`
    throw new Error(`La IA no devolvió un plan: ${why}`)
  }
  const report: AiReport = {
    ...raw,
    acciones: raw.acciones.map((a) => ({
      ...a,
      prioridad: (Math.min(3, Math.max(1, Number(a.prioridad) || 2)) as 1 | 2 | 3),
      objetivo: a.objetivo_id ? { nivel: 'adset', id: a.objetivo_id, nombre: a.objetivo_nombre || a.objetivo_id } : null,
    })),
  }
  const usage = { input: j.usage?.input_tokens || 0, output: j.usage?.output_tokens || 0 }
  const createdAt = new Date().toISOString()
  // Guardar el último análisis (si la tabla existe)
  await svc().from('ai_reports').insert({ workspace_id: ctx.workspace.id, created_by: userId, model: AI_MODEL, report, usage }).then(() => null, () => null)
  return { report, usage, createdAt }
}

export async function lastReport(workspaceId: string): Promise<{ report: AiReport; createdAt: string } | null> {
  const { data, error } = await svc().from('ai_reports').select('report,created_at').eq('workspace_id', workspaceId).order('created_at', { ascending: false }).limit(1).maybeSingle()
  if (error || !data) return null
  return { report: data.report as AiReport, createdAt: data.created_at as string }
}
