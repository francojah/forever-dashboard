import { createHash } from 'crypto'
import { apiContext, canEdit } from '@/lib/faro/context'
import { loadOrders } from '@/lib/faro/metrics'
import { customerTable, segments, segmentCsv } from '@/lib/faro/insights'
import { localDate, addDays } from '@/lib/faro/dates'
import { getMetaToken, graphPost } from '@/lib/faro/meta'

export const dynamic = 'force-dynamic'
export const maxDuration = 60

import type { FaroContext } from '@/lib/faro/context'
async function loadSegment(c: FaroContext, key: string) {
  const storeIds = c.stores.filter((s) => s.active).map((s) => s.id)
  const today = localDate(new Date(), c.workspace.timezone)
  const orders = await loadOrders(storeIds, addDays(today, -730), today, c.workspace.timezone)
  return segments(customerTable(orders), today).find((s) => s.key === key) || null
}

/** GET ?key=vip → CSV del segmento */
export async function GET(req: Request) {
  const ctx = await apiContext()
  if (ctx instanceof Response) return ctx
  const key = new URL(req.url).searchParams.get('key') || ''
  const seg = await loadSegment(ctx, key)
  if (!seg) return Response.json({ error: 'Segmento inválido' }, { status: 400 })
  return new Response(segmentCsv(seg.customers), { headers: { 'Content-Type': 'text/csv; charset=utf-8', 'Content-Disposition': `attachment; filename="faro-${key}.csv"` } })
}

const sha = (v: string) => createHash('sha256').update(v.trim().toLowerCase()).digest('hex')

/** POST { key, accountId } → crea (o actualiza) un público personalizado en Meta con los emails del segmento, hasheados. */
export async function POST(req: Request) {
  const ctx = await apiContext()
  if (ctx instanceof Response) return ctx
  if (!canEdit(ctx)) return Response.json({ error: 'Tu rol es de solo lectura' }, { status: 403 })
  const b = await req.json().catch(() => ({})) as { key?: string; accountId?: string }
  const acc = ctx.adAccounts.find((a) => a.id === b.accountId && a.active)
  if (!acc) return Response.json({ error: 'Elegí una cuenta de Meta' }, { status: 400 })
  const seg = await loadSegment(ctx, String(b.key || ''))
  if (!seg) return Response.json({ error: 'Segmento inválido' }, { status: 400 })
  const emails = seg.customers.map((c) => c.email).filter((e): e is string => !!e && e.includes('@'))
  if (emails.length < 100) return Response.json({ error: `Meta pide al menos 100 personas y este segmento tiene ${emails.length} con email.` }, { status: 400 })
  try {
    const token = await getMetaToken(acc.connection_id)
    const name = `Faro · ${seg.label}`
    const aud = await graphPost<{ id: string }>(`${acc.external_id}/customaudiences`, token, {
      name, subtype: 'CUSTOM', description: seg.why, customer_file_source: 'USER_PROVIDED_ONLY',
    })
    for (let i = 0; i < emails.length; i += 5000) {
      await graphPost(`${aud.id}/users`, token, { payload: JSON.stringify({ schema: ['EMAIL'], data: emails.slice(i, i + 5000).map((e) => [sha(e)]) }) })
    }
    return Response.json({ ok: true, audienceId: aud.id, people: emails.length, name })
  } catch (e) {
    return Response.json({ error: e instanceof Error ? e.message : 'Meta rechazó el público' }, { status: 400 })
  }
}
