import { svc } from './db'
import { normalizeSettings } from './settings'
import { loadOrders, loadCostIndex, loadAdsDaily, summarizeSales, summarizeAds, buildSummary } from './metrics'
import { loadAdAlerts } from './adAlerts'
import { loadRules, runRules } from './rules'
import { addDays, localDate } from './dates'
import { money, int } from './format'
import { sendWhatsApp, whatsappConfigured } from './whatsapp'

/**
 * Avisos por WhatsApp: un resumen de ayer a la mañana y avisos urgentes (cuenta de Meta, gasto sin ventas)
 * apenas aparecen. Cada aviso se manda una sola vez por día (notify_log).
 */

interface Contact { user_id: string; phone: string; daily: boolean; alerts: boolean }

async function contacts(workspaceId: string): Promise<Contact[]> {
  const { data } = await svc().from('notify_contacts').select('user_id,phone,daily,alerts').eq('workspace_id', workspaceId)
  return (data || []) as Contact[]
}

/** true si el aviso ya se mandó hoy; si no, lo registra. */
async function claim(workspaceId: string, key: string): Promise<boolean> {
  const { error } = await svc().from('notify_log').insert({ workspace_id: workspaceId, key })
  return !error
}

/** Resumen de ayer en una línea larga, pensado para leer en el celular. */
export function dailyText(d: { date: string; orders: number; billing: number; profit: number; spend: number; cpa: number | null; maxCpa: number | null; mtdProfit: number; proposals: number }) {
  const parts = [
    `Ayer ${d.date.slice(8, 10)}/${d.date.slice(5, 7)}: ${int(d.orders)} ${d.orders === 1 ? 'venta' : 'ventas'} por ${money(d.billing)}`,
    `ganancia después de publicidad ${money(d.profit)}`,
    d.spend > 0 ? `inversión ${money(d.spend)}${d.cpa != null ? ` (costo por compra ${money(d.cpa)}${d.maxCpa != null ? d.cpa > d.maxCpa ? ', arriba del máximo' : ', dentro del máximo' : ''})` : ' sin compras'}` : 'sin inversión',
    `mes acumulado ${money(d.mtdProfit)}`,
  ]
  if (d.proposals > 0) parts.push(`${d.proposals} ${d.proposals === 1 ? 'propuesta' : 'propuestas'} de tus reglas para aprobar`)
  return parts.join(' · ')
}

export async function dailySummary(workspaceId: string, now = new Date()): Promise<{ text: string; empty: boolean } | null> {
  const sb = svc()
  const { data: w } = await sb.from('workspaces').select('id,name,timezone,settings').eq('id', workspaceId).single()
  if (!w) return null
  const tz = w.timezone || 'America/Argentina/Buenos_Aires'
  const settings = normalizeSettings(w.settings)
  const [{ data: stores }, { data: accounts }] = await Promise.all([
    sb.from('stores').select('id').eq('workspace_id', w.id).eq('active', true),
    sb.from('ad_accounts').select('id,external_id,protected_ids,connection_id').eq('workspace_id', w.id).eq('active', true),
  ])
  const storeIds = (stores || []).map((s) => s.id)
  const accs = (accounts || []).map((a) => ({ ...a, protected_ids: a.protected_ids || [] }))
  const today = localDate(now, tz)
  const y = addDays(today, -1)
  const mStart = `${today.slice(0, 7)}-01`
  const [orders, idx, ads, { rules }] = await Promise.all([
    loadOrders(storeIds, addDays(y, -13), y, tz), loadCostIndex(storeIds), loadAdsDaily(accs.map((a) => a.id), mStart < addDays(y, -13) ? mStart : addDays(y, -13), y), loadRules(w.id),
  ])
  const on = (a: string, b: string) => orders.filter((o) => { const d = localDate(new Date(o.created_at), tz); return d >= a && d <= b })
  const yS = summarizeSales(on(y, y), tz, idx, settings)
  const yA = summarizeAds(ads.filter((d) => d.date === y))
  const cur = buildSummary(yS, yA, settings)
  const mtd = buildSummary(summarizeSales(on(mStart, y), tz, idx, settings), summarizeAds(ads.filter((d) => d.date >= mStart)), settings)
  const ref = summarizeSales(on(addDays(y, -13), y), tz, idx, settings)
  const maxCpa = ref.orders > 0 ? ref.contribution / ref.orders / (1 + settings.ad_tax_pct / 100) : null
  const proposals = rules.length ? (await runRules(rules, accs, today, maxCpa).catch(() => [])).length : 0
  return {
    empty: yS.orders === 0 && yA.spend === 0,
    text: dailyText({ date: y, orders: yS.orders, billing: yS.netSales + yS.shippingCustomer, profit: cur.profitAfterAds, spend: yA.spend, cpa: yA.purchases > 0 ? yA.spend / yA.purchases : null, maxCpa, mtdProfit: mtd.profitAfterAds, proposals }),
  }
}

/** Avisos urgentes: solo los críticos de la cuenta de Meta. */
export async function urgentAlerts(workspaceId: string): Promise<{ id: string; text: string }[]> {
  const { data: accounts } = await svc().from('ad_accounts').select('id,name,external_id,connection_id').eq('workspace_id', workspaceId).eq('active', true)
  if (!accounts?.length) return []
  const alerts = await loadAdAlerts(accounts)
  return alerts.filter((a) => a.level === 'critical').map((a) => ({ id: a.id, text: `${a.title} (${a.account}). ${a.detail}` }))
}

export interface NotifyResult { workspace: string; sent: number; errors: string[] }

/** Corre para todos los negocios. `kind` daily: a la mañana; alerts: cada sync. */
export async function runNotifications(kind: 'daily' | 'alerts', now = new Date()): Promise<NotifyResult[]> {
  if (!whatsappConfigured()) return []
  const sb = svc()
  const { data: ws } = await sb.from('workspaces').select('id,name,timezone')
  const out: NotifyResult[] = []
  for (const w of ws || []) {
    const cs = (await contacts(w.id)).filter((c) => (kind === 'daily' ? c.daily : c.alerts))
    if (!cs.length) continue
    const tz = w.timezone || 'America/Argentina/Buenos_Aires'
    const today = localDate(now, tz)
    const r: NotifyResult = { workspace: w.name, sent: 0, errors: [] }
    try {
      if (kind === 'daily') {
        // Entre las 8 y las 11 hora local, una vez por día
        const hour = Number(new Intl.DateTimeFormat('en-GB', { timeZone: tz, hour: '2-digit', hour12: false }).format(now))
        if (hour < 8 || hour > 11) continue
        const d = await dailySummary(w.id, now)
        if (!d || d.empty) continue
        if (!(await claim(w.id, `daily:${today}`))) continue
        for (const c of cs) { const s = await sendWhatsApp(c.phone, w.name, d.text); if (s.ok) r.sent++; else r.errors.push(s.error || 'error') }
      } else {
        for (const a of await urgentAlerts(w.id)) {
          if (!(await claim(w.id, `alert:${a.id}:${today}`))) continue
          for (const c of cs) { const s = await sendWhatsApp(c.phone, w.name, `Urgente: ${a.text}`); if (s.ok) r.sent++; else r.errors.push(s.error || 'error') }
        }
      }
    } catch (e) { r.errors.push(e instanceof Error ? e.message : 'error') }
    if (r.sent || r.errors.length) out.push(r)
  }
  return out
}
