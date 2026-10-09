import { createHmac, timingSafeEqual } from 'crypto'
import { svc, logSync } from '@/lib/faro/db'
import { syncSingleOrder, StoreRow } from '@/lib/faro/tiendanube'

export const dynamic = 'force-dynamic'

function validSignature(raw: string, sig: string | null) {
  const secret = process.env.TIENDANUBE_CLIENT_SECRET
  if (!secret || !sig) return false
  const expected = Buffer.from(createHmac('sha256', secret).update(raw).digest('hex'))
  const got = Buffer.from(sig.trim().toLowerCase())
  return expected.length === got.length && timingSafeEqual(expected, got)
}

/** order/created · order/updated · order/paid · order/cancelled → actualiza esa orden. */
export async function POST(req: Request) {
  const raw = await req.text()
  if (!validSignature(raw, req.headers.get('x-linkedstore-hmac-sha256'))) {
    return Response.json({ ok: false, error: 'firma inválida' }, { status: 401 })
  }
  let body: { event?: string; store_id?: number | string; id?: number | string } = {}
  try { body = JSON.parse(raw) } catch { return Response.json({ ok: false }, { status: 400 }) }
  if (!body.store_id || !body.id || !String(body.event || '').startsWith('order/')) return Response.json({ ok: true, skipped: true })

  const { data: stores } = await svc().from('stores').select('*').eq('platform', 'tiendanube').eq('external_id', String(body.store_id))
  const t0 = Date.now()
  for (const s of (stores || []) as StoreRow[]) {
    try {
      await syncSingleOrder(s, String(body.id))
      await logSync({ workspace_id: s.workspace_id, source: 'webhook', target_id: s.id, status: 'ok', rows: 1, ms: Date.now() - t0 })
    } catch (e) {
      await logSync({ workspace_id: s.workspace_id, source: 'webhook', target_id: s.id, status: 'error', ms: Date.now() - t0, error: e instanceof Error ? e.message : String(e) })
    }
  }
  return Response.json({ ok: true })
}

export async function GET() {
  return Response.json({ ok: true, service: 'faro-tn-webhook' })
}
