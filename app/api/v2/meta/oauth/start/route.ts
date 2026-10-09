import { cookies } from 'next/headers'
import { randomBytes } from 'crypto'
import { apiContext, canEdit } from '@/lib/faro/context'
import { META_VERSION } from '@/lib/faro/meta'

export const dynamic = 'force-dynamic'

/** Abre el login de Facebook pidiendo permisos de anuncios. */
export async function GET(req: Request) {
  const ctx = await apiContext()
  if (ctx instanceof Response) return Response.redirect(new URL('/login', req.url))
  if (!canEdit(ctx)) return Response.redirect(new URL('/ajustes?error=solo-lectura', req.url))
  const appId = process.env.META_APP_ID
  if (!appId) return Response.redirect(new URL('/ajustes?tab=conexiones&error=meta-app', req.url))
  const state = randomBytes(16).toString('hex')
  cookies().set('faro_meta_state', `${state}.${ctx.workspace.id}`, { path: '/', httpOnly: true, sameSite: 'lax', maxAge: 600, secure: true })
  const redirect = new URL('/api/v2/meta/oauth/callback', req.url).toString()
  const url = new URL(`https://www.facebook.com/${META_VERSION}/dialog/oauth`)
  url.searchParams.set('client_id', appId)
  url.searchParams.set('redirect_uri', redirect)
  url.searchParams.set('state', state)
  url.searchParams.set('scope', 'ads_read,ads_management,business_management,pages_show_list,pages_read_engagement')
  return Response.redirect(url.toString())
}
