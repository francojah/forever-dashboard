import { apiContext, canEdit } from '@/lib/faro/context'
import { accountOf, listPixels, createCampaign, createAdset, NewAdset, NewCampaign } from '@/lib/faro/metaCreate'

export const dynamic = 'force-dynamic'
export const maxDuration = 60

/** Píxeles de la cuenta (para crear ad sets de ventas). */
export async function GET(req: Request) {
  const ctx = await apiContext()
  if (ctx instanceof Response) return ctx
  const acc = accountOf(ctx, new URL(req.url).searchParams.get('account') || '')
  if (!acc) return Response.json({ error: 'Cuenta inválida' }, { status: 400 })
  try { return Response.json({ pixels: await listPixels(acc) }) } catch (e) { return Response.json({ error: e instanceof Error ? e.message : 'Error', pixels: [] }, { status: 400 }) }
}

/**
 * Crea un ad set nuevo (y, si hace falta, su campaña). Todo en pausa.
 * Body: { accountId, campaignId? , campaign?: NewCampaign, adset: NewAdset }
 */
export async function POST(req: Request) {
  const ctx = await apiContext()
  if (ctx instanceof Response) return ctx
  if (!canEdit(ctx)) return Response.json({ error: 'Tu rol es de solo lectura' }, { status: 403 })
  const b = await req.json().catch(() => ({})) as { accountId: string; campaignId?: string; campaign?: NewCampaign; adset: NewAdset }
  const acc = accountOf(ctx, b.accountId)
  if (!acc) return Response.json({ error: 'Cuenta inválida' }, { status: 400 })
  if (!b.adset?.name || !b.adset?.pixelId) return Response.json({ error: 'Falta el nombre del ad set o el píxel' }, { status: 400 })
  if (!b.campaignId && !b.campaign?.name) return Response.json({ error: 'Elegí una campaña o poné nombre a la nueva' }, { status: 400 })
  try {
    let campaignId = b.campaignId
    let cbo = false
    let created: string | null = null
    if (!campaignId) {
      const c = await createCampaign(ctx, acc, b.campaign!)
      campaignId = c.id; cbo = c.cbo; created = c.id
    } else {
      const { svc } = await import('@/lib/faro/db')
      const { data } = await svc().from('ad_entities').select('daily_budget,lifetime_budget').eq('ad_account_id', acc.id).eq('entity_id', campaignId).maybeSingle()
      cbo = !!(data?.daily_budget || data?.lifetime_budget)
    }
    if (!cbo && !(b.adset.dailyBudget && b.adset.dailyBudget > 0)) return Response.json({ error: 'La campaña no tiene presupuesto propio: poné un presupuesto diario al ad set' }, { status: 400 })
    const s = await createAdset(ctx, acc, campaignId!, cbo, b.adset)
    return Response.json({ ok: true, campaignId, adsetId: s.id, createdCampaign: created })
  } catch (e) {
    return Response.json({ ok: false, error: e instanceof Error ? e.message : 'Error de Meta' }, { status: 400 })
  }
}
