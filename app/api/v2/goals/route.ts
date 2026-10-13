import { apiContext, canEdit } from '@/lib/faro/context'
import { svc } from '@/lib/faro/db'
import { GOAL_LABEL } from '@/lib/faro/insights'

export const dynamic = 'force-dynamic'
const errMsg = (m: string) => (/does not exist|Could not find/i.test(m) ? 'Falta correr la migración 20261015_decisiones.sql' : m)

/** PUT { month, metric, target } · target 0 borra */
export async function PUT(req: Request) {
  const ctx = await apiContext()
  if (ctx instanceof Response) return ctx
  if (!canEdit(ctx)) return Response.json({ error: 'Tu rol es de solo lectura' }, { status: 403 })
  const b = await req.json().catch(() => ({})) as { month?: string; metric?: string; target?: number }
  const month = String(b.month || ''), metric = String(b.metric || ''), target = Number(b.target)
  if (!/^\d{4}-\d{2}$/.test(month) || !(metric in GOAL_LABEL) || !Number.isFinite(target) || target < 0) return Response.json({ error: 'Datos inválidos' }, { status: 400 })
  const q = svc().from('goals')
  const { error } = target === 0
    ? await q.delete().eq('workspace_id', ctx.workspace.id).eq('month', month).eq('metric', metric)
    : await q.upsert({ workspace_id: ctx.workspace.id, month, metric, target }, { onConflict: 'workspace_id,month,metric' })
  if (error) return Response.json({ error: errMsg(error.message) }, { status: 500 })
  return Response.json({ ok: true })
}
