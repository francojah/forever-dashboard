import { svc } from './db'
import { normalizeSettings } from './settings'
import { loadOrders, loadCostIndex, loadAdsDaily, summarizeSales, summarizeAds, buildSummary, type PeriodSummary } from './metrics'
import { loadAdsTree, flatten, type TreeNode } from './adsTree'
import { loadRules, runRules } from './rules'
import { addDays, localDate } from './dates'
import { money, int, pct } from './format'

/**
 * Resumen semanal por mail: últimos 7 días completos contra los 7 anteriores. Ventas, ganancia,
 * inversión, anuncios que mejor y peor anduvieron, y lo que proponen las reglas.
 */

export interface WeeklyData {
  workspace: string
  from: string; to: string
  cur: PeriodSummary; prev: PeriodSummary
  best: TreeNode[]; worst: TreeNode[]
  maxCpa: number | null
  proposals: number
}

/** `weekEnd` (YYYY-MM-DD): último día de la semana a resumir; por defecto, ayer. */
export async function loadWeekly(workspaceId: string, now = new Date(), weekEnd?: string): Promise<WeeklyData | null> {
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
  if (!storeIds.length && !accs.length) return null
  const today = localDate(now, tz)
  const to = weekEnd && /^\d{4}-\d{2}-\d{2}$/.test(weekEnd) && weekEnd < today ? weekEnd : addDays(today, -1)
  const from = addDays(to, -6)
  const pTo = addDays(from, -1), pFrom = addDays(from, -7)
  const [orders, idx, ads, tree, { rules }] = await Promise.all([
    loadOrders(storeIds, pFrom, to, tz),
    loadCostIndex(storeIds),
    loadAdsDaily(accs.map((a) => a.id), pFrom, to),
    loadAdsTree(accs, from, to),
    loadRules(w.id),
  ])
  const inR = (d: string, a: string, b: string) => d >= a && d <= b
  const ord = (a: string, b: string) => orders.filter((o) => inR(localDate(new Date(o.created_at), tz), a, b))
  const curSales = summarizeSales(ord(from, to), tz, idx, settings)
  const cur = buildSummary(curSales, summarizeAds(ads.filter((d) => inR(d.date, from, to))), settings)
  const prev = buildSummary(summarizeSales(ord(pFrom, pTo), tz, idx, settings), summarizeAds(ads.filter((d) => inR(d.date, pFrom, pTo))), settings)
  const maxCpa = curSales.orders > 0 ? curSales.contribution / curSales.orders / (1 + settings.ad_tax_pct / 100) : null
  const adsList = flatten(tree).filter((n) => n.level === 'ad' && n.m.spend > 0)
  const cpa = (n: TreeNode) => (n.m.purchases > 0 ? n.m.spend / n.m.purchases : Infinity)
  const minSpend = adsList.reduce((a, n) => a + n.m.spend, 0) * 0.03
  const best = adsList.filter((n) => n.m.purchases >= 2 && n.m.spend >= minSpend).sort((a, b) => cpa(a) - cpa(b)).slice(0, 3)
  const worst = adsList.filter((n) => !best.includes(n) && n.m.spend >= minSpend && (maxCpa == null || cpa(n) > maxCpa)).sort((a, b) => b.m.spend - a.m.spend).slice(0, 3)
  const proposals = rules.length ? (await runRules(rules, accs, today, maxCpa).catch(() => [])).length : 0
  return { workspace: w.name, from, to, cur, prev, best, worst, maxCpa, proposals }
}

const esc = (s: string) => s.replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]!))
const dd = (d: string) => `${d.slice(8, 10)}/${d.slice(5, 7)}`

function delta(cur: number, prev: number, better: 'up' | 'down' = 'up') {
  if (!prev) return { t: '', color: '#5b6b80' }
  const ch = (cur - prev) / Math.abs(prev)
  const good = better === 'up' ? ch >= 0 : ch <= 0
  return { t: `${ch >= 0 ? '+' : '−'}${Math.abs(Math.round(ch * 100))}%`, color: Math.abs(ch) < 0.03 ? '#5b6b80' : good ? '#1f8a5b' : '#c2413a' }
}

export function renderWeekly(d: WeeklyData, appUrl: string): { subject: string; html: string; text: string } {
  const c = d.cur, p = d.prev
  const rows: [string, string, ReturnType<typeof delta>][] = [
    ['Facturación', money(c.sales.netSales + c.sales.shippingCustomer), delta(c.sales.netSales + c.sales.shippingCustomer, p.sales.netSales + p.sales.shippingCustomer)],
    ['Órdenes', int(c.sales.orders), delta(c.sales.orders, p.sales.orders)],
    ['Inversión en anuncios', money(c.adCost), delta(c.adCost, p.adCost, 'down')],
    ['Ganancia después de publicidad', money(c.profitAfterAds), delta(c.profitAfterAds, p.profitAfterAds)],
    ['Costo por compra (Meta)', c.ads.purchases ? money(c.ads.spend / c.ads.purchases) : '—', delta(c.ads.purchases ? c.ads.spend / c.ads.purchases : 0, p.ads.purchases ? p.ads.spend / p.ads.purchases : 0, 'down')],
  ]
  const adRow = (n: TreeNode) => `<tr><td style="padding:6px 0;font-size:14px;color:#13233a">${esc(n.name)}</td><td style="padding:6px 0;font-size:14px;text-align:right;color:#13233a">${money(n.m.spend)}</td><td style="padding:6px 0 6px 12px;font-size:14px;text-align:right;color:#13233a">${n.m.purchases ? money(n.m.spend / n.m.purchases) : 'sin compras'}</td></tr>`
  const adTable = (title: string, list: TreeNode[]) => list.length ? `<h3 style="font-size:15px;margin:22px 0 6px;color:#13233a">${title}</h3><table width="100%" cellpadding="0" cellspacing="0"><tr><td style="font-size:12px;color:#5b6b80">Anuncio</td><td style="font-size:12px;color:#5b6b80;text-align:right">Gasto</td><td style="font-size:12px;color:#5b6b80;text-align:right">Costo/compra</td></tr>${list.map(adRow).join('')}</table>` : ''
  const subject = `Faro · ${d.workspace}: ${money(c.profitAfterAds)} de ganancia del ${dd(d.from)} al ${dd(d.to)}`
  const html = `<!doctype html><html><body style="margin:0;background:#eef2f5;font-family:-apple-system,Segoe UI,Roboto,Helvetica,Arial,sans-serif">
<table width="100%" cellpadding="0" cellspacing="0" style="background:#eef2f5;padding:24px 12px"><tr><td align="center">
<table width="560" cellpadding="0" cellspacing="0" style="max-width:560px;width:100%;background:#ffffff;border-radius:12px;overflow:hidden">
<tr><td style="background:#0c1522;padding:18px 24px;color:#ffffff;font-size:16px;font-weight:600">Faro <span style="color:#e8a33d">·</span> <span style="font-weight:400;color:#c9d3df">Resumen semanal de ${esc(d.workspace)}</span></td></tr>
<tr><td style="padding:22px 24px">
<p style="margin:0 0 14px;font-size:14px;color:#5b6b80">Del ${dd(d.from)} al ${dd(d.to)}, comparado con los 7 días anteriores.</p>
<table width="100%" cellpadding="0" cellspacing="0">${rows.map(([l, v, dl]) => `<tr><td style="padding:8px 0;border-bottom:1px solid #dce3ea;font-size:14px;color:#5b6b80">${l}</td><td style="padding:8px 0;border-bottom:1px solid #dce3ea;font-size:16px;font-weight:600;text-align:right;color:#13233a">${v}</td><td style="padding:8px 0 8px 12px;border-bottom:1px solid #dce3ea;font-size:13px;text-align:right;color:${dl.color};white-space:nowrap">${dl.t}</td></tr>`).join('')}</table>
${d.maxCpa ? `<p style="margin:14px 0 0;font-size:13px;color:#5b6b80">Costo máximo por compra para no perder plata: <b style="color:#13233a">${money(d.maxCpa)}</b> · margen de contribución ${pct(c.sales.netSales ? c.sales.contribution / c.sales.netSales : null, 1)}</p>` : ''}
${adTable('Los anuncios que mejor vendieron', d.best)}
${adTable('Los que más gastaron sin rendir', d.worst)}
${d.proposals ? `<p style="margin:22px 0 0;padding:12px 14px;background:#fdf4e6;border-radius:8px;font-size:14px;color:#13233a">Tus reglas tienen <b>${d.proposals} ${d.proposals === 1 ? 'propuesta' : 'propuestas'}</b> esperando tu aprobación.</p>` : ''}
<p style="margin:24px 0 0"><a href="${appUrl}/" style="display:inline-block;background:#e8a33d;color:#1a1206;text-decoration:none;font-weight:600;font-size:14px;padding:11px 18px;border-radius:8px">Abrir Faro</a></p>
</td></tr>
<tr><td style="padding:14px 24px;border-top:1px solid #dce3ea;font-size:12px;color:#919eb0">Lo recibís porque sos parte de ${esc(d.workspace)} en Faro. Se apaga desde Ajustes → Equipo.</td></tr>
</table></td></tr></table></body></html>`
  const text = [`Faro · Resumen semanal de ${d.workspace} (${dd(d.from)} al ${dd(d.to)})`, '', ...rows.map(([l, v, dl]) => `${l}: ${v} ${dl.t}`),
    d.best.length ? `\nMejores anuncios:\n${d.best.map((n) => `- ${n.name}: ${money(n.m.spend)}`).join('\n')}` : '',
    d.worst.length ? `\nGastaron sin rendir:\n${d.worst.map((n) => `- ${n.name}: ${money(n.m.spend)}`).join('\n')}` : '',
    d.proposals ? `\nPropuestas de tus reglas: ${d.proposals}` : '', `\n${appUrl}/`].join('\n')
  return { subject, html, text }
}

/** Mails de los miembros que reciben el resumen (dueños y editores). */
export async function weeklyRecipients(workspaceId: string): Promise<string[]> {
  const sb = svc()
  const { data: members } = await sb.from('workspace_members').select('user_id,role').eq('workspace_id', workspaceId).in('role', ['owner', 'editor'])
  const emails = await Promise.all((members || []).map(async (m) => (await sb.auth.admin.getUserById(m.user_id)).data.user?.email || null))
  return Array.from(new Set(emails.filter(Boolean) as string[]))
}

/** Registro de envíos (para ver el último y reenviar). Nunca rompe el envío. */
export async function logMail(workspaceId: string, m: { kind: string; week_to: string; recipients: string[]; ok: boolean; error?: string; by?: string | null }) {
  await svc().from('mail_log').insert({ workspace_id: workspaceId, kind: m.kind, week_to: m.week_to, recipients: m.recipients, ok: m.ok, error: m.error || null, sent_by: m.by || null }).then(() => null, () => null)
}
