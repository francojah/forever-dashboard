/**
 * Stock automático de los cambios:
 *  - reserveExchange: al confirmar el cambio resta en Tiendanube la prenda nueva (queda reservada).
 *  - releaseReservation: si se cancela, la devuelve.
 *  - receiveReturn: al marcar "Prenda recibida OK" suma la prenda que devolvió el cliente (las falladas no).
 * Usa los flags stock_out_done (reserva aplicada) y stock_in_done (devolución sumada) para no duplicar.
 * Si Tiendanube falla, queda registrado y aparece como tarea manual en "Ajustes de stock".
 */
import { adjustVariantStock, supabaseAdmin } from './tiendanube'
import { pushEvent } from './service'
import type { ExchangeItem } from './logic'

type Row = {
  id: string; code: string; type: string; status: string; item_condition?: string | null
  stock_out_done: boolean; stock_in_done: boolean; items: ExchangeItem[]; events?: unknown
}
type Result = { ok: boolean; error?: string }

async function logEvents(id: string, entries: { type: string; detail: string }[], patch: Record<string, unknown> = {}) {
  const sb = supabaseAdmin()
  const { data } = await sb.from('exchanges').select('events').eq('id', id).single()
  let events = data?.events
  for (const e of entries) events = pushEvent(events, e.type, e.detail)
  await sb.from('exchanges').update({ ...patch, events, updated_at: new Date().toISOString() }).eq('id', id)
}

const label = (name: string | null | undefined, v: string | null | undefined, q: number) => `${q > 1 ? q + ' x ' : ''}${name || ''} ${v || ''}`.trim()

/** Resta la prenda nueva. Si alguna falla, revierte las que sí se aplicaron (todo o nada). */
export async function reserveExchange(row: Row): Promise<Result> {
  if (row.type !== 'cambio' || row.stock_out_done) return { ok: true }
  const items = (row.items || []).filter((i) => i.new_variant_id)
  const applied: { pid: number; vid: number; q: number }[] = []
  for (const it of items) {
    const pid = Number(it.new_product_id || it.product_id)
    const vid = Number(it.new_variant_id)
    const q = it.quantity || 1
    const r = await adjustVariantStock(pid, vid, -q)
    if (!r.ok) {
      for (const a of applied) await adjustVariantStock(a.pid, a.vid, a.q)
      await logEvents(row.id, [{ type: 'stock_error', detail: `reserva: ${r.error}` }])
      return { ok: false, error: r.error }
    }
    applied.push({ pid, vid, q })
  }
  const detail = items.map((i) => label(i.new_product_name || i.name, i.new_variant_label, i.quantity || 1)).join('; ')
  await logEvents(row.id, [{ type: 'stock_reserva', detail: `-${detail}` }], { stock_out_done: true })
  return { ok: true }
}

/** Devuelve al stock lo reservado (cuando se cancela). */
export async function releaseReservation(row: Row): Promise<Result> {
  if (row.type !== 'cambio' || !row.stock_out_done) return { ok: true }
  const items = (row.items || []).filter((i) => i.new_variant_id)
  const errors: string[] = []
  for (const it of items) {
    const r = await adjustVariantStock(Number(it.new_product_id || it.product_id), Number(it.new_variant_id), it.quantity || 1)
    if (!r.ok) errors.push(r.error || 'error')
  }
  if (errors.length) {
    await logEvents(row.id, [{ type: 'stock_error', detail: `liberar reserva: ${errors[0]}` }])
    return { ok: false, error: errors[0] }
  }
  const detail = items.map((i) => label(i.new_product_name || i.name, i.new_variant_label, i.quantity || 1)).join('; ')
  await logEvents(row.id, [{ type: 'stock_liberado', detail: `+${detail}` }], { stock_out_done: false })
  return { ok: true }
}

/** Suma al stock la prenda devuelta, solo si llegó en buen estado. */
export async function receiveReturn(row: Row): Promise<Result> {
  if (row.type !== 'cambio' || row.stock_in_done || row.item_condition !== 'ok') return { ok: true }
  const items = (row.items || []).filter((i) => i.variant_id)
  const applied: { pid: number; vid: number; q: number }[] = []
  for (const it of items) {
    const pid = Number(it.product_id), vid = Number(it.variant_id), q = it.quantity || 1
    const r = await adjustVariantStock(pid, vid, q)
    if (!r.ok) {
      for (const a of applied) await adjustVariantStock(a.pid, a.vid, -a.q)
      await logEvents(row.id, [{ type: 'stock_error', detail: `ingreso: ${r.error}` }])
      return { ok: false, error: r.error }
    }
    applied.push({ pid, vid, q })
  }
  const detail = items.map((i) => label(i.name, i.variant_label, i.quantity || 1)).join('; ')
  await logEvents(row.id, [{ type: 'stock_ingreso', detail: `+${detail}` }], { stock_in_done: true })
  return { ok: true }
}
