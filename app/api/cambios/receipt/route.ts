import { NextResponse } from 'next/server'
import { pushEvent } from '@/lib/cambios/service'
import { supabaseAdmin } from '@/lib/cambios/tiendanube'
import { notifyTeam } from '@/lib/cambios/notify'

export const dynamic = 'force-dynamic'

const MAX = 8 * 1024 * 1024
const OK_TYPES: Record<string, string> = {
  'image/jpeg': 'jpg', 'image/png': 'png', 'image/webp': 'webp', 'image/heic': 'heic', 'application/pdf': 'pdf',
}

export async function POST(req: Request) {
  try {
    const form = await req.formData()
    const token = String(form.get('token') || '')
    const file = form.get('file')
    if (!(file instanceof File)) return NextResponse.json({ ok: false, reason: 'Elegí el archivo del comprobante.' })
    if (file.size > MAX) return NextResponse.json({ ok: false, reason: 'El archivo pesa más de 8 MB.' })
    const ext = OK_TYPES[file.type] || (file.name.toLowerCase().endsWith('.pdf') ? 'pdf' : file.type.startsWith('image/') ? 'jpg' : '')
    if (!ext) return NextResponse.json({ ok: false, reason: 'Subí una foto o PDF del comprobante.' })

    const sb = supabaseAdmin()
    const { data: ex } = await sb.from('exchanges').select('id, code, status, events').eq('status_token', token).single()
    if (!ex) return NextResponse.json({ ok: false, reason: 'No encontramos el cambio.' }, { status: 404 })
    if (ex.status !== 'pendiente_pago') return NextResponse.json({ ok: false, reason: 'Este cambio ya no espera comprobante.' })

    const path = `${ex.code}/${Date.now()}.${ext}`
    const up = await sb.storage.from('exchange-receipts').upload(path, Buffer.from(await file.arrayBuffer()), {
      contentType: file.type || 'application/octet-stream', upsert: false,
    })
    if (up.error) throw new Error(up.error.message)
    await sb.from('exchanges').update({
      receipt_path: path, receipt_uploaded_at: new Date().toISOString(),
      events: pushEvent(ex.events, 'comprobante'), updated_at: new Date().toISOString(),
    }).eq('id', ex.id)
    await notifyTeam(`Comprobante subido · ${ex.code}`, 'El cliente subió el comprobante. Revisalo y confirmá la transferencia.')
    return NextResponse.json({ ok: true })
  } catch (e) {
    console.error('[cambios/receipt]', e)
    return NextResponse.json({ ok: false, reason: 'No pudimos subir el archivo. Probá de nuevo.' }, { status: 500 })
  }
}
