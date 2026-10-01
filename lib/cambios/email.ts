import { CAMBIOS, ZONE_LABEL } from './config'
import { money, statusUrl } from './logic'

export type ExchangeRow = {
  id: string; code: string; status_token: string; type: string; status: string
  order_number: string; customer_name: string | null; email: string; phone: string | null
  zone: string; shipping_amount: number | null; items: { name: string; variant_label: string; new_variant_label?: string | null; quantity: number }[]
  moto_date?: string | null; tracking_number?: string | null; item_condition?: string | null
}

export type EmailKind = 'creado' | 'monto' | 'pago_confirmado' | 'prenda_recibida' | 'despachado' | 'resuelto' | 'cancelado'

const esc = (s: string) => s.replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]!))

function itemsHtml(r: ExchangeRow) {
  return r.items.map((i) =>
    `<li>${esc(i.name)} — ${esc(i.variant_label)}${i.new_variant_label ? ` → <b>${esc(i.new_variant_label)}</b>` : ''}${i.quantity > 1 ? ` (x${i.quantity})` : ''}</li>`
  ).join('')
}

function payBlock(r: ExchangeRow) {
  if (r.shipping_amount == null) return `<p>En breve te confirmamos el costo del envío por este medio.</p>`
  return `<p>Para avanzar, transferí <b>${money(r.shipping_amount)}</b> al alias <b>${esc(CAMBIOS.alias)}</b> (Mercado Pago) y poné <b>${esc(r.code)}</b> en el concepto. Después subí el comprobante desde el link de abajo.</p>`
}

export function buildEmail(kind: EmailKind, r: ExchangeRow): { subject: string; html: string } {
  const first = (r.customer_name || '').split(' ')[0] || 'Hola'
  const link = statusUrl(r.status_token)
  let subject = ''
  let body = ''
  switch (kind) {
    case 'creado':
      if (r.type === 'cambio') {
        subject = `Recibimos tu pedido de cambio ${r.code}`
        body = `<p>Recibimos tu pedido de cambio de la orden #${esc(r.order_number)}:</p><ul>${itemsHtml(r)}</ul>${payBlock(r)}`
      } else {
        subject = `Recibimos tu solicitud ${r.code}`
        body = `<p>Recibimos tu solicitud sobre la orden #${esc(r.order_number)}. Te escribimos por WhatsApp para coordinar.</p>`
      }
      break
    case 'monto':
      subject = `Costo del envío de tu cambio ${r.code}`
      body = payBlock(r)
      break
    case 'pago_confirmado':
      subject = `Pago confirmado — cambio ${r.code}`
      body = r.zone === 'correo'
        ? `<p>Confirmamos tu transferencia. Ahora mandá la prenda por Correo Argentino a:</p><p><b>${esc(CAMBIOS.returnAddress)}</b></p><p>Escribí <b>${esc(r.code)}</b> en el paquete. Cuando la recibamos te mandamos la nueva.</p>`
        : `<p>Confirmamos tu transferencia. En breve te avisamos qué día pasa la moto a retirar la prenda y entregarte la nueva.</p>`
      break
    case 'prenda_recibida':
      subject = `Recibimos tu prenda — cambio ${r.code}`
      body = `<p>Ya recibimos la prenda que nos mandaste. Estamos preparando el envío de la nueva.</p>`
      break
    case 'despachado':
      subject = r.zone === 'correo' ? `Tu cambio ${r.code} está en camino` : `La moto pasa por tu cambio ${r.code}`
      body = r.zone === 'correo'
        ? `<p>Tu cambio salió por Correo Argentino.</p>${r.tracking_number ? `<p>Número de seguimiento: <b>${esc(r.tracking_number)}</b><br/>Podés seguirlo en <a href="https://www.correoargentino.com.ar">correoargentino.com.ar</a></p>` : ''}`
        : `<p>La moto pasa <b>${esc(r.moto_date || 'en los próximos días')}</b>. Tené lista la prenda para entregar: te dejamos la nueva en el mismo momento.</p>`
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
  const html = `<div style="font-family:Arial,Helvetica,sans-serif;max-width:520px;margin:0 auto;color:#111;font-size:15px;line-height:1.5">
<p style="font-weight:bold;letter-spacing:2px;font-size:13px">${esc(CAMBIOS.brandName.toUpperCase())}</p>
<p>${esc(first)},</p>${body}
<p><a href="${link}" style="display:inline-block;background:#111;color:#fff;padding:10px 18px;border-radius:6px;text-decoration:none">Ver estado del cambio</a></p>
<p style="color:#666;font-size:13px">Cualquier duda, respondé este mail o escribinos por WhatsApp: https://wa.me/${CAMBIOS.whatsapp}</p></div>`
  return { subject, html }
}

/** Envía el mail si hay RESEND_API_KEY. Devuelve true si salió. Nunca lanza. */
export async function sendExchangeEmail(kind: EmailKind, r: ExchangeRow): Promise<boolean> {
  if (!CAMBIOS.resendKey || !r.email) return false
  const { subject, html } = buildEmail(kind, r)
  try {
    const res = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: { Authorization: `Bearer ${CAMBIOS.resendKey}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ from: CAMBIOS.fromEmail, to: [r.email], reply_to: CAMBIOS.replyTo, subject, html }),
    })
    return res.ok
  } catch {
    return false
  }
}

/** Mensaje de WhatsApp equivalente (para cuando no hay mail o como refuerzo). */
export function whatsappText(kind: EmailKind, r: ExchangeRow): string {
  const link = statusUrl(r.status_token)
  const first = (r.customer_name || '').split(' ')[0] || 'Hola'
  const base: Record<EmailKind, string> = {
    creado: r.type === 'cambio'
      ? (r.shipping_amount == null
        ? `${first}! Recibimos tu cambio ${r.code}. En breve te confirmamos el costo del envío.`
        : `${first}! Recibimos tu cambio ${r.code}. Para avanzar transferí ${money(r.shipping_amount)} al alias ${CAMBIOS.alias} con concepto ${r.code} y subí el comprobante acá:`)
      : `${first}! Recibimos tu solicitud ${r.code}, lo vemos por acá.`,
    monto: `${first}! El envío de tu cambio ${r.code} es ${money(r.shipping_amount)}. Transferí al alias ${CAMBIOS.alias} con concepto ${r.code} y subí el comprobante acá:`,
    pago_confirmado: r.zone === 'correo'
      ? `${first}! Confirmamos tu pago. Mandá la prenda por Correo Argentino a ${CAMBIOS.returnAddress}, con ${r.code} escrito en el paquete.`
      : `${first}! Confirmamos tu pago. Te avisamos qué día pasa la moto.`,
    prenda_recibida: `${first}! Recibimos tu prenda, preparamos el envío de la nueva.`,
    despachado: r.zone === 'correo'
      ? `${first}! Tu cambio salió por Correo Argentino${r.tracking_number ? `, seguimiento ${r.tracking_number}` : ''}.`
      : `${first}! La moto pasa ${r.moto_date || 'en los próximos días'} a retirar la prenda y dejarte la nueva.`,
    resuelto: `${first}! Tu solicitud ${r.code} quedó resuelta.`,
    cancelado: `${first}! Cancelamos la solicitud ${r.code}.`,
  }
  return `${base[kind]} ${link}`
}

export { ZONE_LABEL }
