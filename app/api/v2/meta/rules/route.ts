import { apiContext, canEdit } from '@/lib/faro/context'
import { svc } from '@/lib/faro/db'
import { normalizeRule, loadRules } from '@/lib/faro/rules'

export const dynamic = 'force-dynamic'
const MISSING = 'Falta correr la migración 20261012_ads_extras.sql'
const errMsg = (m: string) => (/does not exist|Could not find/i.test(m) ? MISSING : m)

export async function GET() {
  const ctx = await apiContext()
  if (ctx instanceof Response) return ctx
  return Response.json(await loadRules(ctx.workspace.id))
}

/** Crear regla */
export async function POST(req: Request) {
  const ctx = await apiContext()
  if (ctx instanceof Response) return ctx
  if (!canEdit(ctx)) return Response.json({ error: 'Tu rol es de solo lectura' }, { status: 403 })
  const r = normalizeRule(await req.json().catch(() => ({})))
  if (typeof r === 'string') return Response.json({ error: r }, { status: 400 })
  const { data, error } = await svc().from('ad_rules').insert({ ...r, workspace_id: ctx.workspace.id }).select('id').single()
  if (error) return Response.json({ error: errMsg(error.message) }, { status: 500 })
  return Response.json({ ok: true, id: data.id })
}

/** Editar regla: { id, ...campos } */
export async function PATCH(req: Request) {
  const ctx = await apiContext()
  if (ctx instanceof Response) return ctx
  if (!canEdit(ctx)) return Response.json({ error: 'Tu rol es de solo lectura' }, { status: 403 })
  const b = await req.json().catch(() => ({})) as Record<string, unknown>
  const id = String(b.id || '')
  const r = normalizeRule(b)
  if (typeof r === 'string') return Response.json({ error: r }, { status: 400 })
  const { error } = await svc().from('ad_rules').update(r).eq('id', id).eq('workspace_id', ctx.workspace.id)
  if (error) return Response.json({ error: errMsg(error.message) }, { status: 500 })
  return Response.json({ ok: true })
}

export async function DELETE(req: Request) {
  const ctx = await apiContext()
  if (ctx instanceof Response) return ctx
  if (!canEdit(ctx)) return Response.json({ error: 'Tu rol es de solo lectura' }, { status: 403 })
  const id = new URL(req.url).searchParams.get('id') || ''
  const { error } = await svc().from('ad_rules').delete().eq('id', id).eq('workspace_id', ctx.workspace.id)
  if (error) return Response.json({ error: errMsg(error.message) }, { status: 500 })
  return Response.json({ ok: true })
}
