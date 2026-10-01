import { CAMBIOS } from './config'
import {
  buildItems, checkEligibility, classifyZone, emailMatches, shippingAmount, type LookupItem, type Zone,
} from './logic'
import { findOrderByNumber, supabaseAdmin, type TNOrder } from './tiendanube'

export type LookupResult =
  | { ok: false; reason: string }
  | {
      ok: true
      order: TNOrder
      zone: Zone
      amount: number | null
      deadline: string
      items: LookupItem[]
      active: { code: string; status_token: string; type: string; status: string }[]
    }

export async function lookupOrder(orderNumber: string, email: string): Promise<LookupResult> {
  if (!orderNumber || !email) return { ok: false, reason: 'Completá número de orden y email.' }
  const order = await findOrderByNumber(orderNumber)
  if (!order || !emailMatches(order, email)) {
    return { ok: false, reason: 'No encontramos una orden con ese número y email. Revisá que sea el mismo email con el que compraste.' }
  }
  const zone = classifyZone(order)
  const elig = checkEligibility(order, zone)
  if (!elig.ok) return { ok: false, reason: elig.reason }
  const { data: active } = await supabaseAdmin()
    .from('exchanges').select('code, status_token, type, status')
    .eq('tn_order_id', String(order.id)).neq('status', 'cancelado')
  return {
    ok: true, order, zone, amount: shippingAmount(zone, order), deadline: elig.deadline,
    items: await buildItems(order), active: active ?? [],
  }
}

export function pushEvent(events: unknown, type: string, detail?: string) {
  const arr = Array.isArray(events) ? events : []
  return [...arr, { at: new Date().toISOString(), type, detail: detail ?? null }]
}

export const PUBLIC_FIELDS =
  'code, status_token, type, status, order_number, customer_name, zone, shipping_amount, items, receipt_uploaded_at, moto_date, tracking_number, created_at, paid_at, received_at, dispatched_at'

export { CAMBIOS }
