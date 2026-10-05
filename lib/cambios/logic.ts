import { CAMBIOS } from './config'
import {
  type TNOrder, getAllProducts, productImage, productName, supabaseAdmin, variantLabel,
} from './tiendanube'

export type Zone = 'caba' | 'moto_gba' | 'correo' | 'retiro' | 'otro'

export function classifyZone(o: TNOrder): Zone {
  const opt = (o.shipping_option || '').toLowerCase()
  const prov = (o.shipping_address?.province || '').toLowerCase()
  const isCaba = /capital federal|ciudad aut[oó]noma|caba/.test(prov) || /caba/.test(opt)
  // Envío Nube / Correo: tanto "a domicilio" como "Punto de retiro" (sucursal del correo) van por correo
  const viaCarrier = /correo|andreani|\boca\b|env[ií]o nube/.test(opt) || /env[ií]o nube|correo/i.test(o.shipping_carrier_name || '')
  if (viaCarrier) return 'correo'
  if (/moto/.test(opt)) return isCaba ? 'caba' : 'moto_gba'
  // Retiro en el local propio (sin transportista)
  if (o.shipping_pickup_type === 'pickup' || /retiro/.test(opt)) return 'retiro'
  if (isCaba) return 'caba'
  return 'otro'
}

/** Monto del envío del cambio. null = lo confirma el equipo. */
export function shippingAmount(zone: Zone, o: TNOrder): number | null {
  if (zone === 'caba') return CAMBIOS.cabaFee
  if (zone === 'retiro') return CAMBIOS.retiroFee
  if (zone === 'moto_gba') {
    if (CAMBIOS.motoGbaFee != null) return CAMBIOS.motoGbaFee
    // Lo que pagó de moto en la compra original
    const v = Number(o.shipping_cost_customer) || Number(o.shipping_cost_owner) || 0
    return v > 0 ? Math.round(v) : null
  }
  // Correo Argentino: monto fijo, no depende del destino ni de lo que pagó en la compra
  if (zone === 'correo') return CAMBIOS.correoFee
  return null
}

export type Eligibility =
  | { ok: true; deadline: string }
  | { ok: false; reason: string }

export function checkEligibility(o: TNOrder, zone: Zone): Eligibility {
  if (o.status === 'cancelled') return { ok: false, reason: 'Esta orden está cancelada.' }
  if (o.payment_status !== 'paid') return { ok: false, reason: 'Esta orden todavía no figura como pagada.' }
  if (!o.shipped_at) {
    return { ok: false, reason: 'Tu pedido todavía no salió. Si querés cambiar algo antes del envío, escribinos por WhatsApp.' }
  }
  const margin = CAMBIOS.transitMarginDays[zone] ?? 7
  const deadline = new Date(new Date(o.shipped_at).getTime() + (CAMBIOS.windowDays + margin) * 86400000)
  if (Date.now() > deadline.getTime()) {
    return { ok: false, reason: `Pasaron más de ${CAMBIOS.windowDays} días desde que recibiste el pedido. Escribinos por WhatsApp y lo vemos.` }
  }
  return { ok: true, deadline: deadline.toISOString() }
}

/** Unidades comprometidas por variante en cambios activos (aún no restadas en TN). */
export async function reservedByVariant(excludeId?: string): Promise<Map<string, number>> {
  const sb = supabaseAdmin()
  const { data, error } = await sb
    .from('exchanges')
    .select('id, status, type, items, created_at, stock_out_done')
    .eq('type', 'cambio')
    .eq('stock_out_done', false)
    .in('status', ['pendiente_pago', 'pago_confirmado', 'etiqueta_enviada', 'prenda_recibida', 'despachado'])
  if (error) throw new Error(error.message)
  const holdMs = CAMBIOS.pendingHoldHours * 3600000
  const map = new Map<string, number>()
  for (const ex of data ?? []) {
    if (excludeId && ex.id === excludeId) continue
    if (ex.status === 'pendiente_pago' && Date.now() - new Date(ex.created_at).getTime() > holdMs) continue
    for (const it of (ex.items as ExchangeItem[]) ?? []) {
      if (!it.new_variant_id) continue
      const k = String(it.new_variant_id)
      map.set(k, (map.get(k) ?? 0) + (it.quantity || 1))
    }
  }
  return map
}

export type ExchangeItem = {
  product_id: number
  variant_id: number | null
  name: string
  variant_label: string
  quantity: number
  reason?: string
  new_product_id?: number | null
  new_product_name?: string | null
  new_variant_id?: number | null
  new_variant_label?: string | null
  price_diff?: number | null
}

export type LookupItem = {
  key: string
  product_id: number
  variant_id: number | null
  name: string
  variant_label: string
  quantity: number
  image: string | null
  exchangeable: boolean
  /** Precio ACTUAL de la variante original (base para calcular diferencias, neutral a aumentos) */
  base_price: number
}

export type CatalogProduct = {
  product_id: number
  name: string
  image: string | null
  is_pack: boolean
  variants: { variant_id: number; label: string; price: number; available: number }[]
}

const PACK_RE = /\bpack\b/i

function isExcluded(id: number | string, name: string) {
  return CAMBIOS.excludedProductIds.includes(String(id)) || CAMBIOS.excludedNamePattern.test(name)
}

/** Catálogo elegible para cambio: publicado, sin ropa interior ni accesorios, con stock disponible real. */
export async function buildCatalog(): Promise<CatalogProduct[]> {
  const [reserved, products] = await Promise.all([reservedByVariant(), getAllProducts()])
  return products
    .filter((p) => p.published !== false && !isExcluded(p.id, productName(p)))
    .map((p) => ({
      product_id: p.id,
      name: productName(p),
      image: productImage(p),
      is_pack: PACK_RE.test(productName(p)),
      variants: (p.variants ?? []).map((v) => {
        const stock = v.stock === null ? 999 : Number(v.stock) || 0 // null = stock infinito en TN
        return { variant_id: v.id, label: variantLabel(v), price: Number(v.price) || 0, available: Math.max(0, stock - (reserved.get(String(v.id)) ?? 0)) }
      }),
    }))
}

/** Ítems de la orden, con el precio actual de su variante (para calcular diferencias). */
export function buildItems(o: TNOrder, catalog: CatalogProduct[]): LookupItem[] {
  return o.products.map((p, i) => {
    const prod = catalog.find((c) => c.product_id === p.product_id)
    const v = prod?.variants.find((x) => x.variant_id === p.variant_id)
    const name = prod?.name || p.name_without_variants || p.name
    return {
      key: `${i}-${p.variant_id ?? p.product_id}`,
      product_id: p.product_id,
      variant_id: p.variant_id,
      name,
      variant_label: (p.variant_values ?? []).join(' / ') || 'Único',
      quantity: p.quantity,
      image: p.image?.src ?? null,
      exchangeable: !!prod && !isExcluded(p.product_id, name),
      base_price: v?.price ?? (Number(p.price) || 0),
    }
  })
}

/** Destinos válidos para un ítem: cualquier producto elegible; los packs solo dentro del mismo pack. */
export function canTarget(item: LookupItem, target: CatalogProduct) {
  if (target.product_id === item.product_id) return true
  return !target.is_pack
}

/** Diferencia a abonar por un cambio (nunca negativa: si vale menos no se reintegra). */
export function priceDiff(item: LookupItem, newPrice: number) {
  return Math.max(0, Math.round((newPrice - item.base_price) * item.quantity))
}

/** Total a transferir = envío + diferencias. null si el envío está a confirmar. */
export function amountDue(shipping: number | null | undefined, items: { price_diff?: number | null }[]) {
  const diff = items.reduce((a, it) => a + (Number(it.price_diff) || 0), 0)
  if (shipping == null) return null
  return shipping + diff
}

export function diffTotal(items: { price_diff?: number | null }[]) {
  return items.reduce((a, it) => a + (Number(it.price_diff) || 0), 0)
}

export function emailMatches(o: TNOrder, email: string): boolean {
  const e = email.trim().toLowerCase()
  return !!e && [o.contact_email, o.customer?.email].some((x) => (x || '').trim().toLowerCase() === e)
}

export function customerInfo(o: TNOrder) {
  const a = o.shipping_address ?? {}
  return {
    name: o.contact_name || o.customer?.name || a.name || '',
    phone: o.contact_phone || a.phone || o.customer?.phone || '',
    address: {
      branch: o.shipping_store_branch_name || '',
      name: a.name || '', street: [a.address, a.number].filter(Boolean).join(' '),
      floor: a.floor || '', locality: a.locality || '', city: a.city || '',
      province: a.province || '', zipcode: a.zipcode || '',
    },
  }
}

export function randomToken(len = 24): string {
  const chars = 'abcdefghijkmnopqrstuvwxyzABCDEFGHJKLMNPQRSTUVWXYZ23456789'
  const bytes = new Uint8Array(len)
  crypto.getRandomValues(bytes)
  return Array.from(bytes, (b) => chars[b % chars.length]).join('')
}

export function statusUrl(token: string) {
  return `${CAMBIOS.publicUrl}/cambios/estado/${token}`
}

export function money(n: number | null | undefined) {
  if (n == null) return 'a confirmar'
  return '$' + Math.round(n).toLocaleString('es-AR')
}
