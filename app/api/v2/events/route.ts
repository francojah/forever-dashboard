import { apiContext, canEdit } from '@/lib/faro/context'
import { svc } from '@/lib/faro/db'

export const dynamic = 'force-dynamic'
const errMsg = (m: string) => (/does not exist|Could not find/i.test(m) ? 'Falta correr la migración 20261015_decisiones.sql' : m)
const D = /^\d{4}-\d{2}-\d{2}$/

/** POST { kind, name, starts, ends, entity_id?, notes? } */
export async function POST(req: Request) {
  const ctx = await apiContext()
  if (ctx instanceof Response) return ctx
  if (!canEdit(ctx)) return Response.json({ error: 'Tu rol es de solo lectura' }, { status: 403 })
  const b = await req.json().catch(() => ({})) as Record<string, string>
  const kind = ['promo', 'experimento', 'otro'].includes(b.kind) ? b.kind : 'promo'
  const name = String(b.name || '').trim().slice(0, 80)
  if (!name || !D.test(b.starts || '') || !D.test(b.ends || '') || b.ends < b.starts) return Response.json({ error: 'Falta el nombre o las fechas no cierran' }, { status: 400 })
  const { data, error } = await svc().from('events').insert({ workspace_id: ctx.workspace.id, kind, name, starts: b.starts, ends: b.ends, entity_id: b.entity_id ? String(b.entity_id).slice(0, 40) : null, notes: b.notes ? String(b.notes).slice(0, 500) : null }).select('id').single()
  if (error) return Response.json({ error: errMsg(error.message) }, { status: 500 })
  // Seguimiento: a los 7 días del fin, el antes/durante/después queda en Objetivos y promos; acá solo se agenda el recordatorio
  await svc().from('decision_followups').insert({ workspace_id: ctx.workspace.id, kind: 'event', ref_id: data.id, entity_name: name, field: kind, check_at: b.ends, result: null }).then(() => null, () => null)
  return Response.json({ ok: true, id: data.id })
}

export async function DELETE(req: Request) {
  const ctx = await apiContext()
  if (ctx instanceof Response) return ctx
  if (!canEdit(ctx)) return Response.json({ error: 'Tu rol es de solo lectura' }, { status: 403 })
  const id = new URL(req.url).searchParams.get('id') || ''
  const { error } = await svc().from('events').delete().eq('id', id).eq('workspace_id', ctx.workspace.id)
  if (error) return Response.json({ error: errMsg(error.message) }, { status: 500 })
  return Response.json({ ok: true })
}
