/**
 * Acceso SOLO LECTURA a Tiendanube para el portal de cambios.
 * Nunca escribe: ni órdenes, ni stock.
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

async function tnGet<T>(path: string): Promise<T | null> {
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
export type TNProduct = { id: number; name: { es?: string } | string; published?: boolean; variants: TNVariant[] }

export async function getProduct(productId: number | string): Promise<TNProduct | null> {
  return tnGet<TNProduct>(`products/${productId}`)
}

export function variantLabel(v: { values?: { es?: string }[] }): string {
  return (v.values ?? []).map((x) => x?.es).filter(Boolean).join(' / ') || 'Único'
}

export function productName(p: TNProduct): string {
  return typeof p.name === 'string' ? p.name : p.name?.es ?? 'Producto'
}
