import { apiContext, canEdit } from '@/lib/faro/context'
import { backfillAttribution } from '@/lib/faro/tiendanube'
import { svc } from '@/lib/faro/db'

export const dynamic = 'force-dynamic'
export const maxDuration = 60

/** Trae la URL de llegada de los pedidos de los últimos 60 días de cada tienda del negocio. */
export async function POST() {
  const ctx = await apiContext()
  if (ctx instanceof Response) return ctx
  if (!canEdit(ctx)) return Response.json({ error: 'Tu rol es de solo lectura' }, { status: 403 })
  const probe = await svc().from('order_attribution').select('order_id').limit(1)
  if (probe.error) return Response.json({ error: /does not exist|Could not find/i.test(probe.error.message) ? 'Falta correr la migración 20261013_order_attribution.sql' : probe.error.message }, { status: 500 })
  const { data: stores } = await svc().from('stores').select('*').eq('workspace_id', ctx.workspace.id).eq('active', true)
  let orders = 0, withLanding = 0, done = true
  try {
    for (const s of stores || []) {
      const r = await backfillAttribution(s, 60, 45000 / Math.max(1, (stores || []).length))
      orders += r.orders; withLanding += r.withLanding; done = done && r.done
    }
  } catch (e) { return Response.json({ error: (e as Error).message }, { status: 500 }) }
  return Response.json({ ok: true, orders, withLanding, done })
}
