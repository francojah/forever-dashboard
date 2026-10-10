import { apiContext } from '@/lib/faro/context'
import { svc, fetchAll } from '@/lib/faro/db'

export const dynamic = 'force-dynamic'

/** Serie diaria de una campaña, ad set o anuncio (desde la base, sin llamar a Meta). */
export async function GET(req: Request) {
  const ctx = await apiContext()
  if (ctx instanceof Response) return ctx
  const q = new URL(req.url).searchParams
  const level = q.get('level'), id = q.get('id') || '', from = q.get('from') || '', to = q.get('to') || ''
  const col = level === 'campaign' ? 'campaign_id' : level === 'adset' ? 'adset_id' : 'ad_id'
  const accounts = ctx.adAccounts.map((a) => a.id)
  if (!id || !/^\d{4}-\d{2}-\d{2}$/.test(from) || !/^\d{4}-\d{2}-\d{2}$/.test(to) || !accounts.length) return Response.json({ days: [] })
  const rows = await fetchAll<{ date: string; spend: number; impressions: number; link_clicks: number; purchases: number; purchase_value: number; atc: number; lpv: number }>((a, b) =>
    svc().from('ad_insights_daily').select('date,spend,impressions,link_clicks,purchases,purchase_value,atc,lpv')
      .in('ad_account_id', accounts).eq(col, id).gte('date', from).lte('date', to).range(a, b))
  const by = new Map<string, { date: string; spend: number; impressions: number; clicks: number; purchases: number; value: number }>()
  for (const r of rows) {
    const d = by.get(r.date) || { date: r.date, spend: 0, impressions: 0, clicks: 0, purchases: 0, value: 0 }
    d.spend += Number(r.spend) || 0; d.impressions += Number(r.impressions) || 0; d.clicks += Number(r.link_clicks) || 0
    d.purchases += Number(r.purchases) || 0; d.value += Number(r.purchase_value) || 0
    by.set(r.date, d)
  }
  return Response.json({ days: Array.from(by.values()).sort((a, b) => a.date.localeCompare(b.date)) })
}
