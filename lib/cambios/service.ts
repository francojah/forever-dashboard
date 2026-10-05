import { appendOwnerNote } from './tiendanube'
import { sendExchangeEmail, type EmailKind, type ExchangeRow } from './email'
import { CAMBIOS } from './config'
import {
  buildCatalog, buildItems, checkEligibility, classifyZone, emailMatches, shippingAmount,
  type CatalogProduct, type LookupItem, type Zone,
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
      catalog: CatalogProduct[]
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
  const catalog = await buildCatalog()
  return {
    ok: true, order, zone, amount: shippingAmount(zone, order), deadline: elig.deadline,
    items: buildItems(order, catalog), catalog, active: active ?? [],
  }
}

export function pushEvent(events: unknown, type: string, detail?: string) {
  const arr = Array.isArray(events) ? events : []
  return [...arr, { at: new Date().toISOString(), type, detail: detail ?? null }]
}

export const PUBLIC_FIELDS =
  'code, status_token, type, status, order_number, customer_name, zone, shipping_amount, items, receipt_uploaded_at, moto_date, tracking_number, created_at, paid_at, received_at, dispatched_at'

export { CAMBIOS }

type Ev = { at: string; type: string; detail: string | null }

/** Última etiqueta subida (se guarda la ruta en el historial, sin columnas extra). */
export function labelInfo(events: unknown): { path: string; at: string } | null {
  const arr = (Array.isArray(events) ? events : []) as Ev[]
  for (let i = arr.length - 1; i >= 0; i--) {
    if (arr[i].type === 'etiqueta' && arr[i].detail) {
      const d = arr[i].detail as string
      return { path: d.includes('|') ? d.slice(d.indexOf('|') + 1) : d, at: arr[i].at }
    }
  }
  return null
}


/** Manda el mail al cliente y deja registrado en el historial si salió o falló. */
export async function emailAndLog(kind: EmailKind, row: ExchangeRow & { events?: unknown }) {
  const res = await sendExchangeEmail(kind, row)
  const { data } = await supabaseAdmin().from('exchanges').select('events').eq('id', row.id).single()
  const events = pushEvent(data?.events ?? row.events, res.ok ? 'email' : 'email_error', res.ok ? kind : `${kind}: ${res.error || 'error'}`)
  await supabaseAdmin().from('exchanges').update({ events }).eq('id', row.id)
  return res
}

/** Último intento de mail: null si nunca se intentó. */
export function lastEmail(events: unknown): { ok: boolean; detail: string | null; at: string } | null {
  const arr = (Array.isArray(events) ? events : []) as Ev[]
  for (let i = arr.length - 1; i >= 0; i--) {
    if (arr[i].type === 'email') return { ok: true, detail: arr[i].detail, at: arr[i].at }
    if (arr[i].type === 'email_error') return { ok: false, detail: arr[i].detail, at: arr[i].at }
  }
  return null
}


type NoteRow = {
  id: string; code: string; tn_order_id: string; zone: string; type: string
  items: { name: string; variant_label: string; new_product_name?: string | null; new_variant_label?: string | null; quantity: number }[]
  events?: unknown
}

/** Deja constancia del cambio en la nota interna de la venta original (y lo registra en el historial). */
export async function noteOnOrder(row: NoteRow, what: 'generado' | 'cancelado') {
  if (!CAMBIOS.orderNote || !row.tn_order_id) return
  const today = new Date().toLocaleDateString('es-AR', { day: 'numeric', month: 'numeric', timeZone: 'America/Argentina/Buenos_Aires' })
  const detail = row.items.map((i) =>
    `${i.quantity > 1 ? i.quantity + ' x ' : ''}${i.name} ${i.variant_label}${i.new_variant_label ? ` > ${i.new_product_name ? i.new_product_name + ' ' : ''}${i.new_variant_label}` : ''}`
  ).join('; ')
  const line = what === 'generado'
    ? `[CAMBIO ${row.code}] Generado el ${today}: ${detail}. Ver en ${adminPanelUrl()}`
    : `[CAMBIO ${row.code}] Cancelado el ${today}.`
  const res = await appendOwnerNote(row.tn_order_id, line)
  const { data } = await supabaseAdmin().from('exchanges').select('events').eq('id', row.id).single()
  const events = pushEvent(data?.events ?? row.events, res.ok ? 'nota_tn' : 'nota_tn_error', res.ok ? what : `${what}: ${res.error || 'error'}`)
  await supabaseAdmin().from('exchanges').update({ events }).eq('id', row.id)
}

function adminPanelUrl() {
  return CAMBIOS.publicUrl.includes('cambios.') ? `${CAMBIOS.publicUrl}/admin` : `${CAMBIOS.appUrl}/gestion-cambios`
}
