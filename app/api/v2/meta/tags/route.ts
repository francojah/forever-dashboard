import { apiContext, canEdit } from '@/lib/faro/context'
import { svc } from '@/lib/faro/db'

export const dynamic = 'force-dynamic'
const clean = (v: unknown) => (typeof v === 'string' ? v.trim().slice(0, 60) || null : null)

/** Etiquetas de anuncios del negocio. */
export async function GET() {
  const ctx = await apiContext()
  if (ctx instanceof Response) return ctx
  const { data, error } = await svc().from('ad_tags').select('ad_id,angulo,formato,producto').eq('workspace_id', ctx.workspace.id)
  if (error) return Response.json({ tags: [], missing: /does not exist|Could not find/i.test(error.message) })
  return Response.json({ tags: data || [] })
}

/** Guardar etiquetas: { ad_id, angulo?, formato?, producto? } */
export async function PUT(req: Request) {
  const ctx = await apiContext()
  if (ctx instanceof Response) return ctx
  if (!canEdit(ctx)) return Response.json({ error: 'Tu rol es de solo lectura' }, { status: 403 })
  const b = await req.json().catch(() => ({})) as Record<string, unknown>
  const adId = String(b.ad_id || '')
  if (!/^\d+$/.test(adId)) return Response.json({ error: 'Anuncio inválido' }, { status: 400 })
  // El anuncio tiene que ser de una cuenta de este negocio
  const { data: ent } = await svc().from('ad_entities').select('entity_id').in('ad_account_id', ctx.adAccounts.map((a) => a.id)).eq('entity_id', adId).maybeSingle()
  if (!ent) return Response.json({ error: 'El anuncio no es de este negocio' }, { status: 404 })
  const { error } = await svc().from('ad_tags').upsert({
    workspace_id: ctx.workspace.id, ad_id: adId, angulo: clean(b.angulo), formato: clean(b.formato), producto: clean(b.producto), updated_at: new Date().toISOString(),
  }, { onConflict: 'workspace_id,ad_id' })
  if (error) return Response.json({ error: /does not exist|Could not find/i.test(error.message) ? 'Falta correr la migración 20261012_ads_extras.sql' : error.message }, { status: 500 })
  return Response.json({ ok: true })
}
