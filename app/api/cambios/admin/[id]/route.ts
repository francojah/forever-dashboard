import { NextResponse } from 'next/server'
import { requireCambiosAdmin } from '@/lib/cambios/adminAuth'
import { supabaseAdmin } from '@/lib/cambios/tiendanube'
import { pushEvent, emailAndLog, labelInfo } from '@/lib/cambios/service'
import { kindForStatus, type EmailKind, type ExchangeRow } from '@/lib/cambios/email'

export const dynamic = 'force-dynamic'

type Patch = Record<string, unknown>

export async function POST(req: Request, { params }: { params: { id: string } }) {
  const auth = await requireCambiosAdmin()
  if (auth instanceof NextResponse) return auth
  try {
    const body = await req.json()
    const action = String(body.action || '')
    const sb = supabaseAdmin()
    const { data: ex } = await sb.from('exchanges').select('*').eq('id', params.id).single()
    if (!ex) return NextResponse.json({ ok: false, error: 'No existe' }, { status: 404 })

    const now = new Date().toISOString()
    let patch: Patch = {}
    let email: EmailKind | null = null
    const bad = (m: string) => NextResponse.json({ ok: false, error: m }, { status: 400 })

    switch (action) {
      case 'set_amount': {
        const amount = Number(body.amount)
        if (!Number.isFinite(amount) || amount < 0) return bad('Monto inválido')
        patch = { shipping_amount: Math.round(amount) }
        if (ex.status === 'pendiente_pago') email = 'monto'
        break
      }
      case 'confirm_payment':
        if (ex.status !== 'pendiente_pago') return bad('No está esperando pago')
        if (ex.shipping_amount == null) return bad('Primero cargá el monto del envío')
        patch = { status: 'pago_confirmado', paid_at: now }
        email = 'pago_confirmado'
        break
      case 'mark_received': {
        const condition = body.condition === 'fallada' ? 'fallada' : 'ok'
        if (ex.zone === 'correo' || ex.zone === 'otro') {
          if (ex.status !== 'pago_confirmado' && ex.status !== 'etiqueta_enviada') return bad('Primero confirmá el pago')
          patch = { status: 'prenda_recibida', received_at: now, item_condition: condition }
          email = 'prenda_recibida'
        } else {
          // Moto: la prenda vuelve en el mismo viaje; solo registramos el estado
          if (ex.status !== 'despachado') return bad('Primero marcá la moto como coordinada')
          patch = { received_at: now, item_condition: condition }
        }
        break
      }
      case 'set_moto': {
        const date = String(body.date || '').trim()
        if (!date) return bad('Indicá el día/franja de la moto')
        if (ex.status !== 'pago_confirmado' && ex.status !== 'despachado') return bad('Primero confirmá el pago')
        patch = { status: 'despachado', moto_date: date, dispatched_at: ex.dispatched_at ?? now }
        email = 'despachado'
        break
      }
      case 'set_tracking': {
        const tracking = String(body.tracking || '').trim()
        if (!tracking) return bad('Pegá el número de seguimiento')
        if (ex.status !== 'prenda_recibida' && ex.status !== 'despachado') return bad('Primero marcá la prenda como recibida')
        patch = { status: 'despachado', tracking_number: tracking, dispatched_at: ex.dispatched_at ?? now }
        email = 'despachado'
        break
      }
      case 'resend_email':
        email = kindForStatus(ex, !!labelInfo(ex.events))
        break
      case 'resolve':
        patch = { status: 'resuelto' }
        email = 'resuelto'
        break
      case 'cancel':
        patch = { status: 'cancelado' }
        email = body.notify === false ? null : 'cancelado'
        break
      case 'stock_out':
        patch = { stock_out_done: !!body.value }
        break
      case 'stock_in':
        patch = { stock_in_done: !!body.value }
        break
      case 'note':
        patch = { internal_note: String(body.text ?? '').slice(0, 2000) }
        break
      default:
        return bad('Acción desconocida')
    }

    let events = pushEvent(ex.events, action, [auth.user, typeof body.detail === 'string' ? body.detail : ''].filter(Boolean).join(': '))
    const { data: updated, error } = await sb.from('exchanges')
      .update({ ...patch, events, updated_at: now }).eq('id', ex.id).select('*').single()
    if (error || !updated) throw new Error(error?.message || 'update failed')

    let emailSent = false
    let emailError: string | null = null
    if (email) {
      const res = await emailAndLog(email, updated as ExchangeRow)
      emailSent = res.ok
      emailError = res.ok ? null : res.error || 'error'
    }
    return NextResponse.json({ ok: true, emailSent, emailError, emailKind: email })
  } catch (e) {
    console.error('[cambios/admin/update]', e)
    return NextResponse.json({ ok: false, error: (e as Error).message }, { status: 500 })
  }
}
