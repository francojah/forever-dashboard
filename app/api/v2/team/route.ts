import { apiContext } from '@/lib/faro/context'
import { svc } from '@/lib/faro/db'

export const dynamic = 'force-dynamic'

const ROLES = ['owner', 'editor', 'viewer']

/** Invitar a alguien: { email, role }. Si ya tiene cuenta se suma directo; si no, recibe un mail de invitación. */
export async function POST(req: Request) {
  const ctx = await apiContext()
  if (ctx instanceof Response) return ctx
  if (ctx.role !== 'owner') return Response.json({ error: 'Solo el dueño puede invitar' }, { status: 403 })
  const { email, role } = await req.json().catch(() => ({})) as { email?: string; role?: string }
  const mail = (email || '').trim().toLowerCase()
  if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(mail)) return Response.json({ error: 'Email inválido' }, { status: 400 })
  const r = ROLES.includes(role || '') ? role! : 'viewer'
  const sb = svc()
  // ¿Ya existe?
  let userId: string | null = null
  for (let page = 1; page < 20 && !userId; page++) {
    const { data } = await sb.auth.admin.listUsers({ page, perPage: 200 })
    const found = data?.users?.find((u) => (u.email || '').toLowerCase() === mail)
    if (found) userId = found.id
    if (!data?.users?.length || data.users.length < 200) break
  }
  if (!userId) {
    const origin = new URL(req.url).origin
    const { data, error } = await sb.auth.admin.inviteUserByEmail(mail, { redirectTo: `${origin}/login` })
    if (error || !data.user) return Response.json({ error: error?.message || 'No se pudo invitar' }, { status: 400 })
    userId = data.user.id
  }
  const { error } = await sb.from('workspace_members').upsert({ workspace_id: ctx.workspace.id, user_id: userId, role: r }, { onConflict: 'workspace_id,user_id' })
  if (error) return Response.json({ error: error.message }, { status: 500 })
  return Response.json({ ok: true })
}

/** Cambiar rol: { user_id, role } */
export async function PATCH(req: Request) {
  const ctx = await apiContext()
  if (ctx instanceof Response) return ctx
  if (ctx.role !== 'owner') return Response.json({ error: 'Solo el dueño puede cambiar roles' }, { status: 403 })
  const { user_id, role } = await req.json().catch(() => ({})) as { user_id?: string; role?: string }
  if (!user_id || !ROLES.includes(role || '')) return Response.json({ error: 'Datos inválidos' }, { status: 400 })
  if (user_id === ctx.user.id && role !== 'owner') return Response.json({ error: 'No podés sacarte el rol de dueño a vos mismo' }, { status: 400 })
  await svc().from('workspace_members').update({ role }).eq('workspace_id', ctx.workspace.id).eq('user_id', user_id)
  return Response.json({ ok: true })
}

/** Quitar del espacio: ?user= */
export async function DELETE(req: Request) {
  const ctx = await apiContext()
  if (ctx instanceof Response) return ctx
  if (ctx.role !== 'owner') return Response.json({ error: 'Solo el dueño puede quitar personas' }, { status: 403 })
  const user = new URL(req.url).searchParams.get('user')
  if (!user || user === ctx.user.id) return Response.json({ error: 'No podés quitarte a vos mismo' }, { status: 400 })
  await svc().from('workspace_members').delete().eq('workspace_id', ctx.workspace.id).eq('user_id', user)
  return Response.json({ ok: true })
}
