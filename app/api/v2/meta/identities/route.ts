import { apiContext } from '@/lib/faro/context'
import { recentIdentities, getMetaToken, graphGet } from '@/lib/faro/meta'

export const dynamic = 'force-dynamic'

/** Página de Facebook + cuenta de Instagram con las que ya publica la cuenta (?account=uuid). */
export async function GET(req: Request) {
  const ctx = await apiContext()
  if (ctx instanceof Response) return ctx
  const acc = ctx.adAccounts.find((a) => a.id === new URL(req.url).searchParams.get('account'))
  if (!acc) return Response.json({ identities: [] })
  const ids = await recentIdentities(acc.id)
  let token: string | null = null
  try { token = await getMetaToken(acc.connection_id) } catch { /* sin nombres */ }
  const named = await Promise.all(ids.slice(0, 5).map(async (i) => {
    let pageName = i.page_id
    let igName: string | null = i.instagram_user_id
    if (token) {
      try { pageName = (await graphGet<{ name: string }>(i.page_id, token, { fields: 'name' })).name || pageName } catch { /* sin permiso */ }
      if (i.instagram_user_id) {
        try { igName = '@' + ((await graphGet<{ username: string }>(i.instagram_user_id, token, { fields: 'username' })).username || igName) } catch { /* sin permiso */ }
      }
    }
    return { ...i, page_name: pageName, instagram_name: igName }
  }))
  return Response.json({ identities: named })
}
