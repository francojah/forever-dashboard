import nodemailer, { type Transporter } from 'nodemailer'
import { CAMBIOS, ZONE_LABEL, statusLabel } from './config'
import { amountDue, diffTotal, money, statusUrl } from './logic'

export type ExchangeRow = {
  id: string; code: string; status_token: string; type: string; status: string
  order_number: string; customer_name: string | null; email: string; phone: string | null
  zone: string; shipping_amount: number | null
  items: { name: string; variant_label: string; new_variant_label?: string | null; new_product_name?: string | null; price_diff?: number | null; quantity: number }[]
  address?: { dispatch_branch?: { name?: string; address?: string; locality?: string } | null } | null
  moto_date?: string | null; tracking_number?: string | null; item_condition?: string | null
}

export type EmailKind = 'creado' | 'monto' | 'pago_confirmado' | 'etiqueta' | 'prenda_recibida' | 'despachado' | 'resuelto' | 'cancelado'
export type EmailResult = { ok: boolean; error?: string }

const esc = (s: string) => s.replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]!))
const isMoto = (r: ExchangeRow) => r.zone === 'caba' || r.zone === 'moto_gba'
const DISPATCH = 'Despachamos los cambios todos los lunes.'

export function emailConfigured() {
  return !!CAMBIOS.smtp.pass || !!CAMBIOS.resendKey
}

function itemsHtml(r: ExchangeRow) {
  return r.items.map((i) =>
    `<li style="margin:0 0 6px">${esc(i.name)} — ${esc(i.variant_label)}${i.new_variant_label ? ` &rarr; <b>${i.new_product_name ? esc(i.new_product_name) + ' ' : ''}${esc(i.new_variant_label)}</b>` : ''}${i.quantity > 1 ? ` (x${i.quantity})` : ''}${i.price_diff ? ` (diferencia ${money(i.price_diff)})` : ''}</li>`
  ).join('')
}

function dueText(r: ExchangeRow) {
  const diff = diffTotal(r.items)
  const total = amountDue(r.shipping_amount, r.items)
  return diff > 0 ? `${money(total)}</b> (envío ${money(r.shipping_amount)} + diferencia ${money(diff)})<b>` : money(total)
}

function payBlock(r: ExchangeRow) {
  const total = amountDue(r.shipping_amount, r.items)
  if (total === 0) return `<p>El cambio no tiene costo. Te confirmamos día y horario para acercarte con la prenda.</p>`
  if (total == null) return `<p>En breve te confirmamos el costo del envío por este medio.</p>`
  return `<p>Para avanzar, transferí <b>${dueText(r)}</b>:</p>
<table cellpadding="0" cellspacing="0" style="background:#F4F4F3;border-radius:8px;margin:0 0 14px"><tr><td style="padding:12px 16px;font-size:14px;line-height:1.7">
Alias: <b>${esc(CAMBIOS.alias)}</b><br/>CVU: <b>${esc(CAMBIOS.cvu)}</b><br/>Concepto: <b>${esc(r.code)}</b></td></tr></table>
<p>Es una cuenta de Mercado Pago: podés transferir desde cualquier banco o billetera. Después subí el comprobante desde el botón de abajo.</p>`
}

function branchText(r: ExchangeRow) {
  const b = r.address?.dispatch_branch
  return b?.name ? ` desde <b>${esc(b.name)}</b>${b.address ? ` (${esc(b.address)})` : ''}` : ' en la sucursal que elegiste'
}

function nextStepAfterPay(r: ExchangeRow) {
  return isMoto(r)
    ? `<p>Coordinamos la moto: pasa por tu domicilio, <b>retira la prenda y te entrega la nueva en el mismo viaje</b>. ${DISPATCH} Te avisamos el día por este medio.</p>`
    : `<p><b>Estado: pendiente de recibir etiqueta.</b> Te vamos a enviar por mail la etiqueta de Correo Argentino para que despaches la prenda${branchText(r)}. Cuando la recibamos, te mandamos la nueva. ${DISPATCH}</p>`
}

export function buildEmail(kind: EmailKind, r: ExchangeRow): { subject: string; html: string; text: string } {
  const first = (r.customer_name || '').split(' ')[0] || 'Hola'
  const link = statusUrl(r.status_token)
  let subject = ''
  let body = ''
  let cta = 'Ver estado del cambio'
  switch (kind) {
    case 'creado':
      if (r.type === 'cambio') {
        subject = `Recibimos tu pedido de cambio ${r.code}`
        body = `<p>Recibimos tu pedido de cambio de la orden #${esc(r.order_number)}:</p><ul style="padding-left:18px;margin:0 0 14px">${itemsHtml(r)}</ul>${payBlock(r)}`
        if (amountDue(r.shipping_amount, r.items)) cta = 'Subir comprobante'
      } else {
        subject = `Recibimos tu solicitud ${r.code}`
        body = `<p>Recibimos tu solicitud sobre la orden #${esc(r.order_number)}. Te escribimos por WhatsApp para coordinar.</p>`
      }
      break
    case 'monto':
      subject = `Costo del envío de tu cambio ${r.code}`
      body = payBlock(r)
      cta = 'Subir comprobante'
      break
    case 'pago_confirmado':
      subject = isMoto(r) ? `Pago confirmado — cambio ${r.code}` : `Pago confirmado: pendiente de recibir etiqueta — cambio ${r.code}`
      body = `<p>Confirmamos tu transferencia.</p>${nextStepAfterPay(r)}`
      break
    case 'etiqueta':
      subject = `Etiqueta recibida: ya podés despachar tu cambio ${r.code}`
      body = `<p><b>Estado: etiqueta recibida.</b> Ya tenés tu etiqueta de Correo Argentino.</p>
<ol style="padding-left:18px;margin:0 0 14px"><li>Descargala desde el botón de abajo e imprimila.</li><li>Pegala en el paquete con la prenda.</li><li>Despachalo${branchText(r)}.</li></ol>
<p>Cuando la recibamos te mandamos la nueva. ${DISPATCH}</p>`
      cta = 'Descargar etiqueta'
      break
    case 'prenda_recibida':
      subject = `Recibimos tu prenda — cambio ${r.code}`
      body = isMoto(r)
        ? `<p>¡Listo! Ya hicimos el cambio. Gracias por elegirnos.</p>`
        : `<p>Ya recibimos la prenda que nos mandaste. Tu cambio sale el próximo lunes por Correo Argentino.</p>`
      break
    case 'despachado':
      subject = isMoto(r) ? `La moto pasa por tu cambio ${r.code}` : r.zone === 'retiro' ? `Tu cambio ${r.code} está coordinado` : `Tu cambio ${r.code} está en camino`
      body = r.zone === 'retiro'
        ? `<p>Te esperamos <b>${esc(r.moto_date || '')}</b> con la prenda a cambiar. Ahí mismo te damos la nueva.</p>`
        : isMoto(r)
        ? `<p>La moto pasa <b>${esc(r.moto_date || 'el lunes')}</b>. Tené lista la prenda: la retira y te entrega la nueva en el mismo momento.</p>`
        : `<p>Tu cambio salió por Correo Argentino.</p>${r.tracking_number ? `<p>Número de seguimiento: <b>${esc(r.tracking_number)}</b><br/>Podés seguirlo en <a href="https://www.correoargentino.com.ar" style="color:#8B6914">correoargentino.com.ar</a></p>` : ''}`
      break
    case 'resuelto':
      subject = `Tu solicitud ${r.code} fue resuelta`
      body = `<p>Tu solicitud quedó resuelta. ¡Gracias por elegirnos!</p>`
      break
    case 'cancelado':
      subject = `Solicitud ${r.code} cancelada`
      body = `<p>Tu solicitud fue cancelada. Si fue un error, escribinos por WhatsApp.</p>`
      break
  }
  const estado = r.type === 'cambio' ? statusLabel(r.status, r.zone) : ''
  const html = `<div style="background:#F4F4F3;padding:24px 12px;font-family:Arial,Helvetica,sans-serif">
<table cellpadding="0" cellspacing="0" width="100%" style="max-width:520px;margin:0 auto;background:#ffffff;border-radius:12px;overflow:hidden">
<tr><td style="background:#000000;padding:18px 24px;text-align:center">
<div style="color:#ffffff;font-size:15px;font-weight:bold;letter-spacing:6px">FOREVER</div>
<div style="color:#D4A94A;font-size:9px;letter-spacing:6px;margin-top:2px">basics</div></td></tr>
<tr><td style="padding:24px;color:#111111;font-size:15px;line-height:1.55">
${estado ? `<p style="margin:0 0 14px;font-size:12px;color:#8B6914;font-weight:bold">Cambio ${esc(r.code)} · ${esc(estado)}</p>` : ''}
<p style="margin:0 0 12px">${esc(first)},</p>
${body}
<p style="margin:20px 0 8px"><a href="${link}" style="display:inline-block;background:#000000;color:#ffffff;padding:13px 22px;border-radius:8px;text-decoration:none;font-weight:bold">${cta}</a></p>
<p style="color:#666666;font-size:13px;margin:18px 0 0">Cualquier duda, respondé este mail o escribinos por <a href="https://wa.me/${CAMBIOS.whatsapp}" style="color:#8B6914">WhatsApp</a>.</p>
</td></tr>
<tr><td style="padding:14px 24px;border-top:1px solid #EFEFEC;text-align:center;font-size:12px">
<a href="${CAMBIOS.storeUrl}" style="color:#8B6914;text-decoration:none;font-weight:bold">Volver a la tienda</a></td></tr>
</table></div>`
  const text = `${first},\n\n${body.replace(/<br\s*\/?>/g, '\n').replace(/<\/(p|li|ol|ul|tr)>/g, '\n').replace(/<[^>]+>/g, '').replace(/&rarr;/g, '->').replace(/&amp;/g, '&').replace(/\n{3,}/g, '\n\n').trim()}\n\n${cta}: ${link}\n\nForever Basics — ${CAMBIOS.storeUrl}`
  return { subject, html, text }
}

let transport: Transporter | null = null
function smtp() {
  if (!transport) {
    const c = CAMBIOS.smtp
    transport = nodemailer.createTransport({
      host: c.host, port: c.port, secure: c.port === 465,
      auth: { user: c.user, pass: c.pass },
      connectionTimeout: 8000, greetingTimeout: 8000, socketTimeout: 12000,
    })
  }
  return transport
}

/** Envía el mail al cliente (Zoho SMTP; Resend como alternativa). Nunca lanza: devuelve { ok, error }. */
export async function sendExchangeEmail(kind: EmailKind, r: ExchangeRow): Promise<EmailResult> {
  if (!r.email) return { ok: false, error: 'El cambio no tiene email' }
  const { subject, html, text } = buildEmail(kind, r)
  try {
    if (CAMBIOS.smtp.pass) {
      await smtp().sendMail({ from: CAMBIOS.fromEmail, to: r.email, replyTo: CAMBIOS.replyTo, subject, html, text })
      return { ok: true }
    }
    if (CAMBIOS.resendKey) {
      const res = await fetch('https://api.resend.com/emails', {
        method: 'POST',
        headers: { Authorization: `Bearer ${CAMBIOS.resendKey}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ from: CAMBIOS.fromEmail, to: [r.email], reply_to: CAMBIOS.replyTo, subject, html, text }),
      })
      return res.ok ? { ok: true } : { ok: false, error: `Resend HTTP ${res.status}` }
    }
    return { ok: false, error: 'Mail sin configurar (falta ZOHO_SMTP_PASS)' }
  } catch (e) {
    return { ok: false, error: (e as Error).message.slice(0, 200) }
  }
}

/** Qué mail corresponde al estado actual (para reenviar). */
export function kindForStatus(r: { status: string; type: string }, hasLabel: boolean): EmailKind {
  const map: Record<string, EmailKind> = {
    pendiente_pago: 'creado', revision: 'creado', pago_confirmado: 'pago_confirmado', etiqueta_enviada: 'etiqueta',
    prenda_recibida: 'prenda_recibida', despachado: 'despachado', resuelto: 'resuelto', cancelado: 'cancelado',
  }
  if (r.status === 'pago_confirmado' && hasLabel) return 'etiqueta'
  return map[r.status] ?? 'creado'
}

/** Mensaje de WhatsApp equivalente (refuerzo opcional desde el panel). */
export function whatsappText(kind: EmailKind, r: ExchangeRow): string {
  const link = statusUrl(r.status_token)
  const first = (r.customer_name || '').split(' ')[0] || 'Hola'
  const moto = isMoto(r)
  const pay = `alias ${CAMBIOS.alias} (CVU ${CAMBIOS.cvu}, podés transferir desde cualquier banco) con concepto ${r.code}`
  const base: Record<EmailKind, string> = {
    creado: r.type === 'cambio'
      ? (amountDue(r.shipping_amount, r.items) === 0
        ? `${first}! Recibimos tu cambio ${r.code}. No tiene costo: te confirmamos día y horario para acercarte con la prenda.`
        : r.shipping_amount == null
        ? `${first}! Recibimos tu cambio ${r.code}. En breve te confirmamos el costo del envío.`
        : `${first}! Recibimos tu cambio ${r.code}. Para avanzar transferí ${money(amountDue(r.shipping_amount, r.items))}${diffTotal(r.items) > 0 ? ` (envío + diferencia de precio)` : ''} al ${pay} y subí el comprobante acá:`)
      : `${first}! Recibimos tu solicitud ${r.code}, lo vemos por acá.`,
    monto: `${first}! El total de tu cambio ${r.code} es ${money(amountDue(r.shipping_amount, r.items))}. Transferí al ${pay} y subí el comprobante acá:`,
    pago_confirmado: moto
      ? `${first}! Confirmamos tu pago. La moto retira tu prenda y te entrega la nueva en el mismo viaje. Despachamos los lunes, te avisamos el día.`
      : `${first}! Confirmamos tu pago. Estado: pendiente de recibir etiqueta. En breve te mandamos la etiqueta de Correo Argentino para que despaches la prenda.`,
    etiqueta: `${first}! Ya tenés la etiqueta para despachar tu cambio ${r.code}: descargala acá, imprimila, pegala en el paquete y despachalo en la sucursal de Correo Argentino que elegiste.`,
    prenda_recibida: moto
      ? `${first}! Listo, cambio hecho. ¡Gracias!`
      : `${first}! Recibimos tu prenda. Tu cambio sale el próximo lunes por Correo Argentino.`,
    despachado: r.zone === 'retiro'
      ? `${first}! Te esperamos ${r.moto_date || ''} con la prenda para hacer el cambio.`
      : moto
      ? `${first}! La moto pasa ${r.moto_date || 'el lunes'}: retira tu prenda y te entrega la nueva.`
      : `${first}! Tu cambio salió por Correo Argentino${r.tracking_number ? `, seguimiento ${r.tracking_number}` : ''}.`,
    resuelto: `${first}! Tu solicitud ${r.code} quedó resuelta.`,
    cancelado: `${first}! Cancelamos la solicitud ${r.code}.`,
  }
  return `${base[kind]} ${link}`
}

export { ZONE_LABEL }
