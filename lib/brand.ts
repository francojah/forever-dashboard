/**
 * brand.ts — Configuración white-label del producto.
 *
 * Modelo elegido: MARCA PROPIA + MULTI-CLIENTE.
 *   - PRODUCT_* = tu marca (la del proveedor/agencia), visible en toda la app.
 *   - El logo del CLIENTE (cada ecommerce) se muestra por separado y sale de
 *     la tabla `brands` (campo settings.logo_url) o de props.
 *
 * Todo overrideable por env para no tocar código al rebrandear.
 */

export const PRODUCT = {
  name: process.env.NEXT_PUBLIC_PRODUCT_NAME || 'Ecom Intelligence',
  tagline: process.env.NEXT_PUBLIC_PRODUCT_TAGLINE || 'Meta Ads + Ecommerce en un solo lugar',
  // Logo del producto (tu marca). Si no hay, se usa el monograma de abajo.
  logoUrl: process.env.NEXT_PUBLIC_PRODUCT_LOGO || '',
  // Color de marca en HEX (se inyecta como --brand-600). Default indigo.
  accent: process.env.NEXT_PUBLIC_BRAND_ACCENT || '#4f46e5',
}

/** Iniciales para el monograma cuando no hay logo. */
export function productMonogram(): string {
  return PRODUCT.name
    .split(/\s+/)
    .slice(0, 2)
    .map((w) => w[0])
    .join('')
    .toUpperCase()
}

/** Datos de marca del CLIENTE (ecommerce). Vendrán de brands.settings. */
export interface ClientBrand {
  name: string
  logoUrl?: string
  storeUrl?: string
  adsManagerUrl?: string
}

export const DEFAULT_CLIENT_BRAND: ClientBrand = {
  name: process.env.NEXT_PUBLIC_CLIENT_NAME || 'Forever Basics',
  logoUrl:
    process.env.NEXT_PUBLIC_CLIENT_LOGO ||
    'https://acdn-us.mitiendanube.com/stores/004/250/257/themes/common/logo-1587041462-1768339200-c3f713972515246e9c2f02029356d7da1768339200-480-0.webp',
  storeUrl: 'https://foreverbasics.com.ar/',
  adsManagerUrl: 'https://adsmanager.facebook.com/adsmanager/manage/campaigns?act=1614288152915913',
}
