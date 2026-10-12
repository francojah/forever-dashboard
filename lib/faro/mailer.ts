import nodemailer from 'nodemailer'

/**
 * Envío de mails de Faro (resumen semanal). Usa un SMTP propio de Faro (FARO_SMTP_*) o Resend
 * (RESEND_API_KEY + FARO_MAIL_FROM). Nunca usa el mail de una tienda cliente.
 */
const SMTP = {
  host: process.env.FARO_SMTP_HOST || '',
  port: Number(process.env.FARO_SMTP_PORT) || 465,
  user: process.env.FARO_SMTP_USER || '',
  pass: process.env.FARO_SMTP_PASS || '',
}
const FROM = process.env.FARO_MAIL_FROM || (SMTP.user ? `Faro <${SMTP.user}>` : '')

export const mailConfigured = () => !!FROM && ((!!SMTP.host && !!SMTP.pass) || !!process.env.RESEND_API_KEY)

export async function sendMail(m: { to: string[]; subject: string; html: string; text: string }): Promise<{ ok: boolean; error?: string }> {
  if (!m.to.length) return { ok: false, error: 'Sin destinatarios' }
  if (!mailConfigured()) return { ok: false, error: 'Falta configurar el envío de mails de Faro (FARO_SMTP_* o RESEND_API_KEY + FARO_MAIL_FROM)' }
  try {
    if (SMTP.host && SMTP.pass) {
      const t = nodemailer.createTransport({ host: SMTP.host, port: SMTP.port, secure: SMTP.port === 465, auth: { user: SMTP.user, pass: SMTP.pass } })
      await t.sendMail({ from: FROM, to: m.to.join(', '), subject: m.subject, html: m.html, text: m.text })
      return { ok: true }
    }
    const r = await fetch('https://api.resend.com/emails', {
      method: 'POST', headers: { Authorization: `Bearer ${process.env.RESEND_API_KEY}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ from: FROM, to: m.to, subject: m.subject, html: m.html, text: m.text }),
    })
    if (!r.ok) return { ok: false, error: `Resend ${r.status}: ${(await r.text()).slice(0, 200)}` }
    return { ok: true }
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : 'No se pudo enviar' }
  }
}
