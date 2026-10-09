import { apiContext, canEdit } from '@/lib/faro/context'
import { applyChanges, Change, Field } from '@/lib/faro/mutate'
import { svc } from '@/lib/faro/db'

export const dynamic = 'force-dynamic'
export const maxDuration = 60

/** Revierte un cambio del historial: { change_id } */
export async function POST(req: Request) {
  const ctx = await apiContext()
  if (ctx instanceof Response) return ctx
  if (!canEdit(ctx)) return Response.json({ error: 'Tu rol es de solo lectura' }, { status: 403 })
  const { change_id } = await req.json().catch(() => ({})) as { change_id?: string }
  const { data: ch } = await svc().from('change_log').select('*').eq('id', change_id || '').eq('workspace_id', ctx.workspace.id).maybeSingle()
  if (!ch) return Response.json({ error: 'Cambio no encontrado' }, { status: 404 })
  if (ch.status !== 'ok' || ch.undone_at) return Response.json({ error: 'Ese cambio no se puede deshacer' }, { status: 400 })
  if (ch.old_value == null && ch.field !== 'genders') return Response.json({ error: 'No hay valor anterior guardado' }, { status: 400 })
  const field = (ch.field === 'copy' ? 'creative_id' : ch.field) as Field
  const change: Change = { accountId: ch.ad_account_id, level: ch.level, id: ch.entity_id, field, value: ch.old_value ?? [], confirmProtected: true }
  const [r] = await applyChanges(ctx, [change], { undoOf: ch.id })
  return Response.json({ ok: r.ok, result: r }, { status: r.ok ? 200 : 400 })
}
