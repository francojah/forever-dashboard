import { apiContext, canEdit } from '@/lib/faro/context'
import { accountOf, copyAd, copyAdset } from '@/lib/faro/metaCreate'

export const dynamic = 'force-dynamic'
export const maxDuration = 60

/**
 * Duplica anuncios en uno o varios ad sets, o un ad set completo. Todo queda en pausa.
 * Body: { accountId, kind: 'ad', ids: string[], adsetIds: string[] } | { accountId, kind: 'adset', ids: string[], campaignId? }
 */
export async function POST(req: Request) {
  const ctx = await apiContext()
  if (ctx instanceof Response) return ctx
  if (!canEdit(ctx)) return Response.json({ error: 'Tu rol es de solo lectura' }, { status: 403 })
  const b = await req.json().catch(() => ({})) as { accountId: string; kind: 'ad' | 'adset'; ids: string[]; adsetIds?: string[]; campaignId?: string }
  const acc = accountOf(ctx, b.accountId)
  if (!acc) return Response.json({ error: 'Cuenta inválida' }, { status: 400 })
  if (!Array.isArray(b.ids) || !b.ids.length) return Response.json({ error: 'Nada para duplicar' }, { status: 400 })
  const results: { from: string; to?: string; adsetId?: string; ok: boolean; error?: string }[] = []
  if (b.kind === 'adset') {
    for (const id of b.ids.slice(0, 10)) {
      try { const r = await copyAdset(ctx, acc, id, b.campaignId); results.push({ from: id, to: r.id, ok: true }) } catch (e) { results.push({ from: id, ok: false, error: e instanceof Error ? e.message : 'Error' }) }
    }
  } else {
    const targets = (b.adsetIds || []).slice(0, 20)
    if (!targets.length) return Response.json({ error: 'Elegí al menos un ad set de destino' }, { status: 400 })
    for (const id of b.ids.slice(0, 20)) for (const adsetId of targets) {
      try { const r = await copyAd(ctx, acc, id, adsetId); results.push({ from: id, to: r.id, adsetId, ok: true }) } catch (e) { results.push({ from: id, adsetId, ok: false, error: e instanceof Error ? e.message : 'Error' }) }
    }
  }
  return Response.json({ ok: results.every((r) => r.ok), results })
}
