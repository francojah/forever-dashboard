/**
 * Etiquetas de envío por moto: logo + número de orden + destinatario + domicilio completo.
 * Formatos: "a4" (4 etiquetas A6 por hoja, con líneas de corte) o "10x15" (una por hoja, impresora de etiquetas).
 */
import { PDFDocument, StandardFonts, rgb, type PDFFont, type PDFImage, type PDFPage } from 'pdf-lib'
import { LOGO_PNG_BASE64 } from './logo'
import type { MotoOrder } from './motoOrders'

const MM = 72 / 25.4
export type LabelFormat = 'a4' | '10x15'

const BLACK = rgb(0, 0, 0)
const GREY = rgb(0.38, 0.38, 0.38)
const LIGHT = rgb(0.82, 0.82, 0.82)

/** Las fuentes estándar del PDF solo aceptan Latin-1: se conservan acentos y ñ, se sacan emojis y símbolos raros. */
function safe(s: string | null | undefined): string {
  return (s || '')
    .replace(/[‘’]/g, "'").replace(/[“”]/g, '"').replace(/[–—]/g, '-')
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

/** Achica la letra hasta que el texto entre en `maxLines` renglones. */
function fit(text: string, font: PDFFont, size: number, min: number, maxWidth: number, maxLines: number) {
  let s = size
  let lines = wrap(text, font, s, maxWidth)
  while (lines.length > maxLines && s > min) { s -= 0.5; lines = wrap(text, font, s, maxWidth) }
  return { size: s, lines: lines.slice(0, maxLines) }
}

type Fonts = { bold: PDFFont; reg: PDFFont; logo: PDFImage }

/**
 * Dibuja una etiqueta. Con `dry` solo mide (no dibuja) y devuelve hasta dónde llegó el contenido,
 * así se puede achicar todo si una dirección o nota muy larga no entra.
 */
function layoutLabel(page: PDFPage, o: MotoOrder, x0: number, y0: number, w: number, h: number, f: Fonts, k: number, dry: boolean): number {
  const m = 7 * MM
  const left = x0 + m
  const inner = w - 2 * m
  let y = y0 + h - m
  const S = (n: number) => n * k
  const drawText = (t: string, opts: Parameters<PDFPage['drawText']>[1]) => { if (!dry) page.drawText(t, opts) }
  const drawRect = (opts: Parameters<PDFPage['drawRectangle']>[0]) => { if (!dry) page.drawRectangle(opts) }

  // Logo centrado
  const logoW = Math.min(inner * 0.62, 62 * MM) * Math.max(k, 0.8)
  const logoH = logoW * (f.logo.height / f.logo.width)
  if (!dry) page.drawImage(f.logo, { x: x0 + (w - logoW) / 2, y: y - logoH, width: logoW, height: logoH })
  y -= logoH + 4 * MM

  const rule = (gap = 3.5) => {
    if (!dry) page.drawLine({ start: { x: left, y }, end: { x: left + inner, y }, thickness: 0.8, color: LIGHT })
    y -= gap * MM
  }
  const text = (t: string, size: number, font: PDFFont, color = BLACK, after = 0.35) => {
    y -= size
    drawText(safe(t), { x: left, y, size, font, color })
    y -= size * after
  }
  const block = (t: string, size: number, min: number, font: PDFFont, maxLines: number, color = BLACK) => {
    if (!safe(t)) return
    const r = fit(t, font, S(size), S(min), inner, maxLines)
    for (const l of r.lines) text(l, r.size, font, color, 0.3)
  }

  rule()

  // Número de orden + tipo de envío
  text('ORDEN', 7.5, f.bold, GREY, 0.25)
  const numSize = S(26)
  y -= numSize
  drawText(`#${o.number}`, { x: left, y, size: numSize, font: f.bold, color: BLACK })
  const tag = 'ENVÍO POR MOTO'
  const tagSize = 8
  const tagW = f.bold.widthOfTextAtSize(safe(tag), tagSize) + 4 * MM
  const tagH = 5.5 * MM
  drawRect({ x: left + inner - tagW, y: y + 2, width: tagW, height: tagH, color: BLACK })
  drawText(safe(tag), { x: left + inner - tagW + 2 * MM, y: y + 2 + (tagH - tagSize) / 2 + 1, size: tagSize, font: f.bold, color: rgb(1, 1, 1) })
  y -= numSize * 0.3 + 2 * MM

  rule(4)

  // Destinatario: todo lo que cargó en la compra
  text('DESTINATARIO', 7.5, f.bold, GREY, 0.6)
  block(o.name || 'Sin nombre', 20, 12, f.bold, 2)
  y -= S(2.5 * MM)
  block(o.street, 16, 10, f.reg, 2)
  // El campo "piso/depto" a veces trae referencias (entre calles): solo se rotula si parece un piso/depto
  if (o.floor) block(/\d/.test(o.floor) && o.floor.length <= 10 ? `Piso / Depto: ${o.floor}` : o.floor, 14, 9, f.reg, 3)
  const loc = [o.locality, o.city && o.city.toLowerCase() !== o.locality.toLowerCase() ? o.city : ''].filter(Boolean).join(', ')
  block(loc, 15, 9, f.reg, 2)
  block([o.province, o.zipcode ? `CP ${o.zipcode}` : ''].filter(Boolean).join(' · '), 13, 9, f.reg, 1)
  if (o.phone) { y -= S(2.5 * MM); block(`Tel: ${o.phone}`, 15, 10, f.bold, 1) }

  // Nota del cliente (indicaciones que dejó en la compra)
  if (safe(o.note)) {
    y -= S(3 * MM)
    const r = fit(o.note, f.reg, S(9.5), 7, inner - 4 * MM, 5)
    const boxH = r.lines.length * r.size * 1.3 + 3 * MM + 9
    drawRect({ x: left, y: y - boxH, width: inner, height: boxH, borderColor: LIGHT, borderWidth: 0.8 })
    let yy = y - 2 * MM - 7
    drawText('NOTA DEL CLIENTE', { x: left + 2 * MM, y: yy, size: 7, font: f.bold, color: GREY })
    yy -= 3
    for (const l of r.lines) { yy -= r.size; drawText(l, { x: left + 2 * MM, y: yy, size: r.size, font: f.reg, color: BLACK }); yy -= r.size * 0.3 }
    y -= boxH
  }

  // Pie
  const footY = y0 + m - 2
  drawText(safe(o.shipping_option), { x: left, y: footY, size: 7.5, font: f.reg, color: GREY })
  const site = 'foreverbasics.com.ar'
  drawText(site, { x: left + inner - f.reg.widthOfTextAtSize(site, 7.5), y: footY, size: 7.5, font: f.reg, color: GREY })
  return y - (footY + 7.5 + 2 * MM) // >= 0 si entra sin pisar el pie
}

function drawLabel(page: PDFPage, o: MotoOrder, x0: number, y0: number, w: number, h: number, f: Fonts) {
  let k = 1
  while (k > 0.6 && layoutLabel(page, o, x0, y0, w, h, f, k, true) < 0) k -= 0.05
  layoutLabel(page, o, x0, y0, w, h, f, k, false)
}

export async function buildMotoLabelsPdf(orders: MotoOrder[], format: LabelFormat): Promise<Uint8Array> {
  const pdf = await PDFDocument.create()
  pdf.setTitle(`Etiquetas moto (${orders.length})`)
  const f = {
    bold: await pdf.embedFont(StandardFonts.HelveticaBold),
    reg: await pdf.embedFont(StandardFonts.Helvetica),
    logo: await pdf.embedPng(Buffer.from(LOGO_PNG_BASE64, 'base64')),
  }

  if (format === '10x15') {
    const W = 100 * MM, H = 150 * MM
    for (const o of orders) drawLabel(pdf.addPage([W, H]), o, 0, 0, W, H, f)
    return pdf.save()
  }

  // A4: 4 por hoja (2 x 2), cada una del tamaño de una A6 (~10,5 x 14,8 cm)
  const W = 210 * MM, H = 297 * MM
  const cw = W / 2, ch = H / 2
  for (let i = 0; i < orders.length; i += 4) {
    const page = pdf.addPage([W, H])
    const dash = { thickness: 0.5, color: LIGHT, dashArray: [4, 4] }
    page.drawLine({ start: { x: cw, y: 0 }, end: { x: cw, y: H }, ...dash })
    page.drawLine({ start: { x: 0, y: ch }, end: { x: W, y: ch }, ...dash })
    const slots = [[0, ch], [cw, ch], [0, 0], [cw, 0]]
    orders.slice(i, i + 4).forEach((o, k) => drawLabel(page, o, slots[k][0], slots[k][1], cw, ch, f))
  }
  return pdf.save()
}
