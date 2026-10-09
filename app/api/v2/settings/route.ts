import { apiContext, canEdit } from '@/lib/faro/context'
import { svc } from '@/lib/faro/db'
import { normalizeSettings } from '@/lib/faro/settings'

export const dynamic = 'force-dynamic'

export async function GET() {
  const ctx = await apiContext()
  if (ctx instanceof Response) return ctx
  return Response.json({ settings: ctx.workspace.settings })
}

/** Actualiza parámetros de costos (merge). */
export async function PUT(req: Request) {
  const ctx = await apiContext()
  if (ctx instanceof Response) return ctx
  if (!canEdit(ctx)) return Response.json({ error: 'Tu rol es de solo lectura' }, { status: 403 })
  const patch = await req.json().catch(() => ({}))
  const merged = { ...ctx.workspace.rawSettings, ...normalizeSettings({ ...ctx.workspace.rawSettings, ...patch }) }
  const { error } = await svc().from('workspaces').update({ settings: merged }).eq('id', ctx.workspace.id)
  if (error) return Response.json({ error: error.message }, { status: 500 })
  return Response.json({ ok: true, settings: normalizeSettings(merged) })
}
