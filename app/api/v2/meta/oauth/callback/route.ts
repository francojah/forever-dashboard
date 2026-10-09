import { cookies } from 'next/headers'
import { apiContext } from '@/lib/faro/context'
import { META_VERSION } from '@/lib/faro/meta'
import { exchangeLongLived, saveMetaConnection } from '@/lib/faro/connections'

export const dynamic = 'force-dynamic'

export async function GET(req: Request) {
  const url = new URL(req.url)
  const back = (q: string) => Response.redirect(new URL(`/ajustes?tab=conexiones&${q}`, req.url))
  const code = url.searchParams.get('code')
  const state = url.searchParams.get('state')
  const saved = cookies().get('faro_meta_state')?.value || ''
  const [savedState, wsId] = saved.split('.')
  if (!code || !state || state !== savedState) return back('error=meta-estado')
  const ctx = await apiContext(wsId)
  if (ctx instanceof Response || ctx.workspace.id !== wsId) return back('error=meta-espacio')

  const redirect = new URL('/api/v2/meta/oauth/callback', req.url).toString()
  const res = await fetch(`https://graph.facebook.com/${META_VERSION}/oauth/access_token?${new URLSearchParams({
    client_id: process.env.META_APP_ID || '', client_secret: process.env.META_APP_SECRET || '', redirect_uri: redirect, code,
  })}`)
  const j = await res.json().catch(() => ({}))
  if (!j.access_token) return back(`error=${encodeURIComponent(j.error?.message || 'meta-token')}`)
  try {
    const ll = await exchangeLongLived(j.access_token)
    const conn = await saveMetaConnection(ctx.workspace.id, ll.token, 'oauth', ll.expiresAt)
    cookies().delete('faro_meta_state')
    return back(`connection=${conn.id}`)
  } catch (e) {
    return back(`error=${encodeURIComponent(e instanceof Error ? e.message : 'meta')}`)
  }
}
