import { apiContext, canEdit } from '@/lib/faro/context'
import { svc } from '@/lib/faro/db'
import { loadPnL } from '@/lib/faro/pnl'

export const dynamic = 'force-dynamic'
export const maxDuration = 60

/** Congela el P&L de un mes ({ month }) o lo reabre ({ month, reopen: true }). */
export async function POST(req: Request) {
  const ctx = await apiContext()
  if (ctx instanceof Response) return ctx
  if (!canEdit(ctx)) return Response.json({ error: 'Tu rol es de solo lectura' }, { status: 403 })
  const { month, reopen } = await req.json().catch(() => ({})) as { month?: string; reopen?: boolean }
  if (!month || !/^\d{4}-\d{2}$/.test(month)) return Response.json({ error: 'Mes inválido' }, { status: 400 })
  const sb = svc()
  if (reopen) {
    await sb.from('closed_periods').delete().eq('workspace_id', ctx.workspace.id).eq('month', month)
    return Response.json({ ok: true })
  }
  await sb.from('closed_periods').delete().eq('workspace_id', ctx.workspace.id).eq('month', month)
  const [pnl] = await loadPnL({
    workspaceId: ctx.workspace.id, tz: ctx.workspace.timezone, settings: ctx.workspace.settings,
    storeIds: ctx.stores.filter((s) => s.active).map((s) => s.id), accountIds: ctx.adAccounts.filter((a) => a.active).map((a) => a.id),
  }, [month])
  const { error } = await sb.from('closed_periods').insert({ workspace_id: ctx.workspace.id, month, pnl, closed_by: ctx.user.id })
  if (error) return Response.json({ error: error.message }, { status: 500 })
  return Response.json({ ok: true })
}
