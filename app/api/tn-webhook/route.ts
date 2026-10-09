/**
 * Endpoint viejo del webhook de Tiendanube (puede seguir registrado en la tienda).
 * Ahora hace lo mismo que /api/v2/webhooks/tiendanube: actualiza esa orden en Faro.
 */
export { POST, GET } from '../v2/webhooks/tiendanube/route'
export const dynamic = 'force-dynamic'
