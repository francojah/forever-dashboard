import { svc, fetchAll } from './db'

/**
 * Ventas reales por anuncio: Tiendanube guarda la URL de llegada del pedido (landing_url). Si el anuncio
 * lleva UTMs (Faro las pone al cargar), se cruza el pedido con el anuncio: utm_term = id del anuncio, o
 * utm_content = nombre del anuncio para los cargados antes.
 */

export interface Utm { landing_url: string | null; utm_source: string | null; utm_medium: string | null; utm_campaign: string | null; utm_content: string | null; utm_term: string | null; fbclid: boolean }

export function parseLanding(url: unknown): Utm | null {
  if (typeof url !== 'string' || !url.trim()) return null
  let u: URL
  try { u = new URL(url.trim(), 'https://x.invalid') } catch { return null }
  const g = (k: string) => { const v = u.searchParams.get(k); return v ? v.slice(0, 200) : null }
  return {
    landing_url: url.slice(0, 1000), utm_source: g('utm_source'), utm_medium: g('utm_medium'), utm_campaign: g('utm_campaign'),
    utm_content: g('utm_content'), utm_term: g('utm_term'), fbclid: u.searchParams.has('fbclid'),
  }
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function mapAttribution(storeUuid: string, o: any) {
  const p = parseLanding(o?.landing_url)
  if (!p) return null
  return {
    store_id: storeUuid, order_id: String(o.id), created_at: o.created_at,
    ...p,
    net: (parseFloat(String(o.total ?? 0)) || 0) - (parseFloat(String(o.shipping_cost_customer ?? 0)) || 0),
    valid: o.status !== 'cancelled' && !o.cancelled_at && ['paid', 'authorized', 'partially_paid'].includes(String(o.payment_status || '')),
    updated_at: new Date().toISOString(),
  }
}

/** Guarda el origen de los pedidos. Nunca rompe la sincronización (si falta la tabla, no hace nada). */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export async function saveAttribution(storeUuid: string, orders: any[]) {
  const rows = orders.map((o) => mapAttribution(storeUuid, o)).filter(Boolean) as Record<string, unknown>[]
  if (!rows.length) return 0
  try {
    const { error } = await svc().from('order_attribution').upsert(rows, { onConflict: 'store_id,order_id' })
    return error ? 0 : rows.length
  } catch { return 0 }
}

export interface AdSales { orders: number; revenue: number }
export interface AttributionResult {
  byAd: Record<string, AdSales>
  totalOrders: number        // pedidos válidos del período (todas las fuentes)
  withLanding: number        // pedidos con URL de llegada
  fromMeta: number           // con utm_source facebook/instagram/meta o fbclid
  matched: number            // cruzados con un anuncio
  missing: boolean           // falta la tabla
}

const isMeta = (r: { utm_source: string | null; fbclid: boolean }) => r.fbclid || /^(fb|facebook|ig|instagram|meta)/i.test(r.utm_source || '')

/** Asigna los pedidos a anuncios. Pura: testeable. */
export function attribute(
  rows: { order_id: string; utm_source: string | null; utm_content: string | null; utm_term: string | null; fbclid: boolean; net: number; valid: boolean }[],
  ads: { id: string; name: string; spend: number }[],
): { byAd: Record<string, AdSales>; fromMeta: number; matched: number } {
  const ids = new Set(ads.map((a) => a.id))
  // Por nombre: si hay varios anuncios con el mismo nombre, va al que más gastó
  const byName = new Map<string, { id: string; spend: number }>()
  for (const a of ads) { const k = a.name.trim().toLowerCase(); const cur = byName.get(k); if (!cur || a.spend > cur.spend) byName.set(k, { id: a.id, spend: a.spend }) }
  const byAd: Record<string, AdSales> = {}
  let fromMeta = 0, matched = 0
  for (const r of rows) {
    if (!r.valid) continue
    if (isMeta(r)) fromMeta++
    let id: string | null = null
    if (r.utm_term && ids.has(r.utm_term)) id = r.utm_term
    else if (r.utm_content && ids.has(r.utm_content)) id = r.utm_content
    else if (r.utm_content) id = byName.get(r.utm_content.trim().toLowerCase())?.id || null
    if (!id) continue
    matched++
    const s = byAd[id] || (byAd[id] = { orders: 0, revenue: 0 })
    s.orders++; s.revenue += r.net
  }
  return { byAd, fromMeta, matched }
}

export async function loadAttribution(
  storeIds: string[], fromIso: string, toIso: string, ads: { id: string; name: string; spend: number }[], totalOrders: number,
): Promise<AttributionResult> {
  const empty = { byAd: {}, totalOrders, withLanding: 0, fromMeta: 0, matched: 0, missing: false }
  if (!storeIds.length) return empty
  try {
    const rows = await fetchAll<{ order_id: string; utm_source: string | null; utm_content: string | null; utm_term: string | null; fbclid: boolean; net: number; valid: boolean }>((from, to) =>
      svc().from('order_attribution').select('order_id,utm_source,utm_content,utm_term,fbclid,net,valid')
        .in('store_id', storeIds).gte('created_at', fromIso).lt('created_at', toIso).range(from, to))
    const r = attribute(rows.map((x) => ({ ...x, net: Number(x.net) || 0 })), ads)
    return { ...r, totalOrders, withLanding: rows.filter((x) => x.valid).length, missing: false }
  } catch (e) {
    return { ...empty, missing: /does not exist|Could not find/i.test((e as Error).message) }
  }
}
