import { NextResponse } from 'next/server'
import { requireCambiosAdmin } from '@/lib/cambios/adminAuth'
import { sendExchangeEmail } from '@/lib/cambios/email'
import { CAMBIOS } from '@/lib/cambios/config'

export const dynamic = 'force-dynamic'

/** Manda un mail de prueba a la casilla de la tienda para verificar la configuración de Zoho. */
export async function POST() {
  const auth = await requireCambiosAdmin()
  if (auth instanceof NextResponse) return auth
  const to = CAMBIOS.replyTo
  const res = await sendExchangeEmail('creado', {
    id: 'test', code: 'CB-PRUEBA', status_token: 'prueba', type: 'cambio', status: 'pendiente_pago',
    order_number: '0000', customer_name: 'Prueba', email: to, phone: null, zone: 'caba', shipping_amount: CAMBIOS.cabaFee,
    items: [{ name: 'Remera de prueba', variant_label: 'Negro / M', new_variant_label: 'Negro / L', quantity: 1 }],
  })
  return NextResponse.json({ ok: res.ok, to, error: res.error ?? null }, { status: res.ok ? 200 : 502 })
}
