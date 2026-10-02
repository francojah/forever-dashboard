/**
 * Avisos al equipo cuando entra un cambio o suben un comprobante.
 * Canales (se usan todos los que estén configurados):
 *  - ntfy:      CAMBIOS_NTFY_TOPIC            → notificación push en el celu (app ntfy)
 *  - Telegram:  CAMBIOS_TELEGRAM_BOT_TOKEN + CAMBIOS_TELEGRAM_CHAT_ID
 *  - Webhook:   CAMBIOS_ALERT_WEBHOOK         → Slack / Discord / genérico ({ text })
 *  - Email:     CAMBIOS_ALERT_EMAIL           → requiere RESEND_API_KEY
 * El mensaje NO incluye datos personales del cliente: solo código, zona y monto.
 * Nunca lanza: un aviso caído no puede romper el pedido del cliente.
 */
import { CAMBIOS } from './config'

const TIMEOUT_MS = 4000

async function post(url: string, init: RequestInit) {
  const ctrl = new AbortController()
  const t = setTimeout(() => ctrl.abort(), TIMEOUT_MS)
  try {
    await fetch(url, { ...init, signal: ctrl.signal, cache: 'no-store' })
  } catch { /* silencioso */ }
  clearTimeout(t)
}

export function adminUrl() {
  return CAMBIOS.publicUrl.includes('cambios.') ? `${CAMBIOS.publicUrl}/admin` : `${CAMBIOS.appUrl}/gestion-cambios`
}

export async function notifyTeam(title: string, message: string) {
  const url = adminUrl()
  const jobs: Promise<void>[] = []
  const json = { 'Content-Type': 'application/json' }

  const topic = process.env.CAMBIOS_NTFY_TOPIC
  if (topic) {
    jobs.push(post('https://ntfy.sh', {
      method: 'POST', headers: json,
      body: JSON.stringify({ topic, title, message, click: url, tags: ['shirt'], priority: 4 }),
    }))
  }

  const tgToken = process.env.CAMBIOS_TELEGRAM_BOT_TOKEN
  const tgChat = process.env.CAMBIOS_TELEGRAM_CHAT_ID
  if (tgToken && tgChat) {
    jobs.push(post(`https://api.telegram.org/bot${tgToken}/sendMessage`, {
      method: 'POST', headers: json,
      body: JSON.stringify({ chat_id: tgChat, text: `${title}\n${message}\n${url}` }),
    }))
  }

  const hook = process.env.CAMBIOS_ALERT_WEBHOOK
  if (hook) {
    jobs.push(post(hook, { method: 'POST', headers: json, body: JSON.stringify({ text: `${title} — ${message} ${url}`, content: `${title} — ${message} ${url}` }) }))
  }

  const to = process.env.CAMBIOS_ALERT_EMAIL
  if (to && CAMBIOS.resendKey) {
    jobs.push(post('https://api.resend.com/emails', {
      method: 'POST', headers: { ...json, Authorization: `Bearer ${CAMBIOS.resendKey}` },
      body: JSON.stringify({ from: CAMBIOS.fromEmail, to: to.split(',').map((s) => s.trim()), subject: title, html: `<p>${message}</p><p><a href="${url}">Abrir panel de cambios</a></p>` }),
    }))
  }

  await Promise.all(jobs)
}
