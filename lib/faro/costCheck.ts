import type { PnL } from './pnl'
import type { WorkspaceSettings } from './settings'

/**
 * Chequeo de costos: qué partes del resultado son supuestos o pueden estar faltando.
 * Un margen de contribución muy alto casi siempre es un costo que no está cargado.
 */
export interface CostCheck { key: string; level: 'bad' | 'warn' | 'ok'; title: string; detail: string; href?: string; impact?: number }

export function costChecks(p: PnL, s: WorkspaceSettings): CostCheck[] {
  const out: CostCheck[] = []
  const n = p.sales.netSales
  if (n <= 0) return out
  const cm = p.contribution / n
  const est = p.sales.cogsCoverage.estimated
  const plat = p.sales.cogsCoverage.platform

  if (est > 0.02) out.push({ key: 'cogs', level: est > 0.2 ? 'bad' : 'warn', title: `${Math.round(est * 100)}% de las unidades no tiene costo cargado`, detail: `Se estima como ${s.cost_fallback_pct}% del precio. Cargá el costo real de esos productos.`, href: '/ajustes?tab=productos' })
  else if (plat > 0.3) out.push({ key: 'cogs-tn', level: 'ok', title: `El costo de ${Math.round(plat * 100)}% de las unidades sale de Tiendanube`, detail: 'Está bien si el costo cargado en Tiendanube está actualizado. Si cambió, cargalo en Faro con la fecha desde la que rige.', href: '/ajustes?tab=productos' })

  if (p.sales.paymentFeesUnknownShare > 0.02) out.push({ key: 'fees', level: 'bad', title: `${Math.round(p.sales.paymentFeesUnknownShare * 100)}% de las ventas no tiene comisión de pago`, detail: 'Se está tomando 0%. Las pasarelas suelen cobrar entre 4% y 8% más impuestos según cuotas y plazo de acreditación.', href: '/ajustes?tab=costos', impact: n * p.sales.paymentFeesUnknownShare * 0.06 })

  if (s.iibb_pct === 0) out.push({ key: 'iibb', level: 'warn', title: 'Ingresos Brutos está en 0%', detail: 'Si estás inscripto en IIBB, cargá tu alícuota (confirmala con tu contador). Sin esto la ganancia queda inflada.', href: '/ajustes?tab=costos' })

  if (s.ad_tax_pct === 0 && p.ads.spend > 0) out.push({ key: 'adtax', level: 'warn', title: 'La pauta no tiene impuestos cargados', detail: 'Meta factura desde el exterior y la tarjeta suma IVA y percepciones. La parte que no recuperás es costo: cargala en Costos y comisiones.', href: '/ajustes?tab=costos' })

  if (s.packaging_per_order === 0) out.push({ key: 'pack', level: 'warn', title: 'Packaging en $0 por orden', detail: 'Bolsa, caja, etiqueta y cinta suman por cada envío. Cargá un promedio por orden.', href: '/ajustes?tab=costos' })

  if (p.sales.shippingOwner === 0 && p.sales.orders > 20) out.push({ key: 'ship', level: 'warn', title: 'No hay envíos pagados por la tienda', detail: 'Si ofrecés envío gratis o lo bonificás, ese costo tiene que estar. Revisá que tu medio de envío lo informe en Tiendanube.' })

  else if (p.sales.shippingCustomer > 0 && Math.abs(p.sales.shippingOwner - p.sales.shippingCustomer) / p.sales.shippingCustomer < 0.03) out.push({ key: 'ship-eq', level: 'warn', title: 'El envío pagado es igual al cobrado', detail: 'Tiendanube informa lo que pagó el cliente. Si bonificás envíos (por ejemplo con promos o envío gratis), lo que pagás al correo no está y el margen queda inflado. Cargalo como costo del mes o por orden.', href: '/finanzas?tab=fijos' })

  if (p.fixed.length === 0) out.push({ key: 'fixed', level: 'warn', title: 'No hay costos fijos cargados', detail: 'Sueldos, alquiler, sistemas, contador. Sin ellos el resultado operativo es igual a la ganancia después de publicidad.', href: '/finanzas?tab=fijos' })

  if (cm > 0.55) out.push({ key: 'cm-high', level: out.some((c) => c.level !== 'ok') ? 'warn' : 'ok', title: `Margen de contribución de ${Math.round(cm * 100)}%`, detail: 'Es alto para un ecommerce que vende con pauta. Si los puntos de arriba están bien cargados, el número es real; si no, probablemente falta algún costo.' })

  if (!out.some((c) => c.level !== 'ok')) out.unshift({ key: 'all-ok', level: 'ok', title: 'Costos completos', detail: 'Mercadería, comisiones, impuestos, packaging y fijos están cargados: el resultado es real.' })
  return out
}

/** Proyección de cierre del mes en curso al ritmo actual. Los fijos se cuentan completos. */
export function projectMonth(p: PnL, today: string): { factor: number; netSales: number; adCost: number; result: number } | null {
  if (!today.startsWith(p.month)) return null
  const [y, m] = p.month.split('-').map(Number)
  const dim = new Date(Date.UTC(y, m, 0)).getUTCDate()
  const elapsed = Math.max(1, Number(today.slice(8, 10)) - 0.5)
  const factor = dim / elapsed
  const variable = p.profitAfterAds
  return {
    factor,
    netSales: p.sales.netSales * factor,
    adCost: (p.ads.spend + p.adTax) * factor,
    result: variable * factor - p.fixedTotal - p.extraTotal,
  }
}
