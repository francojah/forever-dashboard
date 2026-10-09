import { svc, upsertChunks, logSync } from './db'
import { addDays, localDate } from './dates'

const TN_API = 'https://api.tiendanube.com/v1'
const UA = 'Faro (soporte@faro.app)'

export interface StoreRow {
  id: string
  workspace_id: string
  connection_id: string | null
  external_id: string
  name: string
  orders_cursor: string | null
  backfill_done: boolean
  backfill_page: number
  webhooks_ok: boolean
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms))

/** GET a la API de Tiendanube respetando el límite de 2 pedidos/s (bucket de 40). */
export async function tnGet<T = unknown>(storeId: string, token: string, path: string, params?: Record<string, string>): Promise<{ data: T; total: number | null }> {
  const qs = params ? `?${new URLSearchParams(params)}` : ''
  for (let attempt = 0; attempt < 4; attempt++) {
    const res = await fetch(`${TN_API}/${storeId}/${path}${qs}`, {
      headers: { Authentication: `bearer ${token}`, 'User-Agent': UA, 'Content-Type': 'application/json' },
      cache: 'no-store',
    })
    if (res.status === 429) {
      const reset = Number(res.headers.get('x-rate-limit-reset') || 1000)
      await sleep(Math.min(Math.max(reset, 500), 5000))
      continue
    }
    const remaining = Number(res.headers.get('x-rate-limit-remaining') ?? 40)
    if (remaining < 3) await sleep(Number(res.headers.get('x-rate-limit-reset') || 1000))
    const total = res.headers.get('x-total-count')
    const text = await res.text()
    let json: unknown = null
    try { json = text ? JSON.parse(text) : null } catch { json = null }
    if (res.status === 404 && /last page/i.test(text)) return { data: [] as unknown as T, total: total ? Number(total) : null }
    if (!res.ok) {
      const msg = (json as { description?: string; message?: string } | null)?.description || (json as { message?: string } | null)?.message || text.slice(0, 200)
      if (/last page/i.test(String(msg))) return { data: [] as unknown as T, total: null }
      throw new Error(`Tiendanube ${res.status}: ${msg}`)
    }
    return { data: json as T, total: total ? Number(total) : null }
  }
  throw new Error('Tiendanube: demasiados pedidos seguidos (429). Reintentá en un minuto.')
}

export async function tnPost<T = unknown>(storeId: string, token: string, path: string, body: unknown): Promise<T> {
  const res = await fetch(`${TN_API}/${storeId}/${path}`, {
    method: 'POST',
    headers: { Authentication: `bearer ${token}`, 'User-Agent': UA, 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  })
  const json = await res.json().catch(() => null)
  if (!res.ok) throw new Error(`Tiendanube ${res.status}: ${JSON.stringify(json).slice(0, 200)}`)
  return json as T
}

const ORDER_FIELDS = [
  'id', 'number', 'created_at', 'updated_at', 'paid_at', 'cancelled_at', 'status', 'payment_status', 'currency',
  'subtotal', 'discount', 'total', 'shipping_cost_owner', 'shipping_cost_customer', 'gateway', 'payment_details',
  'shipping_option', 'shipping_pickup_type', 'shipping_address', 'customer', 'contact_email', 'storefront', 'products',
].join(',')

const n = (v: unknown) => {
  const x = parseFloat(String(v ?? '0'))
  return isFinite(x) ? x : 0
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function mapOrder(storeUuid: string, o: any) {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const items = (o.products || []).map((p: any) => ({
    product_id: p.product_id != null ? String(p.product_id) : null,
    variant_id: p.variant_id != null ? String(p.variant_id) : null,
    name: p.name || '',
    qty: parseInt(String(p.quantity ?? '1'), 10) || 1,
    price: n(p.price),
    cost: p.cost != null && p.cost !== '' ? n(p.cost) : null,
  }))
  return {
    store_id: storeUuid,
    order_id: String(o.id),
    number: o.number != null ? String(o.number) : null,
    created_at: o.created_at,
    updated_at: o.updated_at || o.created_at,
    paid_at: o.paid_at || null,
    cancelled_at: o.cancelled_at || null,
    status: o.status || null,
    payment_status: o.payment_status || null,
    currency: o.currency || null,
    subtotal: n(o.subtotal),
    discount: n(o.discount),
    total: n(o.total),
    shipping_customer: n(o.shipping_cost_customer),
    shipping_owner: n(o.shipping_cost_owner),
    gateway: o.gateway || null,
    payment_method: o.payment_details?.method || null,
    installments: o.payment_details?.installments != null ? parseInt(String(o.payment_details.installments), 10) || null : null,
    shipping_option: typeof o.shipping_option === 'string' ? o.shipping_option : o.shipping_option?.name || null,
    shipping_pickup: o.shipping_pickup_type || null,
    province: o.shipping_address?.province || null,
    customer_id: o.customer?.id != null ? String(o.customer.id) : null,
    customer_email: o.customer?.email || o.contact_email || null,
    storefront: o.storefront || null,
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    units: items.reduce((s: number, i: any) => s + i.qty, 0),
    items,
    synced_at: new Date().toISOString(),
  }
}

export async function getConnectionToken(connectionId: string | null): Promise<string> {
  if (!connectionId) throw new Error('La tienda no tiene conexión')
  const { data, error } = await svc().from('connections').select('access_token,status').eq('id', connectionId).single()
  if (error || !data) throw new Error('No se encontró la conexión de la tienda')
  return data.access_token as string
}

/**
 * Sincroniza órdenes de una tienda.
 *  - Primera vez: backfill de 13 meses, paginado y reanudable (backfill_page).
 *  - Después: solo lo modificado desde el último cursor (updated_at_min).
 * Respeta un presupuesto de tiempo para no pasar el límite de la función.
 */
export async function syncStoreOrders(store: StoreRow, budgetMs = 40000): Promise<{ rows: number; done: boolean }> {
  const t0 = Date.now()
  const token = await getConnectionToken(store.connection_id)
  let rows = 0
  const sb = svc()

  try {
    if (!store.backfill_done) {
      const startIso = new Date().toISOString()
      if (!store.orders_cursor) {
        await sb.from('stores').update({ orders_cursor: startIso }).eq('id', store.id)
        store.orders_cursor = startIso
      }
      const since = addDays(localDate(new Date(), 'UTC'), -400) + 'T00:00:00Z'
      let page = store.backfill_page || 1
      while (Date.now() - t0 < budgetMs) {
        const { data } = await tnGet<unknown[]>(store.external_id, token, 'orders', {
          per_page: '200', page: String(page), created_at_min: since, fields: ORDER_FIELDS,
        })
        const batch = Array.isArray(data) ? data : []
        if (batch.length) rows += await upsertChunks('orders', batch.map((o) => mapOrder(store.id, o)), 'store_id,order_id')
        if (batch.length < 200) {
          await sb.from('stores').update({ backfill_done: true, backfill_page: page, last_synced_at: new Date().toISOString(), last_sync_error: null }).eq('id', store.id)
          store.backfill_done = true
          break
        }
        page++
        await sb.from('stores').update({ backfill_page: page }).eq('id', store.id)
      }
      if (!store.backfill_done) {
        await logSync({ workspace_id: store.workspace_id, source: 'tiendanube', target_id: store.id, status: 'ok', rows, ms: Date.now() - t0 })
        return { rows, done: false }
      }
    }

    // Incremental por updated_at (10 min de solapamiento por relojes)
    const cursor = store.orders_cursor ? new Date(new Date(store.orders_cursor).getTime() - 10 * 60000).toISOString() : addDays(localDate(new Date(), 'UTC'), -3) + 'T00:00:00Z'
    let page = 1
    let maxUpdated = store.orders_cursor || cursor
    while (Date.now() - t0 < budgetMs) {
      const { data } = await tnGet<unknown[]>(store.external_id, token, 'orders', {
        per_page: '200', page: String(page), updated_at_min: cursor, fields: ORDER_FIELDS,
      })
      const batch = Array.isArray(data) ? data : []
      if (batch.length) {
        const mapped = batch.map((o) => mapOrder(store.id, o))
        rows += await upsertChunks('orders', mapped, 'store_id,order_id')
        for (const m of mapped) if (m.updated_at && m.updated_at > maxUpdated) maxUpdated = m.updated_at
      }
      if (batch.length < 200) break
      page++
    }
    await sb.from('stores').update({ orders_cursor: maxUpdated, last_synced_at: new Date().toISOString(), last_sync_error: null }).eq('id', store.id)
    await logSync({ workspace_id: store.workspace_id, source: 'tiendanube', target_id: store.id, status: 'ok', rows, ms: Date.now() - t0 })
    return { rows, done: true }
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e)
    await sb.from('stores').update({ last_sync_error: msg.slice(0, 300) }).eq('id', store.id)
    await logSync({ workspace_id: store.workspace_id, source: 'tiendanube', target_id: store.id, status: 'error', rows, ms: Date.now() - t0, error: msg })
    throw e
  }
}

/** Actualiza una sola orden (webhooks). */
export async function syncSingleOrder(store: StoreRow, orderId: string) {
  const token = await getConnectionToken(store.connection_id)
  const { data } = await tnGet<unknown>(store.external_id, token, `orders/${orderId}`, { fields: ORDER_FIELDS })
  if (data && typeof data === 'object') {
    await upsertChunks('orders', [mapOrder(store.id, data)], 'store_id,order_id')
  }
}

const WEBHOOK_EVENTS = ['order/created', 'order/updated', 'order/paid', 'order/cancelled']

/** Registra los webhooks de órdenes (solo en producción, con URL pública). */
export async function ensureWebhooks(store: StoreRow): Promise<boolean> {
  const base = process.env.NEXT_PUBLIC_APP_URL
  if (process.env.VERCEL_ENV !== 'production' || !base) return false
  const token = await getConnectionToken(store.connection_id)
  const url = `${base.replace(/\/$/, '')}/api/v2/webhooks/tiendanube`
  const { data } = await tnGet<{ event: string; url: string }[]>(store.external_id, token, 'webhooks')
  const have = new Set((Array.isArray(data) ? data : []).filter((w) => w.url === url).map((w) => w.event))
  for (const ev of WEBHOOK_EVENTS) {
    if (!have.has(ev)) await tnPost(store.external_id, token, 'webhooks', { event: ev, url })
  }
  await svc().from('stores').update({ webhooks_ok: true }).eq('id', store.id)
  return true
}

export interface TNProduct {
  id: string
  name: string
  image: string | null
  stock: number | null          // null = stock infinito / no gestionado
  variants: { id: string; name: string; stock: number | null; price: number; cost: number | null }[]
}

const pickName = (v: unknown): string => {
  if (!v) return ''
  if (typeof v === 'string') return v
  const o = v as Record<string, string>
  return o.es || o.pt || o.en || Object.values(o)[0] || ''
}

/** Productos con stock por variante (para alertas de stock y carga de costos). */
export async function fetchProducts(store: StoreRow): Promise<TNProduct[]> {
  const token = await getConnectionToken(store.connection_id)
  const out: TNProduct[] = []
  for (let page = 1; page < 30; page++) {
    const { data } = await tnGet<unknown[]>(store.external_id, token, 'products', { per_page: '200', page: String(page) })
    const batch = Array.isArray(data) ? data : []
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    for (const p of batch as any[]) {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const variants = (p.variants || []).map((v: any) => ({
        id: String(v.id),
        name: (v.values || []).map(pickName).filter(Boolean).join(' / '),
        stock: v.stock_management === false || v.stock == null ? null : Number(v.stock),
        price: n(v.promotional_price || v.price),
        cost: v.cost != null && v.cost !== '' ? n(v.cost) : null,
      }))
      const finite = variants.filter((v: { stock: number | null }) => v.stock != null)
      out.push({
        id: String(p.id),
        name: pickName(p.name),
        image: p.images?.[0]?.src || null,
        stock: finite.length ? finite.reduce((s: number, v: { stock: number | null }) => s + (v.stock || 0), 0) : null,
        variants,
      })
    }
    if (batch.length < 200) break
  }
  return out
}

/** Datos básicos de la tienda (nombre, moneda, dominio). */
export async function fetchStoreInfo(externalId: string, token: string) {
  const { data } = await tnGet<Record<string, unknown>>(externalId, token, 'store')
  const d = (data || {}) as Record<string, unknown>
  return {
    name: pickName(d.name) || `Tienda ${externalId}`,
    currency: (d.main_currency as string) || 'ARS',
    url: Array.isArray(d.domains) && d.domains.length
      ? `https://${String(d.domains[0]).replace(/^https?:\/\//, '')}`
      : (d.original_domain as string) ? `https://${d.original_domain}` : (d.url_with_protocol as string) || null,
  }
}
