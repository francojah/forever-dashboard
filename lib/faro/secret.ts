import { createCipheriv, createDecipheriv, randomBytes } from 'crypto'

/**
 * Cifrado de tokens guardados con AES-256-GCM.
 *
 * Llavero de claves (para poder rotarlas sin cortar nada):
 *  - FARO_ENC_KEY_NEXT: clave nueva. Si existe, todo lo nuevo se cifra con ella.
 *  - FARO_ENC_KEY: clave actual (o anterior durante una rotación).
 * Para leer se prueban todas. Lo que estaba cifrado con una clave vieja se vuelve a cifrar
 * con la principal la próxima vez que se usa (ver tokens.ts y rotateStoredTokens).
 * Sin ninguna clave, los tokens quedan como antes (texto plano) y se cifran cuando haya clave.
 */
const PREFIX = 'enc:v1:'

function parse(raw: string | undefined): Buffer | null {
  if (!raw) return null
  const k = Buffer.from(raw, 'base64')
  if (k.length !== 32) throw new Error('Las claves de cifrado tienen que ser de 32 bytes en base64')
  return k
}

/** Claves en orden de preferencia: la principal primero. */
function keyring(): Buffer[] {
  return [parse(process.env.FARO_ENC_KEY_NEXT), parse(process.env.FARO_ENC_KEY)].filter((k): k is Buffer => !!k)
}

export const isEncrypted = (v: string | null | undefined) => !!v && v.startsWith(PREFIX)
export const encryptionEnabled = () => keyring().length > 0

export function encryptSecret(plain: string): string {
  const k = keyring()[0]
  if (!k || isEncrypted(plain)) return plain
  const iv = randomBytes(12)
  const c = createCipheriv('aes-256-gcm', k, iv)
  const data = Buffer.concat([c.update(plain, 'utf8'), c.final()])
  return PREFIX + Buffer.concat([iv, c.getAuthTag(), data]).toString('base64')
}

function open(stored: string, k: Buffer): string {
  const buf = Buffer.from(stored.slice(PREFIX.length), 'base64')
  const d = createDecipheriv('aes-256-gcm', k, buf.subarray(0, 12))
  d.setAuthTag(buf.subarray(12, 28))
  return Buffer.concat([d.update(buf.subarray(28)), d.final()]).toString('utf8')
}

/** Descifra probando todas las claves. `primary` indica si se usó la clave principal. */
export function decryptWithInfo(stored: string): { plain: string; primary: boolean } {
  if (!isEncrypted(stored)) return { plain: stored, primary: false }
  const keys = keyring()
  if (!keys.length) throw new Error('Falta FARO_ENC_KEY para leer los tokens guardados')
  for (let i = 0; i < keys.length; i++) {
    try { return { plain: open(stored, keys[i]), primary: i === 0 } } catch { /* probar la siguiente */ }
  }
  throw new Error('Ninguna clave de cifrado configurada puede leer este token')
}

export function decryptSecret(stored: string): string {
  return decryptWithInfo(stored).plain
}
