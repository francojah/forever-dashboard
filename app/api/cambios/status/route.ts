import { NextResponse } from 'next/server'
import { CAMBIOS, PUBLIC_FIELDS } from '@/lib/cambios/service'
import { STATUS_LABEL, ZONE_LABEL } from '@/lib/cambios/config'
import { supabaseAdmin } from '@/lib/cambios/tiendanube'

export const dynamic = 'force-dynamic'

export async function GET(req: Request) {
  const token = new URL(req.url).searchParams.get('token') || ''
  if (token.length < 16) return NextResponse.json({ ok: false }, { status: 404 })
  const { data } = await supabaseAdmin().from('exchanges').select(PUBLIC_FIELDS).eq('status_token', token).single()
  if (!data) return NextResponse.json({ ok: false }, { status: 404 })
  return NextResponse.json({
    ok: true,
    exchange: { ...data, status_label: STATUS_LABEL[data.status] ?? data.status, zone_label: ZONE_LABEL[data.zone] ?? data.zone },
    alias: CAMBIOS.alias, returnAddress: CAMBIOS.returnAddress, whatsapp: CAMBIOS.whatsapp,
  })
}
