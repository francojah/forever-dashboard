import { cookies } from 'next/headers'
import { apiContext, createWorkspace, WS_COOKIE, currentUser } from '@/lib/faro/context'
import { svc } from '@/lib/faro/db'

export const dynamic = 'force-dynamic'

/** Cambiar de espacio activo: { workspace_id }  ·  Crear uno nuevo: { create: 'Nombre' } */
export async function POST(req: Request) {
  const user = await currentUser()
  if (!user) return Response.json({ error: 'No autorizado' }, { status: 401 })
  const body = await req.json().catch(() => ({})) as { workspace_id?: string; create?: string }
  let id = body.workspace_id
  if (body.create) {
    id = await createWorkspace(user.id, String(body.create).slice(0, 80) || 'Nuevo negocio')
  } else {
    const ctx = await apiContext(id)
    if (ctx instanceof Response) return ctx
    if (ctx.workspace.id !== id) return Response.json({ error: 'No tenés acceso a ese espacio' }, { status: 403 })
  }
  cookies().set(WS_COOKIE, id!, { path: '/', httpOnly: true, sameSite: 'lax', maxAge: 60 * 60 * 24 * 365 })
  return Response.json({ ok: true, workspace_id: id })
}

/** Renombrar el espacio: { name } */
export async function PATCH(req: Request) {
  const ctx = await apiContext()
  if (ctx instanceof Response) return ctx
  if (ctx.role !== 'owner') return Response.json({ error: 'Solo el dueño puede renombrar' }, { status: 403 })
  const { name } = await req.json().catch(() => ({})) as { name?: string }
  if (!name?.trim()) return Response.json({ error: 'Falta el nombre' }, { status: 400 })
  await svc().from('workspaces').update({ name: name.trim().slice(0, 80) }).eq('id', ctx.workspace.id)
  return Response.json({ ok: true })
}
