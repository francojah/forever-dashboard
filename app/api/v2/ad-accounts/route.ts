import { apiContext, canEdit } from '@/lib/faro/context'
import { svc } from '@/lib/faro/db'

export const dynamic = 'force-dynamic'

/** { id, active?, protected_ids?, name? } — también sirve para tiendas con { store_id, active } */
export async function PATCH(req: Request) {
  const ctx = await apiContext()
  if (ctx instanceof Response) return ctx
  if (!canEdit(ctx)) return Response.json({ error: 'Tu rol es de solo lectura' }, { status: 403 })
  const body = await req.json().catch(() => ({})) as { id?: string; store_id?: string; active?: boolean; protected_ids?: string[]; name?: string }
  if (body.store_id) {
    if (!ctx.stores.some((s) => s.id === body.store_id)) return Response.json({ error: 'Tienda inválida' }, { status: 400 })
    await svc().from('stores').update({ active: !!body.active }).eq('id', body.store_id)
    return Response.json({ ok: true })
  }
  const acc = ctx.adAccounts.find((a) => a.id === body.id)
  if (!acc) return Response.json({ error: 'Cuenta inválida' }, { status: 400 })
  const patch: Record<string, unknown> = {}
  if (typeof body.active === 'boolean') patch.active = body.active
  if (Array.isArray(body.protected_ids)) patch.protected_ids = body.protected_ids.map(String).slice(0, 200)
  if (typeof body.name === 'string' && body.name.trim()) patch.name = body.name.trim().slice(0, 120)
  await svc().from('ad_accounts').update(patch).eq('id', acc.id)
  return Response.json({ ok: true })
}

/** Quitar una cuenta o tienda del espacio (borra sus datos sincronizados): ?id= o ?store= */
export async function DELETE(req: Request) {
  const ctx = await apiContext()
  if (ctx instanceof Response) return ctx
  if (ctx.role !== 'owner') return Response.json({ error: 'Solo el dueño puede quitar cuentas' }, { status: 403 })
  const u = new URL(req.url)
  const id = u.searchParams.get('id')
  const store = u.searchParams.get('store')
  if (id && ctx.adAccounts.some((a) => a.id === id)) await svc().from('ad_accounts').delete().eq('id', id)
  else if (store && ctx.stores.some((s) => s.id === store)) await svc().from('stores').delete().eq('id', store)
  else return Response.json({ error: 'No encontrado' }, { status: 404 })
  return Response.json({ ok: true })
}
