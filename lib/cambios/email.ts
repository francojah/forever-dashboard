import { CAMBIOS, ZONE_LABEL } from './config'
import { amountDue, diffTotal, money, statusUrl } from './logic'

export type ExchangeRow = {
  id: string; code: string; status_token: string; type: string; status: string
  order_number: string; customer_name: string | null; email: string; phone: string | null
  zone: string; shipping_amount: number | null; items: { name: string; variant_label: string; new_variant_label?: string | null; new_product_name?: string | null; price_diff?: number | null; quantity: number }[]
  moto_date?: string | null; tracking_number?: string | null; item_condition?: string | null
}

export type EmailKind = 'creado' | 'monto' | 'pago_confirmado' | 'etiqueta' | 'prenda_recibida' | 'despachado' | 'resuelto' | 'cancelado'

const esc = (s: string) => s.replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]!))
const isMoto = (r: ExchangeRow) => r.zone === 'caba' || r.zone === 'moto_gba'
const DISPATCH = 'Despachamos los cambios todos los lunes.'

function itemsHtml(r: ExchangeRow) {
  return r.items.map((i) =>
    `<li>${esc(i.name)} — ${esc(i.variant_label)}${i.new_variant_label ? ` → <b>${i.new_product_name ? esc(i.new_product_name) + ' ' : ''}${esc(i.new_variant_label)}</b>` : ''}${i.quantity > 1 ? ` (x${i.quantity})` : ''}${i.price_diff ? ` (diferencia ${money(i.price_diff)})` : ''}</li>`
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
  return `<p>Para avanzar, transferí <b>${dueText(r)}</b> al alias <b>${esc(CAMBIOS.alias)}</b> (CVU ${esc(CAMBIOS.cvu)}) y poné <b>${esc(r.code)}</b> en el concepto. Es una cuenta de Mercado Pago: podés transferir desde cualquier banco o billetera. Después subí el comprobante desde el link de abajo.</p>`
}

function nextStepAfterPay(r: ExchangeRow) {
  return isMoto(r)
    ? `<p>Coordinamos la moto: pasa por tu domicilio, <b>retira la prenda y te entrega la nueva en el mismo viaje</b>. ${DISPATCH} Te avisamos el día.</p>`
    : `<p>Te vamos a enviar la <b>etiqueta de Correo Argentino</b> para que despaches la prenda en cualquier sucursal. Cuando la recibamos, te mandamos la nueva. ${DISPATCH}</p>`
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
      body = `<p>Confirmamos tu transferencia.</p>${nextStepAfterPay(r)}`
      break
    case 'etiqueta':
      subject = `Tu etiqueta para despachar el cambio ${r.code}`
      body = `<p>Ya tenés tu etiqueta de Correo Argentino. Descargala desde el link de abajo, imprimila, pegala en el paquete con la prenda y despachalo en cualquier sucursal.</p><p>Cuando la recibamos te mandamos la nueva. ${DISPATCH}</p>`
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
        : `<p>Tu cambio salió por Correo Argentino.</p>${r.tracking_number ? `<p>Número de seguimiento: <b>${esc(r.tracking_number)}</b><br/>Podés seguirlo en <a href="https://www.correoargentino.com.ar">correoargentino.com.ar</a></p>` : ''}`
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
  const moto = isMoto(r)
  const base: Record<EmailKind, string> = {
    creado: r.type === 'cambio'
      ? (amountDue(r.shipping_amount, r.items) === 0
        ? `${first}! Recibimos tu cambio ${r.code}. No tiene costo: te confirmamos día y horario para acercarte con la prenda.`
        : r.shipping_amount == null
        ? `${first}! Recibimos tu cambio ${r.code}. En breve te confirmamos el costo del envío.`
        : `${first}! Recibimos tu cambio ${r.code}. Para avanzar transferí ${money(amountDue(r.shipping_amount, r.items))}${diffTotal(r.items) > 0 ? ` (envío + diferencia de precio)` : ''} al alias ${CAMBIOS.alias} (CVU ${CAMBIOS.cvu}, podés transferir desde cualquier banco) con concepto ${r.code} y subí el comprobante acá:`)
      : `${first}! Recibimos tu solicitud ${r.code}, lo vemos por acá.`,
    monto: `${first}! El total de tu cambio ${r.code} es ${money(amountDue(r.shipping_amount, r.items))}. Transferí al alias ${CAMBIOS.alias} (CVU ${CAMBIOS.cvu}, podés transferir desde cualquier banco) con concepto ${r.code} y subí el comprobante acá:`,
    pago_confirmado: moto
      ? `${first}! Confirmamos tu pago. La moto retira tu prenda y te entrega la nueva en el mismo viaje. Despachamos los lunes, te avisamos el día.`
      : `${first}! Confirmamos tu pago. En breve te mandamos la etiqueta de Correo Argentino para que despaches la prenda.`,
    etiqueta: `${first}! Ya tenés la etiqueta para despachar tu cambio ${r.code}: descargala acá, imprimila, pegala en el paquete y despachalo en cualquier sucursal de Correo Argentino.`,
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
