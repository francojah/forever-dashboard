import { apiContext, canEdit } from '@/lib/faro/context'
import { applyChanges, Change } from '@/lib/faro/mutate'
import { svc } from '@/lib/faro/db'

export const dynamic = 'force-dynamic'
export const maxDuration = 60

/** Aplica cambios en campañas, ad sets y anuncios. Body: { changes: Change[] } */
export async function POST(req: Request) {
  const ctx = await apiContext()
  if (ctx instanceof Response) return ctx
  if (!canEdit(ctx)) return Response.json({ error: 'Tu rol es de solo lectura' }, { status: 403 })
  const body = await req.json().catch(() => ({})) as { changes?: Change[] }
  if (!Array.isArray(body.changes) || !body.changes.length) return Response.json({ error: 'Sin cambios' }, { status: 400 })
  const results = await applyChanges(ctx, body.changes)
  return Response.json({ ok: results.every((r) => r.ok), results })
}

/** Historial de cambios del espacio. */
export async function GET() {
  const ctx = await apiContext()
  if (ctx instanceof Response) return ctx
  const { data } = await svc().from('change_log').select('*').eq('workspace_id', ctx.workspace.id).order('created_at', { ascending: false }).limit(200)
  return Response.json({ rows: data || [] })
}
