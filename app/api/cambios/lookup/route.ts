import { NextResponse } from 'next/server'
import { ZONE_LABEL, REASONS, CAMBIOS } from '@/lib/cambios/config'
import { lookupOrder } from '@/lib/cambios/service'
import { customerInfo } from '@/lib/cambios/logic'

export const dynamic = 'force-dynamic'

export async function POST(req: Request) {
  try {
    const { orderNumber, email } = await req.json()
    const r = await lookupOrder(String(orderNumber ?? ''), String(email ?? ''))
    if (!r.ok) return NextResponse.json(r)
    const c = customerInfo(r.order)
    return NextResponse.json({
      ok: true,
      order: {
        number: r.order.number,
        customerName: c.name.split(' ')[0] || '',
        hasPhone: !!c.phone,
        zone: r.zone,
        zoneLabel: ZONE_LABEL[r.zone],
        shippingAmount: r.amount,
        deadline: r.deadline,
      },
      items: r.items,
      active: r.active.map((a) => ({ code: a.code, token: a.status_token, type: a.type, status: a.status })),
      reasons: REASONS,
      alias: CAMBIOS.alias,
      whatsapp: CAMBIOS.whatsapp,
    })
  } catch (e) {
    console.error('[cambios/lookup]', e)
    return NextResponse.json({ ok: false, reason: 'No pudimos consultar la orden. Probá de nuevo en un rato.' }, { status: 500 })
  }
}
