import { NextResponse } from 'next/server'
import { lookupOrder, pushEvent, emailAndLog } from '@/lib/cambios/service'
import { amountDue, canTarget, customerInfo, priceDiff, randomToken, type ExchangeItem } from '@/lib/cambios/logic'
import { REASONS } from '@/lib/cambios/config'
import { supabaseAdmin } from '@/lib/cambios/tiendanube'
import type { ExchangeRow } from '@/lib/cambios/email'
import { notifyTeam } from '@/lib/cambios/notify'
import { ZONE_LABEL } from '@/lib/cambios/config'

export const dynamic = 'force-dynamic'

type Sel = { key: string; reason?: string; new_product_id?: number | null; new_variant_id?: number | null }

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
      let target: { product_id: number; name: string; variant_id: number; label: string; diff: number } | null = null
      if (type === 'cambio') {
        const pid = Number(s.new_product_id) || it.product_id
        const prod = r.catalog.find((c) => c.product_id === pid)
        if (!prod || !canTarget(it, prod)) return NextResponse.json({ ok: false, reason: `Elegí un producto válido para ${it.name}.` })
        const v = prod.variants.find((x) => x.variant_id === Number(s.new_variant_id))
        if (!v) return NextResponse.json({ ok: false, reason: `Elegí el talle/color nuevo para ${it.name}.` })
        if (v.available < it.quantity) return NextResponse.json({ ok: false, reason: `Se agotó ${prod.name} ${v.label}. Elegí otra opción.` })
        target = { product_id: prod.product_id, name: prod.name, variant_id: v.variant_id, label: v.label, diff: priceDiff(it, v.price) }
      }
      items.push({
        product_id: it.product_id, variant_id: it.variant_id, name: it.name, variant_label: it.variant_label,
        quantity: it.quantity, reason: validReasons.includes(String(s.reason)) ? String(s.reason) : 'otro',
        new_product_id: target ? target.product_id : null,
        new_product_name: target && target.product_id !== it.product_id ? target.name : null,
        new_variant_id: target ? target.variant_id : null,
        new_variant_label: target ? target.label : null,
        price_diff: target ? target.diff : 0,
      })
    }

    const c = customerInfo(r.order)
    const str = (v: unknown, max = 160) => String(v ?? '').replace(/\s+/g, ' ').trim().slice(0, max)
    let phone = str(body.phone, 40) || c.phone
    let customerName = c.name
    let address: Record<string, unknown> = c.address

    if (type === 'cambio' && (r.zone === 'caba' || r.zone === 'moto_gba')) {
      // Moto: el cliente completa los datos de retiro/entrega (salen en la etiqueta que imprime el equipo)
      const sh = (body.shipping ?? {}) as Record<string, unknown>
      const full = str(sh.full_name, 90), wa = str(sh.phone, 40), street = str(sh.street, 140), locality = str(sh.locality, 90)
      if (full.split(' ').length < 2) return NextResponse.json({ ok: false, reason: 'Completá tu nombre y apellido.' })
      if (wa.replace(/\D/g, '').length < 8) return NextResponse.json({ ok: false, reason: 'Completá tu WhatsApp.' })
      if (street.length < 5 || !/\d/.test(street)) return NextResponse.json({ ok: false, reason: 'Completá la dirección con calle y altura.' })
      if (locality.length < 2) return NextResponse.json({ ok: false, reason: 'Completá la localidad o barrio.' })
      customerName = full
      phone = wa
      address = {
        name: full, street, floor: str(sh.floor, 60), locality, city: '',
        province: c.address.province, zipcode: str(sh.zipcode, 12), notes: str(sh.notes, 240), source: 'cliente',
      }
    }

    if (type === 'cambio' && r.zone === 'correo') {
      // Correo: el cliente elige desde qué sucursal despacha
      const b = (body.branch ?? {}) as Record<string, unknown>
      const name = str(b.name, 140)
      if (name.length < 3) return NextResponse.json({ ok: false, reason: 'Elegí la sucursal de Correo Argentino desde donde vas a despachar.' })
      address = {
        ...c.address,
        dispatch_branch: { name, address: str(b.address, 160), locality: str(b.locality, 100), province: str(b.province, 60), hours: str(b.hours, 120) },
      }
    }
    const row = {
      status_token: randomToken(),
      type,
      // Sin nada que pagar (envío sin costo y sin diferencia): queda listo para coordinar
      status: type !== 'cambio' ? 'revision' : amountDue(r.amount, items) === 0 ? 'pago_confirmado' : 'pendiente_pago',
      tn_order_id: String(r.order.id),
      order_number: String(r.order.number),
      customer_name: customerName,
      email: String(body.email).trim().toLowerCase(),
      phone,
      zone: r.zone,
      shipping_option: r.order.shipping_option,
      address,
      shipping_amount: type === 'cambio' ? r.amount : null,
      items,
      customer_note: String(body.note ?? '').slice(0, 1000) || null,
      events: pushEvent([], 'creado', type === 'cambio' && amountDue(r.amount, items) === 0 ? 'sin costo' : undefined),
    }
    const { data, error } = await supabaseAdmin().from('exchanges').insert(row).select('*').single()
    if (error || !data) throw new Error(error?.message || 'insert failed')
    const due = amountDue(data.shipping_amount, items)
    await Promise.all([
      emailAndLog('creado', data as ExchangeRow),
      notifyTeam(
        `Nuevo cambio ${data.code}`,
        `Orden #${data.order_number} · ${ZONE_LABEL[data.zone] ?? data.zone} · ${items.length} prenda${items.length > 1 ? 's' : ''} · ${due == null ? 'monto a confirmar' : due === 0 ? 'sin costo' : '$' + Math.round(due).toLocaleString('es-AR')}`,
      ),
    ])
    return NextResponse.json({ ok: true, token: data.status_token, code: data.code })
  } catch (e) {
    console.error('[cambios/submit]', e)
    return NextResponse.json({ ok: false, reason: 'No pudimos registrar el pedido. Probá de nuevo.' }, { status: 500 })
  }
}
