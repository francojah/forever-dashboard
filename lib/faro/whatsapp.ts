/**
 * Envío por WhatsApp Cloud API (Meta). Los mensajes que inicia Faro tienen que usar una plantilla aprobada:
 *   nombre: faro_aviso (o WHATSAPP_TEMPLATE) · categoría: Utilidad · idioma: es_AR (o WHATSAPP_LANG)
 *   cuerpo: "Hola, este es tu aviso de Faro para {{1}}: {{2}}. Entrá a Faro para ver el detalle."
 */
const TOKEN = () => process.env.WHATSAPP_TOKEN || ''
const PHONE_ID = () => process.env.WHATSAPP_PHONE_ID || ''
const TEMPLATE = () => process.env.WHATSAPP_TEMPLATE || 'faro_aviso'
const LANG = () => process.env.WHATSAPP_LANG || 'es_AR'

export const whatsappConfigured = () => !!TOKEN() && !!PHONE_ID()

/** Normaliza un celular a formato internacional sin "+" (Argentina por defecto: 549 + área + número). */
export function normalizePhone(raw: string): string | null {
  let d = (raw || '').replace(/\D/g, '')
  if (!d) return null
  if (d.startsWith('00')) d = d.slice(2)
  if (d.startsWith('0')) d = d.slice(1)
  // Argentina: 11 1234-5678 → 5491112345678; quita el "15" después del código de área si vino local
  if (d.length === 10) d = `549${d}`
  else if (d.length === 12 && d.startsWith('15')) return null
  else if (d.startsWith('54') && !d.startsWith('549') && d.length === 12) d = `549${d.slice(2)}`
  return d.length >= 11 && d.length <= 15 ? d : null
}

/** Las variables de plantilla no aceptan saltos de línea, tabs ni más de 4 espacios seguidos. */
export function cleanParam(s: string, max = 900): string {
  return s.replace(/[\r\n\t]+/g, ' · ').replace(/ {2,}/g, ' ').trim().slice(0, max) || '-'
}

export async function sendWhatsApp(to: string, business: string, text: string): Promise<{ ok: boolean; error?: string }> {
  if (!whatsappConfigured()) return { ok: false, error: 'WhatsApp no está configurado en Faro' }
  try {
    const r = await fetch(`https://graph.facebook.com/v24.0/${PHONE_ID()}/messages`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${TOKEN()}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        messaging_product: 'whatsapp', to, type: 'template',
        template: { name: TEMPLATE(), language: { code: LANG() }, components: [{ type: 'body', parameters: [{ type: 'text', text: cleanParam(business, 60) }, { type: 'text', text: cleanParam(text) }] }] },
      }),
    })
    if (r.ok) return { ok: true }
    const j = await r.json().catch(() => ({})) as { error?: { message?: string; error_data?: { details?: string } } }
    return { ok: false, error: j.error?.error_data?.details || j.error?.message || `WhatsApp ${r.status}` }
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : 'No se pudo enviar' }
  }
}
