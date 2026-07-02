import type { ConnectorCredentials, EcommerceConnector } from './types'
import { TiendanubeConnector } from './tiendanube'
import { ShopifyConnector } from './shopify'
import { WooCommerceConnector } from './woocommerce'

export * from './types'

/**
 * Factory: devuelve el conector correcto según la plataforma.
 * Uso:
 *   const connector = getConnector({ platform: 'tiendanube', accessToken, storeId })
 *   const orders = await connector.getOrders({ since })
 */
export function getConnector(creds: ConnectorCredentials): EcommerceConnector {
  switch (creds.platform) {
    case 'tiendanube':
      return new TiendanubeConnector(creds)
    case 'shopify':
      return new ShopifyConnector(creds)
    case 'woocommerce':
      return new WooCommerceConnector(creds)
    default:
      throw new Error(`Plataforma de ecommerce no soportada: ${creds.platform}`)
  }
}
