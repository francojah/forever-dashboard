import { apiContext, canEdit } from '@/lib/faro/context'
import { svc } from '@/lib/faro/db'

export const dynamic = 'force-dynamic'

/** Plan de inversión mensual: { month: 'YYYY-MM', amount } (amount 0 borra el plan) */
export async function PUT(req: Request) {
  const ctx = await apiContext()
  if (ctx instanceof Response) return ctx
  if (!canEdit(ctx)) return Response.json({ error: 'Tu rol es de solo lectura' }, { status: 403 })
  const b = await req.json().catch(() => ({})) as Record<string, unknown>
  const month = String(b.month || '')
  const amount = Number(b.amount)
  if (!/^\d{4}-\d{2}$/.test(month)) return Response.json({ error: 'Mes inválido' }, { status: 400 })
  if (!Number.isFinite(amount) || amount < 0) return Response.json({ error: 'Monto inválido' }, { status: 400 })
  const q = svc().from('ad_budget_plans')
  const { error } = amount === 0
    ? await q.delete().eq('workspace_id', ctx.workspace.id).eq('month', month)
    : await q.upsert({ workspace_id: ctx.workspace.id, month, amount, updated_at: new Date().toISOString() }, { onConflict: 'workspace_id,month' })
  if (error) return Response.json({ error: /does not exist|Could not find/i.test(error.message) ? 'Falta correr la migración 20261012_ads_extras.sql' : error.message }, { status: 500 })
  return Response.json({ ok: true })
}
