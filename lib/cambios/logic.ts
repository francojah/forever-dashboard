import { CAMBIOS } from './config'
import {
  type TNOrder, getProduct, productName, supabaseAdmin, variantLabel,
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
  if (zone === 'correo') {
    // Lo que pagó el cliente de envío en la compra; si fue gratis, lo que cobró el correo
    const owner = Number(o.shipping_cost_owner) || 0
    const customer = Number(o.shipping_cost_customer) || 0
    const v = customer || owner
    return v > 0 ? Math.round(v) : null
  }
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
    .in('status', ['pendiente_pago', 'pago_confirmado', 'prenda_recibida', 'despachado'])
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
  new_variant_id?: number | null
  new_variant_label?: string | null
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
  options: { variant_id: number; label: string; same: boolean; available: number }[]
}

/** Arma los ítems de la orden con las variantes disponibles para cambio. */
export async function buildItems(o: TNOrder): Promise<LookupItem[]> {
  const reserved = await reservedByVariant()
  const productCache = new Map<number, Awaited<ReturnType<typeof getProduct>>>()
  const out: LookupItem[] = []
  for (let i = 0; i < o.products.length; i++) {
    const p = o.products[i]
    if (!productCache.has(p.product_id)) productCache.set(p.product_id, await getProduct(p.product_id))
    const prod = productCache.get(p.product_id)
    const pname = prod ? productName(prod) : p.name
    const excluded = CAMBIOS.excludedProductIds.includes(String(p.product_id)) || CAMBIOS.excludedNamePattern.test(pname)
    const options = (prod?.variants ?? [])
      .map((v) => {
        const stock = v.stock === null ? 999 : Number(v.stock) || 0 // null = stock infinito en TN
        return { variant_id: v.id, label: variantLabel(v), same: v.id === p.variant_id, available: Math.max(0, stock - (reserved.get(String(v.id)) ?? 0)) }
      })
    out.push({
      key: `${i}-${p.variant_id ?? p.product_id}`,
      product_id: p.product_id,
      variant_id: p.variant_id,
      name: prod ? productName(prod) : p.name_without_variants || p.name,
      variant_label: (p.variant_values ?? []).join(' / ') || 'Único',
      quantity: p.quantity,
      image: p.image?.src ?? null,
      exchangeable: !!prod && !excluded,
      options,
    })
  }
  return out
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
  return `${CAMBIOS.appUrl}/cambios/estado/${token}`
}

export function money(n: number | null | undefined) {
  if (n == null) return 'a confirmar'
  return '$' + Math.round(n).toLocaleString('es-AR')
}
