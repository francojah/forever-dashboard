import type {
  EcommerceConnector,
  ConnectorCredentials,
  NormalizedOrder,
  NormalizedProduct,
  OrdersQuery,
} from './types'

/**
 * TiendanubeConnector — adaptador para la API de Tiendanube.
 *
 * NOTA: la lógica de fetch/paginación ya existe hoy en
 * app/api/sync-tiendanube/route.ts. El paso de migración es mover esa lógica
 * acá y que la route consuma este conector. Así el resto de la app deja de
 * saber que "por debajo" hay Tiendanube.
 *
 * Doc API: https://tiendanube.github.io/api-documentation/
 */
const TN_API = 'https://api.tiendanube.com/v1'

export class TiendanubeConnector implements EcommerceConnector {
  readonly platform = 'tiendanube' as const
  private token: string
  private userId: string

  constructor(creds: ConnectorCredentials) {
    this.token = creds.accessToken
    this.userId = creds.storeId ?? ''
  }

  private async api(path: string): Promise<Response> {
    return fetch(`${TN_API}/${this.userId}/${path}`, {
      headers: {
        Authentication: `bearer ${this.token}`,
        'User-Agent': 'ForeverAdsApp (soporte@foreverbasics.com.ar)',
        'Content-Type': 'application/json',
      },
    })
  }

  async testConnection() {
    try {
      const res = await this.api('store')
      return res.ok ? { ok: true } : { ok: false, error: `HTTP ${res.status}` }
    } catch (e) {
      return { ok: false, error: (e as Error).message }
    }
  }

  async getOrders(query: OrdersQuery): Promise<NormalizedOrder[]> {
    const params = new URLSearchParams()
    if (query.since) params.set('created_at_min', query.since)
    if (query.until) params.set('created_at_max', query.until)
    params.set('per_page', String(query.limit ?? 200))

    const out: NormalizedOrder[] = []
    let page = 1
    // Paginación por Link header / página incremental
    while (page <= 50) {
      params.set('page', String(page))
      const res = await this.api(`orders?${params.toString()}`)
      if (!res.ok) break
      const data = (await res.json()) as TNOrder[]
      if (!data.length) break
      for (const o of data) out.push(normalizeTNOrder(o))
      if (data.length < (query.limit ?? 200)) break
      page++
    }
    return out
  }

  async getProducts(): Promise<NormalizedProduct[]> {
    const res = await this.api('products?per_page=200')
    if (!res.ok) return []
    const data = (await res.json()) as TNProduct[]
    return data.map((p) => ({
      id: String(p.id),
      name: typeof p.name === 'string' ? p.name : p.name?.es ?? '',
      variants: (p.variants ?? []).map((v) => ({
        id: String(v.id),
        name: (v.values ?? []).map((x) => x.es).filter(Boolean).join(' / ') || 'Default',
        sku: v.sku ?? undefined,
        stock: v.stock ?? null,
        price: Number(v.price) || 0,
      })),
    }))
  }
}

// ── Tipos crudos mínimos de la API TN ──────────────────────────
interface TNOrder {
  id: number
  created_at: string
  total: string
  subtotal?: string
  currency?: string
  shipping_cost_customer?: string
  payment_details?: { installments?: number; method?: string }
  gateway?: string
  shipping?: string
  shipping_address?: { province?: string }
  customer?: { id?: number }
  products?: { product_id: number; variant_id?: number; name: string; quantity: number; price: string }[]
}
interface TNProduct {
  id: number
  name: string | { es?: string }
  variants?: { id: number; values?: { es?: string }[]; sku?: string; stock?: number | null; price?: string }[]
}

function normalizeTNOrder(o: TNOrder): NormalizedOrder {
  return {
    id: String(o.id),
    createdAt: o.created_at,
    totalAmount: Number(o.total) || 0,
    currency: o.currency ?? 'ARS',
    subtotal: Number(o.subtotal) || 0,
    shippingCost: Number(o.shipping_cost_customer) || 0,
    paymentMethod: o.gateway ?? o.payment_details?.method,
    shippingMethod: o.shipping,
    province: o.shipping_address?.province,
    customerId: o.customer?.id ? String(o.customer.id) : undefined,
    items: (o.products ?? []).map((p) => ({
      productId: String(p.product_id),
      variantId: p.variant_id ? String(p.variant_id) : undefined,
      name: p.name,
      quantity: p.quantity,
      unitPrice: Number(p.price) || 0,
    })),
  }
}
