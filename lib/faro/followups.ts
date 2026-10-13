import { svc, fetchAll } from './db'
import { addDays, localDate } from './dates'
import { money, int } from './format'

/**
 * Seguimiento de decisiones: cuando se aprueba un cambio en Meta (pausa, presupuesto) Faro agenda una
 * revisión a los 7 días y compara la semana anterior con la semana posterior de esa campaña, ad set o anuncio.
 */

export interface FollowupRow {
  id: string; kind: string; level: string | null; entity_id: string | null; entity_name: string | null; field: string | null
  from_value: unknown; to_value: unknown; applied_at: string; check_at: string
  result: { before: Win; after: Win; verdict: 'mejor' | 'peor' | 'igual' | 'sin_datos'; text: string } | null
  seen_at: string | null
}
export interface Win { spend: number; purchases: number; cpa: number | null; days: number }

export async function scheduleFollowup(workspaceId: string, c: { changeId?: string; level: string; entityId: string; entityName: string; field: string; from: unknown; to: unknown }, days = 7) {
  if (!['status', 'daily_budget'].includes(c.field)) return
  const check = addDays(new Date().toISOString().slice(0, 10), days)
  await svc().from('decision_followups').insert({ workspace_id: workspaceId, kind: 'change', ref_id: c.changeId || null, level: c.level, entity_id: c.entityId, entity_name: c.entityName, field: c.field, from_value: c.from as object, to_value: c.to as object, check_at: check }).then(() => null, () => null)
}

async function window(accountIds: string[], level: string, id: string, from: string, to: string): Promise<Win> {
  const col = level === 'campaign' ? 'campaign_id' : level === 'adset' ? 'adset_id' : 'ad_id'
  const rows = await fetchAll<{ date: string; spend: number; purchases: number }>((a, b) => svc().from('ad_insights_daily').select('date,spend,purchases').in('ad_account_id', accountIds).eq(col, id).gte('date', from).lte('date', to).range(a, b))
  const spend = rows.reduce((s, r) => s + (Number(r.spend) || 0), 0), purchases = rows.reduce((s, r) => s + (Number(r.purchases) || 0), 0)
  return { spend, purchases, cpa: purchases > 0 ? spend / purchases : null, days: new Set(rows.map((r) => r.date)).size }
}

/** Evalúa el resultado de una decisión. Pura: testeable. */
export type Verdict = 'mejor' | 'peor' | 'igual' | 'sin_datos'
export function judge(f: Pick<FollowupRow, 'field' | 'to_value' | 'entity_name'>, before: Win, after: Win): { verdict: Verdict; text: string } {
  const name = f.entity_name || 'la entidad'
  if (f.field === 'status' && f.to_value === 'PAUSED') {
    const text = `Pausaste "${name}". Antes gastaba ${money(before.spend)} por semana con ${int(before.purchases)} compras${before.cpa ? ` (${money(before.cpa)} cada una)` : ''}; después, ${after.spend > 0 ? `siguió gastando ${money(after.spend)}` : 'no gastó más'}.`
    return { verdict: after.spend === 0 ? (before.cpa == null || before.purchases === 0 ? 'mejor' : 'igual') : 'sin_datos', text }
  }
  if (before.days < 3 || after.days < 3) return { verdict: 'sin_datos', text: `Todavía no hay suficientes días para comparar "${name}".` }
  if (f.field === 'daily_budget') {
    const dir = Number(f.to_value) > 0 ? (after.spend > before.spend ? 'subiste' : 'bajaste') : 'cambiaste'
    const dPur = after.purchases - before.purchases
    const cpaTxt = before.cpa && after.cpa ? `; costo por compra de ${money(before.cpa)} a ${money(after.cpa)}` : ''
    const better = before.cpa && after.cpa ? (after.cpa <= before.cpa * 1.1 && after.purchases >= before.purchases * 0.9) : dPur >= 0
    const worse = before.cpa && after.cpa ? after.cpa > before.cpa * 1.25 || after.purchases < before.purchases * 0.7 : dPur < 0
    return { verdict: worse ? 'peor' : better ? 'mejor' : 'igual', text: `Le ${dir} el presupuesto a "${name}". Compras por semana: ${int(before.purchases)} → ${int(after.purchases)}${cpaTxt}. ${worse ? 'No funcionó: conviene volver atrás.' : better ? 'Funcionó: podés sostenerlo.' : 'Cambió poco: dale una semana más o probá otra cosa.'}` }
  }
  if (f.field === 'status') {
    return { verdict: after.purchases > 0 && (after.cpa == null || before.cpa == null || after.cpa <= before.cpa * 1.1) ? 'mejor' : after.purchases === 0 && after.spend > 0 ? 'peor' : 'igual', text: `Activaste "${name}". En la semana trajo ${int(after.purchases)} compras con ${money(after.spend)}${after.cpa ? ` (${money(after.cpa)} cada una)` : ''}.` }
  }
  return { verdict: 'sin_datos', text: `Cambio en "${name}" registrado.` }
}

/** Resuelve los seguimientos vencidos de un negocio. */
export async function resolveFollowups(workspaceId: string, accountIds: string[], today: string): Promise<number> {
  const { data } = await svc().from('decision_followups').select('*').eq('workspace_id', workspaceId).is('result', null).lte('check_at', today).limit(50)
  let n = 0
  for (const f of (data || []) as FollowupRow[]) {
    if (f.kind === 'event') {
      await svc().from('decision_followups').update({ result: { before: { spend: 0, purchases: 0, cpa: null, days: 0 }, after: { spend: 0, purchases: 0, cpa: null, days: 0 }, verdict: 'sin_datos', text: `Terminó "${f.entity_name}". El antes, durante y después ya está en Finanzas → Objetivos y promos.` } }).eq('id', f.id)
      n++; continue
    }
    if (!f.entity_id || !f.level) continue
    const applied = f.applied_at.slice(0, 10)
    const before = await window(accountIds, f.level, f.entity_id, addDays(applied, -7), addDays(applied, -1))
    const after = await window(accountIds, f.level, f.entity_id, addDays(applied, 1), addDays(applied, 7))
    const j = judge(f, before, after)
    await svc().from('decision_followups').update({ result: { before, after, ...j } }).eq('id', f.id)
    n++
  }
  return n
}

export async function pendingFollowups(workspaceId: string, tz: string): Promise<{ resolved: FollowupRow[]; upcoming: FollowupRow[] }> {
  const today = localDate(new Date(), tz)
  const { data, error } = await svc().from('decision_followups').select('*').eq('workspace_id', workspaceId).is('seen_at', null).order('check_at').limit(30)
  if (error) return { resolved: [], upcoming: [] }
  const rows = (data || []) as FollowupRow[]
  return { resolved: rows.filter((r) => r.result), upcoming: rows.filter((r) => !r.result && r.check_at > today) }
}
