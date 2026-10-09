import { svc } from './db'
import { graphGet, META_VERSION } from './meta'

/** Guarda (o actualiza) una conexión de Meta a partir de un token y devuelve su id. */
export async function saveMetaConnection(workspaceId: string, token: string, source: 'oauth' | 'token', expiresAt?: string | null) {
  const me = await graphGet<{ id: string; name?: string }>('me', token, { fields: 'id,name' })
  let perms: string[] = []
  try {
    const p = await graphGet<{ data?: { permission: string; status: string }[] }>('me/permissions', token)
    perms = (p.data || []).filter((x) => x.status === 'granted').map((x) => x.permission)
  } catch { /* tokens de usuario del sistema pueden no exponerlo */ }
  const { data, error } = await svc().from('connections').upsert({
    workspace_id: workspaceId, provider: 'meta', external_id: String(me.id), label: me.name || 'Meta',
    access_token: token, token_expires_at: expiresAt || null, status: 'ok', last_error: null,
    meta: { source, permissions: perms }, updated_at: new Date().toISOString(),
  }, { onConflict: 'workspace_id,provider,external_id' }).select('id').single()
  if (error || !data) throw new Error(error?.message || 'No se pudo guardar la conexión')
  return { id: data.id as string, name: me.name || 'Meta', permissions: perms }
}

/** Cambia un token corto de Facebook Login por uno de ~60 días. */
export async function exchangeLongLived(shortToken: string): Promise<{ token: string; expiresAt: string | null }> {
  const appId = process.env.META_APP_ID
  const secret = process.env.META_APP_SECRET
  if (!appId || !secret) return { token: shortToken, expiresAt: null }
  const res = await fetch(`https://graph.facebook.com/${META_VERSION}/oauth/access_token?${new URLSearchParams({
    grant_type: 'fb_exchange_token', client_id: appId, client_secret: secret, fb_exchange_token: shortToken,
  })}`)
  const j = await res.json().catch(() => ({}))
  if (!j.access_token) return { token: shortToken, expiresAt: null }
  return { token: j.access_token, expiresAt: j.expires_in ? new Date(Date.now() + j.expires_in * 1000).toISOString() : null }
}

export function metaLoginConfigured() {
  return !!(process.env.META_APP_ID && process.env.META_APP_SECRET)
}

export function tiendanubeInstallUrl() {
  const appId = process.env.TIENDANUBE_APP_ID
  return appId ? `https://www.tiendanube.com/apps/${appId}/authorize` : null
}
