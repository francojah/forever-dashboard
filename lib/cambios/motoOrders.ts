/**
 * Ventas de la tienda con envío por moto que están para empaquetar (solo lectura de Tiendanube).
 * Sirve para imprimir las etiquetas de moto, que Tiendanube no genera (las de Correo sí).
 */
import { supabaseAdmin, tnGet } from './tiendanube'

type TNAddress = {
  name?: string; address?: string; number?: string; floor?: string; locality?: string
  city?: string; province?: string; zipcode?: string; phone?: string
}
export type TNMotoOrder = {
  id: number; number: number; created_at: string; status: string; payment_status: string; shipping_status: string
  shipping_option: string | null; contact_name: string | null; contact_phone: string | null; note: string | null
  shipping_address: TNAddress | null
  customer?: { name?: string; phone?: string } | null
  products: { quantity: number }[]
}

export type MotoOrder = {
  id: number
  number: number
  created_at: string
  payment_status: string
  shipping_option: string
  name: string
  phone: string
  street: string
  floor: string
  locality: string
  city: string
  province: string
  zipcode: string
  note: string
  units: number
  printed_at: string | null
}

const FIELDS = 'id,number,created_at,status,payment_status,shipping_status,shipping_option,contact_name,contact_phone,note,shipping_address,customer,products'
const isMoto = (o: { shipping_option: string | null }) => /moto/i.test(o.shipping_option || '')

export function toMotoOrder(o: TNMotoOrder, printed: Record<string, string>): MotoOrder {
  const a = o.shipping_address || {}
  return {
    id: o.id,
    number: o.number,
    created_at: o.created_at,
    payment_status: o.payment_status,
    shipping_option: o.shipping_option || '',
    name: (a.name || o.contact_name || o.customer?.name || '').trim(),
    phone: (a.phone || o.contact_phone || o.customer?.phone || '').trim(),
    street: [a.address, a.number].filter(Boolean).join(' ').trim(),
    floor: (a.floor || '').trim(),
    locality: (a.locality || '').trim(),
    city: (a.city || '').trim(),
    province: (a.province || '').trim(),
    zipcode: (a.zipcode || '').trim(),
    note: (o.note || '').trim(),
    units: (o.products || []).reduce((s, p) => s + (Number(p.quantity) || 0), 0),
    printed_at: printed[String(o.id)] ?? null,
  }
}

/** Abiertas, sin empaquetar y con envío por moto. Por defecto solo pagadas; opcionalmente también pago pendiente. */
export async function listMotoOrdersToPack(includePending: boolean): Promise<MotoOrder[]> {
  const printed = await getPrinted()
  const out: TNMotoOrder[] = []
  for (let page = 1; page <= 5; page++) {
    const list = await tnGet<TNMotoOrder[]>(`orders?status=open&shipping_status=unpacked&per_page=200&page=${page}&fields=${FIELDS}`)
    if (!Array.isArray(list) || !list.length) break
    out.push(...list)
    if (list.length < 200) break
  }
  const okPayment = (p: string) => p === 'paid' || (includePending && (p === 'pending' || p === 'authorized'))
  return out
    .filter((o) => isMoto(o) && o.status === 'open' && o.shipping_status === 'unpacked' && okPayment(o.payment_status))
    .map((o) => toMotoOrder(o, printed))
    .sort((a, b) => a.number - b.number)
}

/** Trae órdenes puntuales por id (para imprimir o reimprimir). */
export async function getMotoOrdersByIds(ids: number[]): Promise<MotoOrder[]> {
  const printed = await getPrinted()
  const got = await Promise.all(ids.map((id) => tnGet<TNMotoOrder>(`orders/${id}?fields=${FIELDS}`).catch(() => null)))
  return got.filter((o): o is TNMotoOrder => !!o && !!o.id).map((o) => toMotoOrder(o, printed)).sort((a, b) => a.number - b.number)
}

// ── Registro de etiquetas ya impresas (para no imprimir dos veces) ──
const PRINTED_KEY = 'moto_labels_printed'

async function getPrinted(): Promise<Record<string, string>> {
  const { data } = await supabaseAdmin().from('app_config').select('value').eq('key', PRINTED_KEY).maybeSingle()
  return (data?.value as Record<string, string>) || {}
}

export async function markPrinted(ids: number[]) {
  const cur = await getPrinted()
  const now = new Date().toISOString()
  const cutoff = Date.now() - 60 * 86400000
  const next: Record<string, string> = {}
  for (const [k, v] of Object.entries(cur)) if (new Date(v).getTime() > cutoff) next[k] = v
  for (const id of ids) next[String(id)] = now
  await supabaseAdmin().from('app_config').upsert({ key: PRINTED_KEY, value: next }, { onConflict: 'key' })
}
