import { NextResponse } from 'next/server'
import { ZONE_LABEL, REASONS, CAMBIOS, PROVINCIAS, provinceCode } from '@/lib/cambios/config'
import { lookupOrder } from '@/lib/cambios/service'
import { customerInfo, deliveryOptions, recommendedOption } from '@/lib/cambios/logic'
import { partidoOptions } from '@/lib/cambios/motoZones'

export const dynamic = 'force-dynamic'

export async function POST(req: Request) {
  try {
    const { orderNumber, email } = await req.json()
    const r = await lookupOrder(String(orderNumber ?? ''), String(email ?? ''))
    if (!r.ok) return NextResponse.json(r)
    const c = customerInfo(r.order)
    const d = deliveryOptions(r.zone, r.order)
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
      delivery: {
        options: d.options.map((x) => ({ ...x, label: ZONE_LABEL[x.zone] })),
        recommended: recommendedOption(d.options).kind,
        partido: d.detected?.partido ?? null,
        // Si no reconocimos el partido (o compró por correo en AMBA), el cliente puede elegirlo para ver si llega la moto
        partidos: r.zone === 'correo' && d.canPickPartido ? partidoOptions() : [],
        correoAmount: d.options.find((x) => x.kind === 'correo')?.amount ?? null,
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
