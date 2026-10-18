/**
 * Vencimiento de cambios sin pago:
 *  - a las 24 h sin comprobante → mail recordatorio (una vez)
 *  - a las 48 h sin comprobante → se cancela solo, se libera la reserva de stock y se avisa al cliente
 * Si el cliente ya subió el comprobante no se cancela: lo decide el equipo.
 * Corre una vez por día (cron) y además cada vez que se abre el panel (como mucho cada 30 min).
 */
import { CAMBIOS } from './config'
import { supabaseAdmin } from './tiendanube'
import { emailAndLog, noteOnOrder, pushEvent } from './service'
import { releaseReservation } from './stock'
import type { ExchangeRow } from './email'

const LAST_KEY = 'cambios_expiry_last'
const H = 3600000

export async function runExpiry(opts: { force?: boolean } = {}) {
  const sb = supabaseAdmin()
  if (!opts.force) {
    const { data } = await sb.from('app_config').select('value').eq('key', LAST_KEY).maybeSingle()
    const last = Number((data?.value as { at?: number } | null)?.at || 0)
    if (Date.now() - last < 30 * 60000) return { skipped: true, reminded: 0, cancelled: 0 }
  }
  await sb.from('app_config').upsert({ key: LAST_KEY, value: { at: Date.now() } }, { onConflict: 'key' })

  const hold = CAMBIOS.pendingHoldHours // 48
  const { data: rows } = await sb.from('exchanges').select('*')
    .eq('type', 'cambio').eq('status', 'pendiente_pago').is('receipt_uploaded_at', null)
  let reminded = 0
  let cancelled = 0
  for (const r of rows ?? []) {
    const age = Date.now() - new Date(r.created_at).getTime()
    const events = (Array.isArray(r.events) ? r.events : []) as { type: string }[]
    if (age >= hold * H) {
      const now = new Date().toISOString()
      const { data: updated } = await sb.from('exchanges')
        .update({ status: 'cancelado', events: pushEvent(r.events, 'vencido', `sin pago en ${hold} h`), updated_at: now })
        .eq('id', r.id).eq('status', 'pendiente_pago').select('*').single()
      if (!updated) continue
      await releaseReservation(updated)
      await emailAndLog('vencido', updated as ExchangeRow)
      await noteOnOrder(updated, 'cancelado')
      cancelled++
    } else if (age >= (hold / 2) * H && !events.some((e) => e.type === 'recordatorio')) {
      await sb.from('exchanges').update({ events: pushEvent(r.events, 'recordatorio') }).eq('id', r.id)
      await emailAndLog('recordatorio', r as ExchangeRow)
      reminded++
    }
  }
  return { skipped: false, reminded, cancelled }
}
