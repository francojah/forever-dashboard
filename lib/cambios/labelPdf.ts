/**
 * Etiqueta imprimible (10 x 15 cm) con los datos de entrega de un cambio.
 * Se descarga desde el panel para imprimir directo.
 */
import { PDFDocument, StandardFonts, rgb, type PDFFont, type PDFPage } from 'pdf-lib'
import { ZONE_LABEL } from './config'

const MM = 72 / 25.4
const W = 100 * MM
const H = 150 * MM
const M = 7 * MM

type Row = {
  code: string; order_number: string; zone: string; customer_name: string | null; phone: string | null
  moto_date?: string | null; customer_note?: string | null
  address?: { name?: string; street?: string; floor?: string; locality?: string; city?: string; province?: string; zipcode?: string; notes?: string; branch?: string } | null
  items: { name: string; variant_label: string; quantity: number; new_product_name?: string | null; new_variant_label?: string | null }[]
}

/** Las fuentes estándar del PDF solo aceptan WinAnsi: sacamos emojis y símbolos raros. */
function safe(s: string | null | undefined): string {
  return (s || '')
    .replace(/[‘’]/g, "'").replace(/[“”]/g, '"').replace(/[–—]/g, '-').replace(/→/g, '>')
    .replace(/[^\x20-\x7E -ÿ]/g, '')
    .replace(/\s+/g, ' ').trim()
}

function wrap(text: string, font: PDFFont, size: number, maxWidth: number): string[] {
  const words = safe(text).split(' ').filter(Boolean)
  const lines: string[] = []
  let cur = ''
  for (const w of words) {
    const test = cur ? `${cur} ${w}` : w
    if (font.widthOfTextAtSize(test, size) <= maxWidth || !cur) cur = test
    else { lines.push(cur); cur = w }
  }
  if (cur) lines.push(cur)
  return lines
}

export async function buildLabelPdf(r: Row): Promise<Uint8Array> {
  const pdf = await PDFDocument.create()
  pdf.setTitle(`Cambio ${r.code}`)
  const page: PDFPage = pdf.addPage([W, H])
  const bold = await pdf.embedFont(StandardFonts.HelveticaBold)
  const reg = await pdf.embedFont(StandardFonts.Helvetica)
  const black = rgb(0, 0, 0)
  const grey = rgb(0.35, 0.35, 0.35)
  const gold = rgb(0.72, 0.54, 0.17)
  const inner = W - 2 * M
  let y = H

  // Encabezado
  const band = 17 * MM
  page.drawRectangle({ x: 0, y: H - band, width: W, height: band, color: black })
  page.drawText('FOREVER BASICS', { x: M, y: H - 8 * MM, size: 12, font: bold, color: rgb(1, 1, 1) })
  page.drawText('CAMBIO', { x: M, y: H - 13.5 * MM, size: 9, font: bold, color: gold })
  const codeW = bold.widthOfTextAtSize(r.code, 20)
  page.drawText(r.code, { x: W - M - codeW, y: H - 11.5 * MM, size: 20, font: bold, color: rgb(1, 1, 1) })
  y = H - band - 4 * MM

  // y es el borde superior libre: bajamos el alto de la letra, dibujamos y dejamos el interlineado
  const line = (text: string, size: number, font: PDFFont, color = black, gap = 1.3) => {
    for (const l of wrap(text, font, size, inner)) {
      y -= size
      page.drawText(l, { x: M, y, size, font, color })
      y -= size * (gap - 1)
    }
  }
  const label = (text: string) => { line(text, 7.5, bold, grey, 1.5) }
  const rule = () => { y -= 1.5 * MM; page.drawLine({ start: { x: M, y }, end: { x: W - M, y }, thickness: 0.7, color: rgb(0.8, 0.8, 0.8) }); y -= 5 * MM }

  line(`Orden #${safe(r.order_number)}  ·  ${safe(ZONE_LABEL[r.zone] ?? r.zone)}${r.moto_date ? `  ·  ${safe(r.moto_date)}` : ''}`, 8.5, reg, grey)
  y -= 2.5 * MM

  const a = r.address || {}
  label('ENTREGAR A')
  line(a.name || r.customer_name || 'Sin nombre', 17, bold, black, 1.25)
  y -= 1.5 * MM
  if (a.branch) line(`Punto de retiro: ${a.branch}`, 12, reg)
  line([a.street, a.floor].filter(Boolean).join(' - '), 13, reg)
  line([a.locality, a.city && a.city !== a.locality ? a.city : ''].filter(Boolean).join(', '), 13, reg)
  line([a.province, a.zipcode ? `CP ${a.zipcode}` : ''].filter(Boolean).join(' - '), 11, reg)
  if (r.phone) { y -= 1 * MM; line(`Tel / WhatsApp: ${r.phone}`, 12, bold) }
  if (a.notes) { y -= 1 * MM; line(`Indicaciones: ${a.notes}`, 9.5, reg, grey) }

  rule()
  label('RETIRAR')
  for (const it of r.items) line(`${it.quantity} x ${it.name} - ${it.variant_label}`, 10, reg)
  y -= 2 * MM
  label('ENTREGAR')
  for (const it of r.items) {
    if (it.new_variant_label) line(`${it.quantity} x ${it.new_product_name || it.name} - ${it.new_variant_label}`, 10.5, bold)
  }
  if (r.customer_note) { rule(); label('COMENTARIO DEL CLIENTE'); line(r.customer_note, 9, reg, grey) }

  page.drawText('foreverbasics.com.ar', { x: M, y: 5 * MM, size: 7.5, font: reg, color: grey })
  return pdf.save()
}
