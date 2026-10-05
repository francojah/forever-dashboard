import { NextResponse } from 'next/server'
import { requireCambiosAdmin } from '@/lib/cambios/adminAuth'
import { supabaseAdmin } from '@/lib/cambios/tiendanube'
import { pushEvent, emailAndLog } from '@/lib/cambios/service'
import type { ExchangeRow } from '@/lib/cambios/email'

export const dynamic = 'force-dynamic'

const TYPES: Record<string, string> = { 'application/pdf': 'pdf', 'image/png': 'png', 'image/jpeg': 'jpg', 'image/webp': 'webp' }

/** Sube la etiqueta de Correo para que el cliente la descargue desde su página de estado. */
export async function POST(req: Request, { params }: { params: { id: string } }) {
  const auth = await requireCambiosAdmin()
  if (auth instanceof NextResponse) return auth
  try {
    const form = await req.formData()
    const file = form.get('file')
    if (!(file instanceof File)) return NextResponse.json({ ok: false, error: 'Elegí el archivo de la etiqueta' }, { status: 400 })
    const ext = TYPES[file.type] || (file.name.toLowerCase().endsWith('.pdf') ? 'pdf' : '')
    if (!ext) return NextResponse.json({ ok: false, error: 'Subí un PDF o imagen' }, { status: 400 })
    if (file.size > 10 * 1024 * 1024) return NextResponse.json({ ok: false, error: 'Máximo 10 MB' }, { status: 400 })

    const sb = supabaseAdmin()
    const { data: ex } = await sb.from('exchanges').select('*').eq('id', params.id).single()
    if (!ex) return NextResponse.json({ ok: false, error: 'No existe' }, { status: 404 })
    if (ex.status !== 'pago_confirmado' && ex.status !== 'etiqueta_enviada') return NextResponse.json({ ok: false, error: 'Primero confirmá el pago' }, { status: 400 })

    const path = `${ex.code}/etiqueta-${Date.now()}.${ext}`
    const up = await sb.storage.from('exchange-receipts').upload(path, Buffer.from(await file.arrayBuffer()), {
      contentType: file.type || 'application/pdf', upsert: false,
    })
    if (up.error) throw new Error(up.error.message)
    const events = pushEvent(ex.events, 'etiqueta', `${auth.user}|${path}`)
    // Subir la etiqueta pasa el cambio a "Etiqueta recibida" (estado propio que ve el cliente)
    const { data: updated, error } = await sb.from('exchanges')
      .update({ status: 'etiqueta_enviada', events, updated_at: new Date().toISOString() }).eq('id', ex.id).select('*').single()
    if (error || !updated) throw new Error(error?.message || 'update failed')
    const res = await emailAndLog('etiqueta', updated as ExchangeRow)
    return NextResponse.json({ ok: true, emailSent: res.ok, emailError: res.ok ? null : res.error, emailKind: 'etiqueta' })
  } catch (e) {
    console.error('[cambios/admin/label]', e)
    return NextResponse.json({ ok: false, error: (e as Error).message }, { status: 500 })
  }
}
