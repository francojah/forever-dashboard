import { NextResponse } from 'next/server'
import { requireAuth } from '@/lib/auth'
import { supabaseAdmin, getProduct } from '@/lib/cambios/tiendanube'
import { reservedByVariant, type ExchangeItem } from '@/lib/cambios/logic'
import { whatsappText, type EmailKind, type ExchangeRow } from '@/lib/cambios/email'
import { labelInfo } from '@/lib/cambios/service'
import { CAMBIOS, STATUS_LABEL, ZONE_LABEL, REASONS } from '@/lib/cambios/config'

export const dynamic = 'force-dynamic'

const KIND_BY_STATUS: Record<string, EmailKind> = {
  pendiente_pago: 'creado', revision: 'creado', pago_confirmado: 'pago_confirmado',
  prenda_recibida: 'prenda_recibida', despachado: 'despachado', resuelto: 'resuelto', cancelado: 'cancelado',
}

export async function GET() {
  const auth = await requireAuth()
  if (auth instanceof NextResponse) return auth
  try {
    const sb = supabaseAdmin()
    const { data, error } = await sb.from('exchanges').select('*').order('created_at', { ascending: false }).limit(300)
    if (error) throw new Error(error.message)
    const rows = data ?? []

    // Alertas de stock: variantes comprometidas cuyo stock en TN ya no alcanza
    const reserved = await reservedByVariant()
    const productIds = new Set<number>()
    for (const r of rows) {
      if (r.type !== 'cambio' || r.stock_out_done || ['cancelado'].includes(r.status)) continue
      for (const it of r.items as ExchangeItem[]) if (it.new_variant_id) productIds.add(it.product_id)
    }
    const tnStock = new Map<string, number>()
    for (const pid of Array.from(productIds)) {
      const p = await getProduct(pid).catch(() => null)
      for (const v of p?.variants ?? []) tnStock.set(String(v.id), v.stock === null ? 999 : Number(v.stock) || 0)
    }

    const out = await Promise.all(rows.map(async (r) => {
      let receipt_url: string | null = null
      if (r.receipt_path) {
        const s = await sb.storage.from('exchange-receipts').createSignedUrl(r.receipt_path, 3600)
        receipt_url = s.data?.signedUrl ?? null
      }
      const label = labelInfo(r.events)
      let label_url: string | null = null
      if (label) {
        const s = await sb.storage.from('exchange-receipts').createSignedUrl(label.path, 3600)
        label_url = s.data?.signedUrl ?? null
      }
      const kind: EmailKind = r.status === 'pago_confirmado' && label ? 'etiqueta' : (KIND_BY_STATUS[r.status] ?? 'creado')
      const items = (r.items as ExchangeItem[]).map((it) => {
        const k = it.new_variant_id ? String(it.new_variant_id) : ''
        const stock = k ? tnStock.get(k) : undefined
        const res = k ? reserved.get(k) ?? 0 : 0
        const stock_alert = !!k && !r.stock_out_done && r.status !== 'cancelado' && stock !== undefined && stock < res
        return { ...it, tn_stock: stock ?? null, stock_alert }
      })
      return {
        ...r, items, receipt_url, label_url, label_sent_at: label?.at ?? null,
        status_label: STATUS_LABEL[r.status] ?? r.status,
        zone_label: ZONE_LABEL[r.zone] ?? r.zone,
        whatsapp_text: whatsappText(kind, r as ExchangeRow),
      }
    }))
    return NextResponse.json({
      ok: true, rows: out, emailEnabled: !!CAMBIOS.resendKey,
      reasons: REASONS, portalUrl: CAMBIOS.publicUrl.includes('cambios.') ? CAMBIOS.publicUrl : `${CAMBIOS.publicUrl}/cambios`,
    })
  } catch (e) {
    console.error('[cambios/admin]', e)
    return NextResponse.json({ ok: false, error: (e as Error).message }, { status: 500 })
  }
}
