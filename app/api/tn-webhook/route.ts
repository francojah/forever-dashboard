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

    const order = await orderRes.json() as {
      id: number
      status: string
      payment_status: string
      subtotal: string
      total: string
      created_at: string
      products?: { name: string; quantity: number; price: string }[]
      customer?: { email?: string; name?: string }
    }

    const revenue     = parseFloat(order.total || '0')
    const today       = new Date().toISOString().split('T')[0]

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
