import { createCipheriv, createDecipheriv, randomBytes } from 'crypto'

/**
 * Cifrado de tokens guardados (Meta, Tiendanube) con AES-256-GCM.
 * Clave: FARO_ENC_KEY (32 bytes en base64). Sin clave, se guardan como antes (texto plano).
 * Los tokens viejos sin cifrar se siguen leyendo y se cifran solos la próxima vez que se usan.
 */
const PREFIX = 'enc:v1:'

function key(): Buffer | null {
  const raw = process.env.FARO_ENC_KEY
  if (!raw) return null
  const k = Buffer.from(raw, 'base64')
  if (k.length !== 32) throw new Error('FARO_ENC_KEY tiene que ser de 32 bytes en base64')
  return k
}

export const isEncrypted = (v: string | null | undefined) => !!v && v.startsWith(PREFIX)
export const encryptionEnabled = () => !!process.env.FARO_ENC_KEY

export function encryptSecret(plain: string): string {
  const k = key()
  if (!k || isEncrypted(plain)) return plain
  const iv = randomBytes(12)
  const c = createCipheriv('aes-256-gcm', k, iv)
  const data = Buffer.concat([c.update(plain, 'utf8'), c.final()])
  return PREFIX + Buffer.concat([iv, c.getAuthTag(), data]).toString('base64')
}

export function decryptSecret(stored: string): string {
  if (!isEncrypted(stored)) return stored
  const k = key()
  if (!k) throw new Error('Falta FARO_ENC_KEY para leer los tokens guardados')
  const buf = Buffer.from(stored.slice(PREFIX.length), 'base64')
  const d = createDecipheriv('aes-256-gcm', k, buf.subarray(0, 12))
  d.setAuthTag(buf.subarray(12, 28))
  return Buffer.concat([d.update(buf.subarray(28)), d.final()]).toString('utf8')
}
