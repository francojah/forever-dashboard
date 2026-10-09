import { apiContext, canEdit } from '@/lib/faro/context'
import { svc } from '@/lib/faro/db'
import { getCachedProducts } from '@/lib/faro/actions'
import { loadCostIndex } from '@/lib/faro/metrics'
import { localDate } from '@/lib/faro/dates'

export const dynamic = 'force-dynamic'
export const maxDuration = 60

/** Productos de la tienda con su costo vigente (manual, de la plataforma o faltante). */
export async function GET(req: Request) {
  const ctx = await apiContext()
  if (ctx instanceof Response) return ctx
  const storeId = new URL(req.url).searchParams.get('store') || ctx.stores[0]?.id
  const store = ctx.stores.find((s) => s.id === storeId)
  if (!store) return Response.json({ products: [] })
  const today = localDate(new Date(), ctx.workspace.timezone)
  const [products, idx] = await Promise.all([getCachedProducts(store), loadCostIndex([store.id])])
  const current = (pid: string, vid: string) => {
    const list = idx.get(`${store.id}|${pid}|${vid}`)
    if (!list?.length) return null
    let c: number | null = null
    for (const e of list) if (e.valid_from <= today) c = e.unit_cost
    return c
  }
  return Response.json({
    store: { id: store.id, name: store.name },
    products: products.map((p) => ({
      id: p.id, name: p.name, image: p.image, stock: p.stock,
      cost: current(p.id, ''),
      variants: p.variants.map((v) => ({ id: v.id, name: v.name, price: v.price, stock: v.stock, platform_cost: v.cost, cost: current(p.id, v.id) })),
    })),
  })
}

/** { store_id, items: [{ product_id, variant_id?, unit_cost|null, name?, valid_from? }] } */
export async function PUT(req: Request) {
  const ctx = await apiContext()
  if (ctx instanceof Response) return ctx
  if (!canEdit(ctx)) return Response.json({ error: 'Tu rol es de solo lectura' }, { status: 403 })
  const body = await req.json().catch(() => ({})) as { store_id?: string; items?: { product_id: string; variant_id?: string; unit_cost: number | null; name?: string; valid_from?: string }[] }
  const store = ctx.stores.find((s) => s.id === body.store_id)
  if (!store) return Response.json({ error: 'Tienda inválida' }, { status: 400 })
  const items = (body.items || []).slice(0, 2000)
  const sb = svc()
  const upserts = items.filter((i) => i.unit_cost != null && isFinite(Number(i.unit_cost)) && Number(i.unit_cost) >= 0).map((i) => ({
    store_id: store.id, product_id: String(i.product_id), variant_id: i.variant_id ? String(i.variant_id) : '',
    name: (i.name || '').slice(0, 200), unit_cost: Number(i.unit_cost),
    valid_from: i.valid_from && /^\d{4}-\d{2}-\d{2}$/.test(i.valid_from) ? i.valid_from : '2000-01-01',
    updated_at: new Date().toISOString(),
  }))
  for (let i = 0; i < upserts.length; i += 500) {
    const { error } = await sb.from('cost_items').upsert(upserts.slice(i, i + 500), { onConflict: 'store_id,product_id,variant_id,valid_from' })
    if (error) return Response.json({ error: error.message }, { status: 500 })
  }
  for (const d of items.filter((i) => i.unit_cost == null)) {
    await sb.from('cost_items').delete().eq('store_id', store.id).eq('product_id', String(d.product_id)).eq('variant_id', d.variant_id ? String(d.variant_id) : '')
  }
  return Response.json({ ok: true, saved: upserts.length })
}
