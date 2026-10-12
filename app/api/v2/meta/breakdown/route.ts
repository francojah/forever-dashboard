import { unstable_cache } from 'next/cache'
import { apiContext } from '@/lib/faro/context'
import { graphAll, getMetaToken, PURCHASE, LPV } from '@/lib/faro/meta'

export const dynamic = 'force-dynamic'
export const maxDuration = 60

const BY: Record<string, string> = { edad: 'age', genero: 'gender', provincia: 'region', plataforma: 'publisher_platform', ubicacion: 'publisher_platform,platform_position' }
const LABEL: Record<string, string> = {
  male: 'Hombres', female: 'Mujeres', unknown: 'Sin dato', facebook: 'Facebook', instagram: 'Instagram', audience_network: 'Audience Network', messenger: 'Messenger', threads: 'Threads',
  feed: 'Feed', story: 'Historias', instagram_stories: 'Historias', instagram_reels: 'Reels', facebook_reels: 'Reels', reels: 'Reels', explore: 'Explorar', explore_home: 'Explorar (inicio)',
  marketplace: 'Marketplace', video_feeds: 'Videos', search: 'Búsqueda', profile_feed: 'Perfil', instream_video: 'Video in-stream', facebook_stories: 'Historias', right_hand_column: 'Columna derecha', an_classic: 'Clásico', rewarded_video: 'Video con recompensa',
}
type Act = { action_type: string; value: string }
const pick = (a: Act[] | undefined, types: string[]) => { for (const t of types) { const f = a?.find((x) => x.action_type === t); if (f) return parseFloat(f.value) || 0 } return 0 }

/** Desglose de una campaña, ad set o anuncio por edad, género, provincia, plataforma o ubicación. */
export async function GET(req: Request) {
  const ctx = await apiContext()
  if (ctx instanceof Response) return ctx
  const q = new URL(req.url).searchParams
  const acc = ctx.adAccounts.find((a) => a.id === q.get('account'))
  const id = q.get('id') || '', by = q.get('by') || 'edad', from = q.get('from') || '', to = q.get('to') || ''
  if (!acc || !/^\d+$/.test(id) || !BY[by] || !/^\d{4}-\d{2}-\d{2}$/.test(from) || !/^\d{4}-\d{2}-\d{2}$/.test(to)) return Response.json({ error: 'Parámetros inválidos' }, { status: 400 })
  try {
    const rows = await unstable_cache(async () => {
      const token = await getMetaToken(acc.connection_id)
      return graphAll<Record<string, unknown>>(`${id}/insights`, token, {
        breakdowns: BY[by], fields: 'spend,impressions,inline_link_clicks,actions,action_values',
        time_range: JSON.stringify({ since: from, until: to }), limit: '200',
      }, 5)
    }, ['breakdown', acc.id, id, by, from, to], { revalidate: 1800 })()
    const out = rows.map((r) => {
      const key = by === 'ubicacion' ? `${r.publisher_platform}|${r.platform_position}` : String(r[BY[by]] ?? '')
      const label = by === 'ubicacion'
        ? `${LABEL[String(r.publisher_platform)] || r.publisher_platform} · ${LABEL[String(r.platform_position)] || String(r.platform_position).replace(/_/g, ' ')}`
        : LABEL[key] || key || 'Sin dato'
      return {
        key, label,
        spend: parseFloat(String(r.spend || 0)) || 0, impressions: Number(r.impressions || 0), clicks: Number(r.inline_link_clicks || 0),
        lpv: pick(r.actions as Act[], LPV), purchases: pick(r.actions as Act[], PURCHASE), value: pick(r.action_values as Act[], PURCHASE),
      }
    }).filter((r) => r.spend > 0 || r.purchases > 0).sort((a, b) => b.spend - a.spend)
    return Response.json({ rows: out })
  } catch (e) {
    return Response.json({ error: e instanceof Error ? e.message : 'Error de Meta' }, { status: 400 })
  }
}
