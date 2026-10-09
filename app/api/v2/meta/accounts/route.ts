import { apiContext, canEdit } from '@/lib/faro/context'
import { svc } from '@/lib/faro/db'
import { listAccessibleAccounts, getMetaToken } from '@/lib/faro/meta'

export const dynamic = 'force-dynamic'
export const maxDuration = 60

/** Cuentas publicitarias que ve una conexión: ?connection= */
export async function GET(req: Request) {
  const ctx = await apiContext()
  if (ctx instanceof Response) return ctx
  const connectionId = new URL(req.url).searchParams.get('connection')
  const { data: conn } = await svc().from('connections').select('id').eq('id', connectionId || '').eq('workspace_id', ctx.workspace.id).maybeSingle()
  if (!conn) return Response.json({ error: 'Conexión inválida' }, { status: 400 })
  try {
    const token = await getMetaToken(conn.id)
    const accounts = await listAccessibleAccounts(token)
    const added = new Set(ctx.adAccounts.map((a) => a.external_id))
    return Response.json({ accounts: accounts.map((a) => ({ ...a, added: added.has(a.id) })).sort((a, b) => Number(b.status === 1) - Number(a.status === 1) || a.name.localeCompare(b.name)) })
  } catch (e) {
    return Response.json({ error: e instanceof Error ? e.message : 'Error de Meta' }, { status: 400 })
  }
}

/** Agregar cuentas al espacio: { connection_id, accounts: [{ id, name, currency, timezone }] } */
export async function POST(req: Request) {
  const ctx = await apiContext()
  if (ctx instanceof Response) return ctx
  if (!canEdit(ctx)) return Response.json({ error: 'Tu rol es de solo lectura' }, { status: 403 })
  const body = await req.json().catch(() => ({})) as { connection_id?: string; accounts?: { id: string; name: string; currency?: string; timezone?: string | null }[] }
  const { data: conn } = await svc().from('connections').select('id').eq('id', body.connection_id || '').eq('workspace_id', ctx.workspace.id).maybeSingle()
  if (!conn) return Response.json({ error: 'Conexión inválida' }, { status: 400 })
  const rows = (body.accounts || []).filter((a) => /^act_\d+$/.test(a.id)).map((a) => ({
    workspace_id: ctx.workspace.id, connection_id: conn.id, external_id: a.id, name: a.name || a.id,
    currency: a.currency || 'ARS', timezone: a.timezone || null, active: true,
  }))
  if (!rows.length) return Response.json({ error: 'Elegí al menos una cuenta' }, { status: 400 })
  const { error } = await svc().from('ad_accounts').upsert(rows, { onConflict: 'workspace_id,external_id' })
  if (error) return Response.json({ error: error.message }, { status: 500 })
  return Response.json({ ok: true, added: rows.length })
}
