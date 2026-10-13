import { apiContext } from '@/lib/faro/context'
import { svc } from '@/lib/faro/db'

export const dynamic = 'force-dynamic'

/** Marcar seguimientos como vistos: { ids: [] } */
export async function PATCH(req: Request) {
  const ctx = await apiContext()
  if (ctx instanceof Response) return ctx
  const b = await req.json().catch(() => ({})) as { ids?: string[] }
  const ids = (b.ids || []).filter((x) => typeof x === 'string').slice(0, 50)
  if (!ids.length) return Response.json({ ok: true })
  await svc().from('decision_followups').update({ seen_at: new Date().toISOString() }).eq('workspace_id', ctx.workspace.id).in('id', ids)
  return Response.json({ ok: true })
}
