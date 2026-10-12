import type { TreeNode } from './adsTree'
import { loadAdsTree, loadFrequency, flatten } from './adsTree'
import { addDays } from './dates'
import { svc } from './db'
import { money } from './format'

/**
 * Reglas automáticas que PROPONEN cambios. Nunca se aplican solas: cada propuesta va a la lista de
 * cambios pendientes y se publica solo si alguien la aprueba. No tocan entidades protegidas.
 */

export type RuleMetric = 'cpa_over_max' | 'no_purchases' | 'cpa_under' | 'frequency_over' | 'ctr_under'
export type RuleAction = 'pause' | 'budget_down' | 'budget_up' | 'notify'
export type RuleLevel = 'campaign' | 'adset' | 'ad'

export interface Rule {
  id: string
  name: string
  active: boolean
  level: RuleLevel
  metric: RuleMetric
  threshold: number | null
  days: number
  action: RuleAction
  action_pct: number | null
}

export interface Proposal {
  ruleId: string
  ruleName: string
  nodeId: string
  level: RuleLevel
  name: string
  action: RuleAction
  field: 'status' | 'daily_budget' | null
  from: unknown
  to: unknown
  reason: string
}

export const METRICS: Record<RuleMetric, { label: string; unit: string; help: string; def: number }> = {
  cpa_over_max: { label: 'Costo por compra arriba del máximo', unit: '% del máximo', help: 'Ej. 150 = el costo por compra supera 1,5 veces tu costo máximo.', def: 150 },
  no_purchases: { label: 'Gastó sin vender', unit: '% del máximo', help: 'Ej. 150 = gastó 1,5 veces tu costo máximo sin ninguna compra.', def: 150 },
  cpa_under: { label: 'Costo por compra bajo (ganador)', unit: '% del máximo', help: 'Ej. 70 = el costo por compra está 30% debajo del máximo, con al menos 3 compras.', def: 70 },
  frequency_over: { label: 'Frecuencia alta', unit: 'veces', help: 'Ej. 3,5 = cada persona vio el anuncio más de 3,5 veces en el período.', def: 3.5 },
  ctr_under: { label: 'CTR bajo', unit: '%', help: 'Ej. 0,8 = menos de 0,8% de clics sobre impresiones (con al menos 2.000 impresiones).', def: 0.8 },
}

export const ACTIONS: Record<RuleAction, string> = {
  pause: 'Pausar', budget_down: 'Bajar presupuesto', budget_up: 'Subir presupuesto', notify: 'Solo avisar',
}

export const TEMPLATES: Omit<Rule, 'id'>[] = [
  { name: 'Cortar ad sets caros', active: true, level: 'adset', metric: 'cpa_over_max', threshold: 150, days: 3, action: 'budget_down', action_pct: 20 },
  { name: 'Pausar anuncios que no venden', active: true, level: 'ad', metric: 'no_purchases', threshold: 150, days: 3, action: 'pause', action_pct: null },
  { name: 'Escalar ganadores', active: true, level: 'adset', metric: 'cpa_under', threshold: 70, days: 3, action: 'budget_up', action_pct: 15 },
  { name: 'Avisar frecuencia alta', active: true, level: 'adset', metric: 'frequency_over', threshold: 3.5, days: 7, action: 'notify', action_pct: null },
]

export function normalizeRule(raw: Record<string, unknown>): Omit<Rule, 'id'> | string {
  const level = String(raw.level || 'adset') as RuleLevel
  const metric = String(raw.metric || '') as RuleMetric
  const action = String(raw.action || '') as RuleAction
  if (!['campaign', 'adset', 'ad'].includes(level)) return 'Nivel inválido'
  if (!(metric in METRICS)) return 'Condición inválida'
  if (!(action in ACTIONS)) return 'Acción inválida'
  if (level === 'ad' && (action === 'budget_down' || action === 'budget_up')) return 'Los anuncios no tienen presupuesto: elegí pausar o avisar'
  const threshold = Number(raw.threshold)
  const days = Math.round(Number(raw.days) || 3)
  const pct = raw.action_pct == null ? null : Math.round(Number(raw.action_pct))
  if (!Number.isFinite(threshold) || threshold <= 0) return 'El umbral tiene que ser mayor a 0'
  if (days < 1 || days > 14) return 'Los días van de 1 a 14'
  if ((action === 'budget_down' || action === 'budget_up') && (!pct || pct < 1 || pct > 50)) return 'El porcentaje va de 1 a 50'
  const name = String(raw.name || '').trim().slice(0, 80) || METRICS[metric].label
  return { name, active: raw.active !== false, level, metric, threshold, days, action, action_pct: pct }
}

const ctr = (n: TreeNode) => (n.m.impressions > 0 ? (n.m.linkClicks / n.m.impressions) * 100 : 0)

/** Evalúa una regla sobre los nodos del período de la regla. Función pura (testeable). */
export function evaluateRule(rule: Rule, nodes: TreeNode[], maxCpa: number | null): Proposal[] {
  const out: Proposal[] = []
  const t = Number(rule.threshold) || METRICS[rule.metric].def
  for (const n of nodes) {
    if (n.level !== rule.level) continue
    if (n.protected) continue
    if (n.effectiveStatus !== 'ACTIVE') continue
    const cpa = n.m.purchases > 0 ? n.m.spend / n.m.purchases : null
    let hit: string | null = null
    switch (rule.metric) {
      case 'cpa_over_max':
        if (maxCpa && cpa != null && cpa > maxCpa * (t / 100)) hit = `costo por compra ${money(cpa)} vs máximo ${money(maxCpa)}`
        break
      case 'no_purchases':
        if (maxCpa && n.m.purchases === 0 && n.m.spend >= maxCpa * (t / 100)) hit = `gastó ${money(n.m.spend)} sin compras`
        break
      case 'cpa_under':
        if (maxCpa && cpa != null && n.m.purchases >= 3 && cpa < maxCpa * (t / 100)) hit = `costo por compra ${money(cpa)} con ${n.m.purchases} compras`
        break
      case 'frequency_over':
        if (n.frequency != null && n.frequency > t) hit = `frecuencia ${n.frequency.toFixed(1)}`
        break
      case 'ctr_under':
        if (n.m.impressions >= 2000 && ctr(n) < t) hit = `CTR ${ctr(n).toFixed(2)}%`
        break
    }
    if (!hit) continue
    const reason = `${hit} en los últimos ${rule.days} días`
    const base = { ruleId: rule.id, ruleName: rule.name, nodeId: n.id, level: n.level, name: n.name, action: rule.action, reason }
    if (rule.action === 'pause') out.push({ ...base, field: 'status', from: n.status, to: 'PAUSED' })
    else if (rule.action === 'budget_down' || rule.action === 'budget_up') {
      if (!n.dailyBudget) { out.push({ ...base, action: 'notify', field: null, from: null, to: null, reason: `${reason} (el presupuesto está en otro nivel)` }); continue }
      const pct = (Number(rule.action_pct) || 15) / 100
      const to = Math.round(n.dailyBudget * (rule.action === 'budget_up' ? 1 + pct : 1 - pct))
      out.push({ ...base, field: 'daily_budget', from: n.dailyBudget, to })
    } else out.push({ ...base, field: null, from: null, to: null })
  }
  return out
}

/** Une propuestas: un nodo recibe una sola propuesta por campo (gana pausar sobre presupuesto). */
export function mergeProposals(list: Proposal[]): Proposal[] {
  const rank = (p: Proposal) => (p.action === 'pause' ? 0 : p.action === 'budget_down' ? 1 : p.action === 'budget_up' ? 2 : 3)
  const seen = new Map<string, Proposal>()
  for (const p of [...list].sort((a, b) => rank(a) - rank(b))) {
    const key = p.field ? `${p.nodeId}:act` : `${p.nodeId}:${p.ruleId}`
    if (!seen.has(key)) seen.set(key, p)
  }
  return Array.from(seen.values())
}

export async function loadRules(workspaceId: string): Promise<{ rules: Rule[]; missing: boolean }> {
  const { data, error } = await svc().from('ad_rules').select('id,name,active,level,metric,threshold,days,action,action_pct').eq('workspace_id', workspaceId).order('created_at')
  if (error) return { rules: [], missing: /does not exist|Could not find/i.test(error.message) }
  return { rules: (data || []).map((r) => ({ ...r, threshold: r.threshold == null ? null : Number(r.threshold), action_pct: r.action_pct == null ? null : Number(r.action_pct) })) as Rule[], missing: false }
}

/** Corre las reglas activas sobre los últimos días completos (sin hoy). */
export async function runRules(
  rules: Rule[],
  accounts: { id: string; external_id: string; protected_ids: string[]; connection_id: string | null }[],
  today: string, maxCpa: number | null,
): Promise<Proposal[]> {
  const active = rules.filter((r) => r.active)
  if (!active.length || !accounts.length) return []
  const byDays = new Map<number, Rule[]>()
  for (const r of active) byDays.set(r.days, [...(byDays.get(r.days) || []), r])
  const all: Proposal[] = []
  await Promise.all(Array.from(byDays.entries()).map(async ([days, rs]) => {
    const from = addDays(today, -days), to = addDays(today, -1)
    const [tree, freq] = await Promise.all([
      loadAdsTree(accounts, from, to),
      rs.some((r) => r.metric === 'frequency_over') ? loadFrequency(accounts, from, to) : Promise.resolve(new Map<string, number>()),
    ])
    const nodes = flatten(tree)
    for (const n of nodes) if (n.level === 'adset') n.frequency = freq.get(n.id) ?? null
    for (const r of rs) all.push(...evaluateRule(r, nodes, maxCpa))
  }))
  return mergeProposals(all)
}
