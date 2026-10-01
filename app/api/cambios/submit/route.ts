import { NextResponse } from 'next/server'
import { lookupOrder, pushEvent } from '@/lib/cambios/service'
import { customerInfo, randomToken, type ExchangeItem } from '@/lib/cambios/logic'
import { REASONS } from '@/lib/cambios/config'
import { supabaseAdmin } from '@/lib/cambios/tiendanube'
import { sendExchangeEmail, type ExchangeRow } from '@/lib/cambios/email'

export const dynamic = 'force-dynamic'

type Sel = { key: string; reason?: string; new_variant_id?: number | null }

export async function POST(req: Request) {
  try {
    const body = await req.json()
    const type = ['cambio', 'otro_modelo'].includes(body.type) ? body.type : 'cambio'
    const sels: Sel[] = Array.isArray(body.items) ? body.items : []
    if (!sels.length) return NextResponse.json({ ok: false, reason: 'Elegí al menos una prenda.' })

    const r = await lookupOrder(String(body.orderNumber ?? ''), String(body.email ?? ''))
    if (!r.ok) return NextResponse.json(r)

    // Evitar duplicados: si ya hay un cambio activo para esta orden, devolver ese
    const dup = r.active.find((a) => a.type === type)
    if (dup) return NextResponse.json({ ok: true, token: dup.status_token, code: dup.code, existing: true })

    const validReasons = REASONS.map((x) => x.id as string)
    const items: ExchangeItem[] = []
    for (const s of sels) {
      const it = r.items.find((x) => x.key === s.key)
      if (!it) return NextResponse.json({ ok: false, reason: 'Hay una prenda que no pertenece a la orden.' })
      if (String(s.reason) === 'otro') {
        return NextResponse.json({ ok: false, reason: 'Para otros motivos escribinos por WhatsApp.' })
      }
      if (!it.exchangeable) {
        return NextResponse.json({ ok: false, reason: `${it.name} no admite cambio.` })
      }
      let newLabel: string | null = null
      if (type === 'cambio') {
        const opt = it.options.find((o) => o.variant_id === Number(s.new_variant_id))
        if (!opt) return NextResponse.json({ ok: false, reason: `Elegí el talle/color nuevo para ${it.name}.` })
        if (opt.available < it.quantity) {
          return NextResponse.json({ ok: false, reason: `Se agotó ${it.name} ${opt.label}. Elegí otra opción.` })
        }
        newLabel = opt.label
      }
      items.push({
        product_id: it.product_id, variant_id: it.variant_id, name: it.name, variant_label: it.variant_label,
        quantity: it.quantity, reason: validReasons.includes(String(s.reason)) ? String(s.reason) : 'otro',
        new_variant_id: type === 'cambio' ? Number(s.new_variant_id) : null, new_variant_label: newLabel,
      })
    }

    const c = customerInfo(r.order)
    const phone = String(body.phone ?? '').trim() || c.phone
    const row = {
      status_token: randomToken(),
      type,
      // Sin costo (punto de retiro): no hay pago, queda listo para coordinar
      status: type !== 'cambio' ? 'revision' : r.amount === 0 ? 'pago_confirmado' : 'pendiente_pago',
      tn_order_id: String(r.order.id),
      order_number: String(r.order.number),
      customer_name: c.name,
      email: String(body.email).trim().toLowerCase(),
      phone,
      zone: r.zone,
      shipping_option: r.order.shipping_option,
      address: c.address,
      shipping_amount: type === 'cambio' ? r.amount : null,
      items,
      customer_note: String(body.note ?? '').slice(0, 1000) || null,
      events: pushEvent([], 'creado', type === 'cambio' && r.amount === 0 ? 'sin costo' : undefined),
    }
    const { data, error } = await supabaseAdmin().from('exchanges').insert(row).select('*').single()
    if (error || !data) throw new Error(error?.message || 'insert failed')
    const sent = await sendExchangeEmail('creado', data as ExchangeRow)
    if (sent) {
      await supabaseAdmin().from('exchanges').update({ events: pushEvent(data.events, 'email', 'creado') }).eq('id', data.id)
    }
    return NextResponse.json({ ok: true, token: data.status_token, code: data.code })
  } catch (e) {
    console.error('[cambios/submit]', e)
    return NextResponse.json({ ok: false, reason: 'No pudimos registrar el pedido. Probá de nuevo.' }, { status: 500 })
  }
}
