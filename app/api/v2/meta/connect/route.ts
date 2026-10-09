import { apiContext, canEdit } from '@/lib/faro/context'
import { saveMetaConnection } from '@/lib/faro/connections'
import { svc } from '@/lib/faro/db'

export const dynamic = 'force-dynamic'

/** Conectar Meta pegando un token (usuario del sistema de un Business o token de usuario). */
export async function POST(req: Request) {
  const ctx = await apiContext()
  if (ctx instanceof Response) return ctx
  if (!canEdit(ctx)) return Response.json({ error: 'Tu rol es de solo lectura' }, { status: 403 })
  const { token } = await req.json().catch(() => ({})) as { token?: string }
  if (!token || token.trim().length < 20) return Response.json({ error: 'Token inválido' }, { status: 400 })
  try {
    const conn = await saveMetaConnection(ctx.workspace.id, token.trim(), 'token')
    return Response.json({ ok: true, connection: conn })
  } catch (e) {
    return Response.json({ error: e instanceof Error ? e.message : 'No se pudo validar el token' }, { status: 400 })
  }
}

/** Conexiones de Meta del espacio (sin tokens). */
export async function GET() {
  const ctx = await apiContext()
  if (ctx instanceof Response) return ctx
  const { data } = await svc().from('connections').select('id,provider,external_id,label,status,last_error,token_expires_at,meta,created_at')
    .eq('workspace_id', ctx.workspace.id).order('created_at')
  return Response.json({ connections: data || [] })
}

/** Quitar una conexión: ?id= */
export async function DELETE(req: Request) {
  const ctx = await apiContext()
  if (ctx instanceof Response) return ctx
  if (ctx.role !== 'owner') return Response.json({ error: 'Solo el dueño puede quitar conexiones' }, { status: 403 })
  const id = new URL(req.url).searchParams.get('id')
  if (!id) return Response.json({ error: 'Falta id' }, { status: 400 })
  await svc().from('connections').delete().eq('id', id).eq('workspace_id', ctx.workspace.id)
  return Response.json({ ok: true })
}
