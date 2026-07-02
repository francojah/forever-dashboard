import type {
  EcommerceConnector,
  ConnectorCredentials,
  NormalizedOrder,
  NormalizedProduct,
  OrdersQuery,
} from './types'

/**
 * WooCommerceConnector — STUB. Estructura lista; implementar con la REST API.
 *
 * Para completar:
 *   • storeId = URL del sitio; token via consumer_key/consumer_secret (Basic Auth)
 *   • GET /wp-json/wc/v3/orders?after=...&per_page=100&page=N
 *   • Mapear line_items → items, shipping_total → shippingCost, etc.
 * Doc: https://woocommerce.github.io/woocommerce-rest-api-docs/
 */
export class WooCommerceConnector implements EcommerceConnector {
  readonly platform = 'woocommerce' as const
  private siteUrl: string
  private key: string
  private secret: string

  constructor(creds: ConnectorCredentials) {
    this.siteUrl = creds.storeId ?? ''
    this.key = creds.accessToken
    this.secret = creds.extra?.consumerSecret ?? ''
  }

  async testConnection() {
    return { ok: false, error: 'WooCommerceConnector no implementado todavía' }
  }

  async getOrders(_query: OrdersQuery): Promise<NormalizedOrder[]> {
    throw new Error('WooCommerceConnector.getOrders no implementado. Ver TODO en el archivo.')
  }

  async getProducts(): Promise<NormalizedProduct[]> {
    throw new Error('WooCommerceConnector.getProducts no implementado.')
  }
}
