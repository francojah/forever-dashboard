import { svc, fetchAll } from './db'
import { addDays } from './dates'

/**
 * Fatiga de creativos: compara los últimos 7 días con los 7 anteriores para cada anuncio con gasto.
 * Señales: cae el CTR, sube el costo por compra, cae el hook rate (videos).
 */
export interface Fatigue {
  adId: string
  status: 'fatiga' | 'cayendo'
  ctrChange: number | null
  cpaChange: number | null
  hookChange: number | null
  reasons: string[]
  ctrSeries: (number | null)[]     // CTR diario de los 14 días (null = sin impresiones)
}

interface Row { ad_id: string; date: string; spend: number; impressions: number; link_clicks: number; purchases: number; video_3s: number }
const r = (a: number, b: number) => (b > 0 ? a / b : null)
const ch = (b: number | null, a: number | null) => (a != null && b != null && a > 0 ? b / a - 1 : null)

export function detectFatigue(rows: Row[], today: string, maxCpa: number | null): Record<string, Fatigue> {
  const days = Array.from({ length: 14 }, (_, i) => addDays(today, i - 14))
  const split = days[7]
  const by = new Map<string, Row[]>()
  for (const x of rows) { const l = by.get(x.ad_id) || []; l.push(x); by.set(x.ad_id, l) }
  const out: Record<string, Fatigue> = {}
  const minSpend = Math.max(3000, (maxCpa || 0) * 0.5)
  for (const [adId, list] of Array.from(by.entries())) {
    const sum = (part: Row[]) => part.reduce((s, x) => ({ spend: s.spend + Number(x.spend), imp: s.imp + Number(x.impressions), clk: s.clk + Number(x.link_clicks), pur: s.pur + Number(x.purchases), v3: s.v3 + Number(x.video_3s) }), { spend: 0, imp: 0, clk: 0, pur: 0, v3: 0 })
    const A = sum(list.filter((x) => x.date < split)), B = sum(list.filter((x) => x.date >= split))
    if (B.spend < minSpend || A.imp < 1000 || B.imp < 1000) continue
    const ctrChange = ch(r(B.clk, B.imp), r(A.clk, A.imp))
    const cpaA = r(A.spend, A.pur), cpaB = r(B.spend, B.pur)
    const cpaChange = cpaA != null && cpaB != null ? cpaB / cpaA - 1 : cpaA != null && B.pur === 0 ? 1 : null
    const hookChange = A.v3 > 0 ? ch(r(B.v3, B.imp), r(A.v3, A.imp)) : null
    const reasons: string[] = []
    if (ctrChange != null && ctrChange <= -0.2) reasons.push(`CTR ${Math.round(ctrChange * 100)}%`)
    if (cpaChange != null && cpaChange >= 0.3) reasons.push(B.pur === 0 ? 'sin compras esta semana' : `costo por compra +${Math.round(cpaChange * 100)}%`)
    if (hookChange != null && hookChange <= -0.2) reasons.push(`hook rate ${Math.round(hookChange * 100)}%`)
    const strong = (ctrChange != null && ctrChange <= -0.35) || reasons.length >= 2
    if (!reasons.length) continue
    const byDay = new Map(list.map((x) => [x.date, x]))
    out[adId] = {
      adId, status: strong ? 'fatiga' : 'cayendo', ctrChange, cpaChange, hookChange, reasons,
      ctrSeries: days.map((d) => { const x = byDay.get(d); return x && Number(x.impressions) > 0 ? Number(x.link_clicks) / Number(x.impressions) : null }),
    }
  }
  return out
}

export async function loadFatigue(accountIds: string[], today: string, maxCpa: number | null): Promise<Record<string, Fatigue>> {
  if (!accountIds.length) return {}
  const rows = await fetchAll<Row>((a, b) => svc().from('ad_insights_daily').select('ad_id,date,spend,impressions,link_clicks,purchases,video_3s')
    .in('ad_account_id', accountIds).gte('date', addDays(today, -14)).lte('date', addDays(today, -1)).range(a, b))
  return detectFatigue(rows, today, maxCpa)
}
