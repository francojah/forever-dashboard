import { NextResponse } from 'next/server'
import { requireCambiosAdmin } from '@/lib/cambios/adminAuth'
import { getMotoOrdersByIds, markPrinted } from '@/lib/cambios/motoOrders'
import { buildMotoLabelsPdf, type LabelFormat } from '@/lib/cambios/motoLabelsPdf'

export const dynamic = 'force-dynamic'

/** PDF de etiquetas. ?ids=123,456&formato=a4|10x15 */
export async function GET(req: Request) {
  const auth = await requireCambiosAdmin()
  if (auth instanceof NextResponse) return auth
  try {
    const q = new URL(req.url).searchParams
    const ids = (q.get('ids') || '').split(',').map((s) => Number(s.trim())).filter((n) => Number.isInteger(n) && n > 0).slice(0, 60)
    if (!ids.length) return NextResponse.json({ ok: false, error: 'Elegí al menos una venta' }, { status: 400 })
    const format: LabelFormat = q.get('formato') === '10x15' ? '10x15' : 'a4'
    const orders = await getMotoOrdersByIds(ids)
    if (!orders.length) return NextResponse.json({ ok: false, error: 'No se encontraron las ventas' }, { status: 404 })
    const bytes = await buildMotoLabelsPdf(orders, format)
    await markPrinted(orders.map((o) => o.id))
    const day = new Date().toLocaleDateString('es-AR', { day: '2-digit', month: '2-digit', timeZone: 'America/Argentina/Buenos_Aires' }).replace('/', '-')
    return new NextResponse(Buffer.from(bytes), {
      headers: {
        'Content-Type': 'application/pdf',
        'Content-Disposition': `inline; filename="etiquetas-moto-${day}.pdf"`,
        'Cache-Control': 'no-store',
      },
    })
  } catch (e) {
    console.error('[cambios/admin/envios-moto/pdf]', e)
    return NextResponse.json({ ok: false, error: (e as Error).message }, { status: 500 })
  }
}
