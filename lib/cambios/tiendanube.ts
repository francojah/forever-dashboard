/**
 * Acceso a Tiendanube para el portal de cambios.
 * Escrituras permitidas (pedidas por Franco):
 *  - `appendOwnerNote`: una línea en la nota interna de la venta original.
 *  - `adjustVariantStock`: reservar la prenda nueva y reingresar la devuelta (solo si llegó en buen estado).
 * Nunca crea órdenes ni toca precios o estados de las ventas.
 */
import { createClient } from '@supabase/supabase-js'

const TN_API = 'https://api.tiendanube.com/v1'

export function supabaseAdmin() {
  return createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!, {
    auth: { persistSession: false },
    // Evita que Next cachee las lecturas (si no, el estado/panel muestra datos viejos)
    global: { fetch: (input: RequestInfo | URL, init?: RequestInit) => fetch(input, { ...init, cache: 'no-store' }) },
  })
}

async function getTNCredentials() {
  try {
    const { data } = await supabaseAdmin()
      .from('app_config').select('value').eq('key', 'tiendanube_credentials').single()
    if (data?.value?.access_token && data?.value?.user_id) {
      return { token: data.value.access_token as string, userId: String(data.value.user_id) }
    }
  } catch { /* fallback a env */ }
  const token = process.env.TIENDANUBE_ACCESS_TOKEN
  const userId = process.env.TIENDANUBE_USER_ID
  if (!token || !userId) throw new Error('Credenciales Tiendanube no configuradas')
  return { token, userId }
}

export async function tnGet<T>(path: string): Promise<T | null> {
  const { token, userId } = await getTNCredentials()
  const res = await fetch(`${TN_API}/${userId}/${path}`, {
    headers: {
      Authentication: `bearer ${token}`,
      'User-Agent': 'ForeverAdsApp (soporte@foreverbasics.com.ar)',
    },
    cache: 'no-store',
  })
  if (res.status === 404) return null
  if (!res.ok) throw new Error(`Tiendanube HTTP ${res.status}`)
  return (await res.json()) as T
}

export type TNOrderProduct = {
  product_id: number
  variant_id: number | null
  name: string
  name_without_variants?: string
  price: string
  quantity: number
  variant_values?: string[]
  image?: { src?: string } | null
}

export type TNOrder = {
  id: number
  number: number
  status: string
  payment_status: string
  shipping_status: string
  shipped_at: string | null
  created_at: string
  contact_email: string | null
  contact_name: string | null
  contact_phone: string | null
  customer?: { name?: string; email?: string; phone?: string } | null
  shipping_option: string | null
  shipping_pickup_type?: string | null
  shipping_carrier_name?: string | null
  shipping_store_branch_name?: string | null
  shipping_cost_customer: string | null
  shipping_cost_owner: string | null
  shipping_address?: {
    name?: string; address?: string; number?: string; floor?: string; locality?: string
    city?: string; province?: string; zipcode?: string; phone?: string
  } | null
  products: TNOrderProduct[]
}

export async function findOrderByNumber(orderNumber: string): Promise<TNOrder | null> {
  const n = orderNumber.replace(/[^0-9]/g, '')
  if (!n) return null
  const list = await tnGet<TNOrder[]>(`orders?q=${encodeURIComponent(n)}&per_page=50`)
  if (!Array.isArray(list)) return null
  return list.find((o) => String(o.number) === n) ?? null
}

export type TNVariant = { id: number; price: string; stock: number | null; values?: { es?: string }[] }
export type TNProduct = { id: number; name: { es?: string } | string; published?: boolean; variants: TNVariant[]; images?: { src?: string }[] }

export async function getProduct(productId: number | string): Promise<TNProduct | null> {
  return tnGet<TNProduct>(`products/${productId}`)
}

export async function getAllProducts(): Promise<TNProduct[]> {
  const out: TNProduct[] = []
  for (let page = 1; page <= 10; page++) {
    const list = await tnGet<TNProduct[]>(`products?per_page=200&page=${page}`)
    if (!Array.isArray(list) || !list.length) break
    out.push(...list)
    if (list.length < 200) break
  }
  return out
}

export function productImage(p: TNProduct): string | null {
  return p.images?.[0]?.src ?? null
}

export function variantLabel(v: { values?: { es?: string }[] }): string {
  return (v.values ?? []).map((x) => x?.es).filter(Boolean).join(' / ') || 'Único'
}

export function productName(p: TNProduct): string {
  return typeof p.name === 'string' ? p.name : p.name?.es ?? 'Producto'
}

/**
 * Ajuste RELATIVO de stock de una variante (suma o resta `delta`), sin pisar ventas que entren en paralelo.
 * Requiere el permiso write_products de la app. Nunca lanza.
 */
export async function adjustVariantStock(productId: number | string, variantId: number | string, delta: number): Promise<{ ok: boolean; stock?: number | null; error?: string }> {
  try {
    const { token, userId } = await getTNCredentials()
    const res = await fetch(`${TN_API}/${userId}/products/${productId}/variants/stock`, {
      method: 'POST',
      headers: {
        Authentication: `bearer ${token}`,
        'User-Agent': 'ForeverAdsApp (soporte@foreverbasics.com.ar)',
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ action: 'variation', value: delta, id: Number(variantId) }),
      cache: 'no-store',
    })
    if (!res.ok) {
      const j = (await res.json().catch(() => null)) as { description?: string } | null
      const desc = j?.description || ''
      if (res.status === 403 && /write_products/.test(desc)) return { ok: false, error: 'La app de Tiendanube no tiene permiso para editar stock' }
      return { ok: false, error: `Tiendanube HTTP ${res.status}${desc ? `: ${desc}` : ''}` }
    }
    const list = (await res.json()) as { id: number; stock: number | null }[]
    const v = Array.isArray(list) ? list.find((x) => x.id === Number(variantId)) : undefined
    return { ok: true, stock: v?.stock ?? null }
  } catch (e) {
    return { ok: false, error: (e as Error).message.slice(0, 160) }
  }
}

/**
 * Agrega una línea a la nota interna ("nota del vendedor") de la venta.
 * Conserva lo que ya estaba escrito y no repite una línea que ya existe. Nunca lanza.
 */
export async function appendOwnerNote(orderId: string | number, line: string): Promise<{ ok: boolean; error?: string }> {
  try {
    const { token, userId } = await getTNCredentials()
    const headers = {
      Authentication: `bearer ${token}`,
      'User-Agent': 'ForeverAdsApp (soporte@foreverbasics.com.ar)',
      'Content-Type': 'application/json',
    }
    const url = `${TN_API}/${userId}/orders/${orderId}`
    const cur = await fetch(`${url}?fields=id,owner_note`, { headers, cache: 'no-store' })
    if (!cur.ok) return { ok: false, error: `Tiendanube HTTP ${cur.status}` }
    const existing = String(((await cur.json()) as { owner_note?: string | null }).owner_note || '').trim()
    if (existing.includes(line)) return { ok: true }
    const owner_note = existing ? `${existing}\n${line}` : line
    const res = await fetch(url, { method: 'PUT', headers, body: JSON.stringify({ owner_note }), cache: 'no-store' })
    return res.ok ? { ok: true } : { ok: false, error: `Tiendanube HTTP ${res.status}` }
  } catch (e) {
    return { ok: false, error: (e as Error).message.slice(0, 160) }
  }
}
