import { svc } from './db'
import { decryptSecret, encryptSecret, encryptionEnabled, isEncrypted } from './secret'

/** Devuelve el token en claro; si estaba guardado sin cifrar y hay clave, lo cifra en la base. */
export async function readStoredToken(connectionId: string, stored: string): Promise<string> {
  const plain = decryptSecret(stored)
  if (!isEncrypted(stored) && encryptionEnabled()) {
    await svc().from('connections').update({ access_token: encryptSecret(plain) }).eq('id', connectionId).eq('access_token', stored).then(() => null, () => null)
  }
  return plain
}
