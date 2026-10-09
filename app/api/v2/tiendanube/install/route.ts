import { cookies } from 'next/headers'
import { apiContext, canEdit } from '@/lib/faro/context'
import { tiendanubeInstallUrl } from '@/lib/faro/connections'

export const dynamic = 'force-dynamic'

/** Manda a Tiendanube a instalar la app; al volver, la tienda se suma al espacio activo. */
export async function GET(req: Request) {
  const ctx = await apiContext()
  if (ctx instanceof Response) return Response.redirect(new URL('/login', req.url))
  if (!canEdit(ctx)) return Response.redirect(new URL('/ajustes?error=solo-lectura', req.url))
  const url = tiendanubeInstallUrl()
  if (!url) return Response.redirect(new URL('/ajustes?tab=conexiones&error=tn-app', req.url))
  cookies().set('faro_tn_ws', ctx.workspace.id, { path: '/', httpOnly: true, sameSite: 'lax', maxAge: 900, secure: true })
  return Response.redirect(url)
}
