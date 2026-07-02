/**
 * types.ts — Contrato común de conectores de ecommerce.
 *
 * Hoy la app está cableada a Tiendanube. Para venderla a otros ecommerce
 * (Shopify, WooCommerce, etc.) toda la lógica de plataforma debe pasar por
 * esta interfaz. Cada plataforma implementa `EcommerceConnector` y la app
 * consume SIEMPRE el tipo normalizado (NormalizedOrder / NormalizedProduct),
 * nunca el formato crudo de cada API.
 */

export type EcommercePlatform = 'tiendanube' | 'shopify' | 'woocommerce'

export interface ConnectorCredentials {
  platform: EcommercePlatform
  accessToken: string
  storeId?: string // TN user_id / Shopify shop domain / Woo site URL
  extra?: Record<string, string>
}

/** Pedido normalizado — forma única que consume toda la app. */
export interface NormalizedOrder {
  id: string
  createdAt: string // ISO
  totalAmount: number
  currency: string
  subtotal: number
  shippingCost: number
  installmentsCost?: number // cuotas sin interés absorbidas
  paymentMethod?: string
  shippingMethod?: string
  province?: string
  customerId?: string
  items: {
    productId: string
    variantId?: string
    name: string
    quantity: number
    unitPrice: number
  }[]
}

/** Producto normalizado. */
export interface NormalizedProduct {
  id: string
  name: string
  variants: {
    id: string
    name: string
    sku?: string
    stock: number | null
    price: number
  }[]
}

export interface OrdersQuery {
  since?: string // ISO
  until?: string
  limit?: number
}

/** Interfaz que toda plataforma debe implementar. */
export interface EcommerceConnector {
  readonly platform: EcommercePlatform

  /** Verifica que las credenciales funcionen. */
  testConnection(): Promise<{ ok: boolean; error?: string }>

  /** Trae pedidos normalizados en un rango de fechas (con paginación interna). */
  getOrders(query: OrdersQuery): Promise<NormalizedOrder[]>

  /** Trae productos + stock normalizados. */
  getProducts(): Promise<NormalizedProduct[]>
}
