import { NextResponse } from 'next/server'
import { CAMBIOS, PUBLIC_FIELDS, labelInfo } from '@/lib/cambios/service'
import { STATUS_LABEL, ZONE_LABEL } from '@/lib/cambios/config'
import { supabaseAdmin } from '@/lib/cambios/tiendanube'

export const dynamic = 'force-dynamic'

export async function GET(req: Request) {
  const token = new URL(req.url).searchParams.get('token') || ''
  if (token.length < 16) return NextResponse.json({ ok: false }, { status: 404 })
  const sb = supabaseAdmin()
  const { data: raw } = await sb.from('exchanges').select(`${PUBLIC_FIELDS}, events`).eq('status_token', token).single()
  const data = raw as unknown as (Record<string, unknown> & { events: unknown; status: string; code: string; zone: string }) | null
  if (!data) return NextResponse.json({ ok: false }, { status: 404 })
  const label = labelInfo(data.events)
  let label_url: string | null = null
  if (label && data.status !== 'cancelado') {
    const s = await sb.storage.from('exchange-receipts').createSignedUrl(label.path, 7 * 86400, { download: `etiqueta-${data.code}` })
    label_url = s.data?.signedUrl ?? null
  }
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  const { events, ...pub } = data
  return NextResponse.json({
    ok: true,
    exchange: { ...pub, label_url, label_sent_at: label?.at ?? null, status_label: STATUS_LABEL[data.status] ?? data.status, zone_label: ZONE_LABEL[data.zone] ?? data.zone },
    alias: CAMBIOS.alias, cvu: CAMBIOS.cvu, returnAddress: CAMBIOS.returnAddress, whatsapp: CAMBIOS.whatsapp,
  })
}
