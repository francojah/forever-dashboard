/**
 * Configuración del portal de cambios (/cambios).
 * Todo overrideable por env sin tocar código.
 */
const num = (v: string | undefined, d: number | null): number | null => {
  if (v === undefined || v === '') return d
  const n = Number(v)
  return Number.isFinite(n) ? n : d
}

export const CAMBIOS = {
  brandName: process.env.CAMBIOS_BRAND_NAME || 'Forever Basics',
  /** Alias de Mercado Pago donde transfieren el envío */
  alias: process.env.CAMBIOS_ALIAS || 'foreverbasics',
  /** CVU de la cuenta de Mercado Pago (para transferir desde cualquier banco) */
  cvu: process.env.CAMBIOS_CVU || '0000003100148013514201',
  /** Días desde que reciben el pedido para pedir el cambio */
  windowDays: num(process.env.CAMBIOS_WINDOW_DAYS, 10) as number,
  /** Margen de tránsito (días) sumado a shipped_at, porque TN no informa la fecha de entrega */
  transitMarginDays: {
    caba: 2,
    moto_gba: 2,
    retiro: 4,
    correo: num(process.env.CAMBIOS_CORREO_TRANSIT_DAYS, 7) as number,
    otro: 7,
  } as Record<string, number>,
  /** Costo fijo de la moto en CABA (retira y entrega en un viaje) */
  cabaFee: num(process.env.CAMBIOS_CABA_FEE, 5000),
  /** Moto en GBA: si se define, pisa el valor; por defecto se usa lo que pagó de envío en la orden original */
  motoGbaFee: num(process.env.CAMBIOS_MOTO_GBA_FEE, null),
  /** Correo Argentino: costo fijo del cambio, sin importar el destino */
  correoFee: num(process.env.CAMBIOS_CORREO_FEE, 9000),
  /** Punto de retiro: el cliente se acerca al mismo punto, sin costo */
  retiroFee: num(process.env.CAMBIOS_RETIRO_FEE, 0),
  /** Una solicitud sin pago reserva stock durante estas horas */
  pendingHoldHours: num(process.env.CAMBIOS_PENDING_HOLD_HOURS, 48) as number,
  /** Dirección a donde mandan la prenda por correo */
  returnAddress:
    process.env.CAMBIOS_RETURN_ADDRESS ||
    'DANIELA LOMBARDI - FOREVER — Av. Patricias Argentinas 4301, Lote 120, Garín, Buenos Aires (CP 1619)',
  whatsapp: process.env.CAMBIOS_WHATSAPP || '5491144799068',
  /** IDs de producto que NO admiten cambio, separados por coma (además del filtro por nombre) */
  excludedProductIds: (process.env.CAMBIOS_EXCLUDED_PRODUCT_IDS || '')
    .split(',').map((s) => s.trim()).filter(Boolean),
  /** Ropa interior y accesorios: no se cambian. Se filtra por nombre para cubrir productos nuevos. */
  excludedNamePattern: new RegExp(process.env.CAMBIOS_EXCLUDED_NAME_REGEX || 'boxer|colaless|bralette|iconic set|bolsa', 'i'),
  appUrl: (process.env.NEXT_PUBLIC_APP_URL || 'https://forever-dashboard.vercel.app').replace(/\/$/, ''),
  /** Dominio público del portal (links que recibe el cliente). Ej: https://cambios.foreverbasics.com.ar */
  publicUrl: (process.env.CAMBIOS_PUBLIC_URL || process.env.NEXT_PUBLIC_APP_URL || 'https://forever-dashboard.vercel.app').replace(/\/$/, ''),
  /** Dejar una nota en la venta original de Tiendanube cuando se genera o cancela un cambio ("off" lo apaga) */
  orderNote: (process.env.CAMBIOS_TN_NOTE || 'on').toLowerCase() !== 'off',
  /** Tienda (para que el cliente pueda volver) */
  storeUrl: (process.env.CAMBIOS_STORE_URL || 'https://www.foreverbasics.com.ar').replace(/\/$/, ''),
  /**
   * Email al cliente por SMTP (Zoho Mail). Obligatorio para operar: sin ZOHO_SMTP_PASS no sale ningún mail.
   * ZOHO_SMTP_PASS = contraseña de aplicación generada en Zoho (no la contraseña de la cuenta).
   */
  smtp: {
    host: process.env.ZOHO_SMTP_HOST || 'smtp.zoho.com',
    port: Number(process.env.ZOHO_SMTP_PORT) || 465,
    user: process.env.ZOHO_SMTP_USER || 'hola@foreverbasics.com.ar',
    pass: process.env.ZOHO_SMTP_PASS || '',
  },
  /** Alternativa: Resend (solo si no hay SMTP configurado) */
  resendKey: process.env.RESEND_API_KEY || '',
  fromEmail: process.env.CAMBIOS_FROM_EMAIL || 'Forever Basics <hola@foreverbasics.com.ar>',
  replyTo: process.env.CAMBIOS_REPLY_TO || 'hola@foreverbasics.com.ar',
}

export const REASONS = [
  { id: 'grande', label: 'Me quedó grande' },
  { id: 'chica', label: 'Me quedó chica' },
  { id: 'color', label: 'Quiero otro color' },
  { id: 'modelo', label: 'Quiero otro modelo' },
  { id: 'falla', label: 'Vino con una falla' },
  { id: 'otro', label: 'Otro motivo (te atendemos por WhatsApp)' },
] as const

export const STATUS_LABEL: Record<string, string> = {
  pendiente_pago: 'Esperando tu transferencia',
  pago_confirmado: 'Pago confirmado',
  etiqueta_enviada: 'Etiqueta recibida',
  prenda_recibida: 'Recibimos tu prenda',
  despachado: 'Cambio enviado',
  revision: 'Lo estamos revisando',
  resuelto: 'Resuelto',
  cancelado: 'Cancelado',
}

export const ZONE_LABEL: Record<string, string> = {
  caba: 'CABA (moto)',
  moto_gba: 'GBA (moto)',
  correo: 'Correo Argentino',
  retiro: 'Punto de retiro',
  otro: 'Otro',
}

/** Estado tal como lo ve el cliente (depende de cómo viaja el cambio). */
export function statusLabel(status: string, zone: string): string {
  const correo = zone === 'correo' || zone === 'otro'
  if (status === 'pago_confirmado') {
    if (correo) return 'Pendiente de recibir etiqueta'
    if (zone === 'retiro') return 'Coordinando día y horario'
    return 'Pago confirmado · coordinando la moto'
  }
  if (status === 'etiqueta_enviada') return 'Etiqueta recibida · despachá tu prenda'
  if (status === 'despachado') return correo ? 'Cambio enviado' : zone === 'retiro' ? 'Cambio coordinado' : 'Moto coordinada'
  return STATUS_LABEL[status] ?? status
}

/** Provincias con el código que usa Correo Argentino */
export const PROVINCIAS: { code: string; name: string }[] = [
  { code: 'C', name: 'Ciudad Autónoma de Buenos Aires' }, { code: 'B', name: 'Buenos Aires' },
  { code: 'K', name: 'Catamarca' }, { code: 'H', name: 'Chaco' }, { code: 'U', name: 'Chubut' },
  { code: 'X', name: 'Córdoba' }, { code: 'W', name: 'Corrientes' }, { code: 'E', name: 'Entre Ríos' },
  { code: 'P', name: 'Formosa' }, { code: 'Y', name: 'Jujuy' }, { code: 'L', name: 'La Pampa' },
  { code: 'F', name: 'La Rioja' }, { code: 'M', name: 'Mendoza' }, { code: 'N', name: 'Misiones' },
  { code: 'Q', name: 'Neuquén' }, { code: 'R', name: 'Río Negro' }, { code: 'A', name: 'Salta' },
  { code: 'J', name: 'San Juan' }, { code: 'D', name: 'San Luis' }, { code: 'Z', name: 'Santa Cruz' },
  { code: 'S', name: 'Santa Fe' }, { code: 'G', name: 'Santiago del Estero' },
  { code: 'V', name: 'Tierra del Fuego' }, { code: 'T', name: 'Tucumán' },
]

const norm = (s: string) => s.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').trim()
export function provinceCode(name: string | null | undefined): string {
  const n = norm(name || '')
  if (!n) return ''
  if (/capital federal|ciudad autonoma|caba/.test(n)) return 'C'
  const hit = PROVINCIAS.find((p) => norm(p.name) === n) || PROVINCIAS.find((p) => p.code !== 'C' && n.includes(norm(p.name)))
  return hit ? hit.code : ''
}
