import type {
  EcommerceConnector,
  ConnectorCredentials,
  NormalizedOrder,
  NormalizedProduct,
  OrdersQuery,
} from './types'

/**
 * ShopifyConnector — STUB. Estructura lista; implementar con la Admin API.
 *
 * Para completar:
 *   • storeId = "mi-tienda.myshopify.com"; token = Admin API access token
 *   • GET /admin/api/2024-01/orders.json?status=any&created_at_min=...
 *   • Paginación por header Link (rel="next")
 *   • Mapear line_items → items, shipping_lines → shippingCost, etc.
 * Doc: https://shopify.dev/docs/api/admin-rest/latest/resources/order
 */
export class ShopifyConnector implements EcommerceConnector {
  readonly platform = 'shopify' as const
  private shop: string
  private token: string

  constructor(creds: ConnectorCredentials) {
    this.shop = creds.storeId ?? ''
    this.token = creds.accessToken
  }

  async testConnection() {
    return { ok: false, error: 'ShopifyConnector no implementado todavía' }
  }

  async getOrders(_query: OrdersQuery): Promise<NormalizedOrder[]> {
    throw new Error('ShopifyConnector.getOrders no implementado. Ver TODO en el archivo.')
  }

  async getProducts(): Promise<NormalizedProduct[]> {
    throw new Error('ShopifyConnector.getProducts no implementado.')
  }
}
