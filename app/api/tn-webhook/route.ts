import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL!
const SUPABASE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY!

// Tiendanube fires: order/paid, order/cancelled, order/created
// Payload: { event: 'order/paid', store_id: number, id: number }

export async function POST(req: NextRequest) {
  try {
    const body = await req.json() as {
      event?: string
      store_id?: number
      id?: number
    }

    const { event, store_id, id } = body

    // Only act on paid orders — ignore created/cancelled
    if (event !== 'order/paid') {
      return NextResponse.json({ ok: true, skipped: true, reason: 'not order/paid' })
    }

    // Validate that the store matches our store
    const expectedStoreId = Number(process.env.TIENDANUBE_USER_ID || 4250257)
    if (store_id && store_id !== expectedStoreId) {
      return NextResponse.json({ ok: false, error: 'store mismatch' }, { status: 403 })
    }

    const supabase = createClient(SUPABASE_URL, SUPABASE_KEY)

    // Get TN access token from Supabase
    const { data: tokenData } = await supabase
      .from('app_config')
      .select('value')
      .eq('key', 'tiendanube_token')
      .single()

    const accessToken = (tokenData?.value as { access_token?: string } | null)?.access_token
      || process.env.TIENDANUBE_ACCESS_TOKEN

    if (!accessToken) {
      return NextResponse.json({ ok: false, error: 'No TN token' }, { status: 500 })
    }

    // Fetch the order from TN API
    const orderRes = await fetch(
      `https://api.tiendanube.com/v1/${expectedStoreId}/orders/${id}`,
      {
        headers: {
          'Authentication': `bearer ${accessToken}`,
          'User-Agent': 'ForeverIntelligence/1.0',
        },
        next: { revalidate: 0 },
      }
    )

    if (!orderRes.ok) {
      return NextResponse.json({ ok: false, error: `TN API ${orderRes.status}` }, { status: 502 })
    }

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const order = await orderRes.json() as any

    const revenue     = parseFloat(order.total || '0')
    const today       = new Date().toISOString().split('T')[0]

    // Persistir la orden en tn_orders (near real-time, sin esperar el sync diario)
    try {
      // Dedupe: borramos cualquier fila previa de esta orden y reinsertamos
      // (la UNIQUE con brand_id NULL no dedupe, así evitamos duplicar).
      await supabase.from('tn_orders').delete().eq('tn_order_id', String(order.id))
      await supabase.from('tn_orders').insert({
        brand_id: null,
        tn_order_id: String(order.id),
        order_number: order.number != null ? String(order.number) : null,
        order_date: order.created_at || null,
        customer_id: order.customer?.id != null ? String(order.customer.id) : null,
        customer_email: order.customer?.email || order.contact_email || null,
        status: order.status || null,
        payment_status: order.payment_status || null,
        total: revenue || 0,
        subtotal: parseFloat(order.subtotal || '0') || null,
        shipping_cost_owner: parseFloat(order.shipping_cost_owner || '0') || null,
        installments_cost: parseFloat(String(order.payment_details?.installments_cost || '0')) || null,
        payment_method: order.payment_details?.method || order.gateway || null,
        province: order.shipping_address?.province || null,
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        products: (order.products || []).map((p: any) => ({
          product_id: p.product_id != null ? String(p.product_id) : null,
          variant_id: p.variant_id != null ? String(p.variant_id) : null,
          name: p.name || '', quantity: parseInt(p.quantity || '1', 10), price: parseFloat(p.price || '0') || 0,
        })),
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        units: (order.products || []).reduce((s: number, p: any) => s + parseInt(p.quantity || '1', 10), 0),
        synced_at: new Date().toISOString(),
      })
    } catch { /* tabla puede no existir; no bloquea el webhook */ }

    // Log webhook event to Supabase for visibility (non-critical — table may not exist yet)
    try {
      await supabase.from('tn_webhook_events').upsert({
        order_id:    order.id,
        event_type:  event,
        revenue,
        status:      order.payment_status,
        created_at:  new Date().toISOString(),
        payload:     body,
      }, { onConflict: 'order_id,event_type', ignoreDuplicates: true })
    } catch {
      // silently ignore — table may not exist yet
    }

    // Trigger a lightweight TN sync to update today's snapshot
    // Fire-and-forget to keep webhook response fast
    const syncUrl = process.env.NEXT_PUBLIC_APP_URL
      ? `${process.env.NEXT_PUBLIC_APP_URL}/api/sync-tiendanube`
      : null

    if (syncUrl) {
      fetch(syncUrl, {
        method: 'POST',
        headers: {
          'x-cron-secret': process.env.CRON_SECRET || '',
          'Content-Type': 'application/json',
        },
      }).catch(() => { /* best-effort */ })
    }

    return NextResponse.json({
      ok: true,
      order_id: order.id,
      event,
      revenue,
      date: today,
    })
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Error desconocido'
    return NextResponse.json({ ok: false, error: message }, { status: 500 })
  }
}

// GET handler for Tiendanube webhook verification
export async function GET() {
  return NextResponse.json({ ok: true, service: 'forever-tn-webhook' })
}
