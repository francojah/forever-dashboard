import { NextResponse } from 'next/server'
import { requireCambiosAdmin } from '@/lib/cambios/adminAuth'
import { listMotoOrdersToPack } from '@/lib/cambios/motoOrders'

export const dynamic = 'force-dynamic'

/** Ventas con envío por moto para empaquetar. ?pendientes=1 incluye pagos pendientes. */
export async function GET(req: Request) {
  const auth = await requireCambiosAdmin()
  if (auth instanceof NextResponse) return auth
  try {
    const includePending = new URL(req.url).searchParams.get('pendientes') === '1'
    return NextResponse.json({ ok: true, orders: await listMotoOrdersToPack(includePending) })
  } catch (e) {
    console.error('[cambios/admin/envios-moto]', e)
    return NextResponse.json({ ok: false, error: (e as Error).message }, { status: 500 })
  }
}
