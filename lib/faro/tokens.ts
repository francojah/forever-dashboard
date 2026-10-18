import { svc } from './db'
import { decryptWithInfo, encryptSecret, encryptionEnabled, isEncrypted } from './secret'

/**
 * Devuelve el token en claro. Si estaba sin cifrar, o cifrado con una clave que ya no es la principal,
 * lo vuelve a guardar cifrado con la principal (rotación sin cortes).
 */
export async function readStoredToken(connectionId: string, stored: string): Promise<string> {
  const { plain, primary } = decryptWithInfo(stored)
  if (encryptionEnabled() && !primary) {
    await svc().from('connections').update({ access_token: encryptSecret(plain) }).eq('id', connectionId).eq('access_token', stored).then(() => null, () => null)
  }
  return plain
}

/** Re-cifra con la clave principal todos los tokens guardados (access y refresh). Devuelve cuántos cambió. */
export async function rotateStoredTokens(): Promise<{ rotated: number; failed: number }> {
  if (!encryptionEnabled()) return { rotated: 0, failed: 0 }
  const { data } = await svc().from('connections').select('id,access_token,meta')
  let rotated = 0, failed = 0
  for (const c of (data || []) as { id: string; access_token: string; meta: Record<string, unknown> | null }[]) {
    try {
      const patch: Record<string, unknown> = {}
      const a = decryptWithInfo(c.access_token)
      if (!a.primary) patch.access_token = encryptSecret(a.plain)
      const rt = c.meta?.refresh_token
      if (typeof rt === 'string' && isEncrypted(rt)) {
        const r = decryptWithInfo(rt)
        if (!r.primary) patch.meta = { ...(c.meta || {}), refresh_token: encryptSecret(r.plain) }
      }
      if (Object.keys(patch).length) {
        await svc().from('connections').update(patch).eq('id', c.id).eq('access_token', c.access_token)
        rotated++
      }
    } catch { failed++ }
  }
  return { rotated, failed }
}
