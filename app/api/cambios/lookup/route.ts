import { NextResponse } from 'next/server'
import { ZONE_LABEL, REASONS, CAMBIOS, PROVINCIAS, provinceCode } from '@/lib/cambios/config'
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
        provinceCode: provinceCode(r.order.shipping_address?.province),
        needsAddress: r.zone === 'caba' || r.zone === 'moto_gba',
        needsBranch: r.zone === 'correo',
      },
      items: r.items,
      catalog: r.catalog,
      active: r.active.map((a) => ({ code: a.code, token: a.status_token, type: a.type, status: a.status })),
      reasons: REASONS,
      alias: CAMBIOS.alias,
      whatsapp: CAMBIOS.whatsapp,
      provincias: PROVINCIAS,
      storeUrl: CAMBIOS.storeUrl,
    })
  } catch (e) {
    console.error('[cambios/lookup]', e)
    return NextResponse.json({ ok: false, reason: 'No pudimos consultar la orden. Probá de nuevo en un rato.' }, { status: 500 })
  }
}
