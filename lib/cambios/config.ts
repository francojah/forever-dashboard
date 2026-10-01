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
  /** Moto en GBA: null = a confirmar por el equipo */
  motoGbaFee: num(process.env.CAMBIOS_MOTO_GBA_FEE, null),
  /** Punto de retiro: null = a confirmar */
  retiroFee: num(process.env.CAMBIOS_RETIRO_FEE, null),
  /** Una solicitud sin pago reserva stock durante estas horas */
  pendingHoldHours: num(process.env.CAMBIOS_PENDING_HOLD_HOURS, 48) as number,
  /** Dirección a donde mandan la prenda por correo */
  returnAddress:
    process.env.CAMBIOS_RETURN_ADDRESS ||
    'Forever Basics — Av. Francisco Beiro 4916, CABA',
  whatsapp: process.env.CAMBIOS_WHATSAPP || '5491144799068',
  /** IDs de producto que NO admiten cambio (ej. ropa interior), separados por coma */
  excludedProductIds: (process.env.CAMBIOS_EXCLUDED_PRODUCT_IDS || '')
    .split(',').map((s) => s.trim()).filter(Boolean),
  appUrl: (process.env.NEXT_PUBLIC_APP_URL || 'https://forever-dashboard.vercel.app').replace(/\/$/, ''),
  /** Email (Resend). Sin RESEND_API_KEY no se envían mails y el panel ofrece WhatsApp. */
  resendKey: process.env.RESEND_API_KEY || '',
  fromEmail: process.env.CAMBIOS_FROM_EMAIL || 'Forever Basics <cambios@foreverbasics.com.ar>',
  replyTo: process.env.CAMBIOS_REPLY_TO || 'hola@foreverbasics.com.ar',
}

export const REASONS = [
  { id: 'grande', label: 'Me quedó grande' },
  { id: 'chica', label: 'Me quedó chica' },
  { id: 'color', label: 'Quiero otro color' },
  { id: 'falla', label: 'Vino con una falla' },
  { id: 'otro', label: 'Otro motivo' },
] as const

export const STATUS_LABEL: Record<string, string> = {
  pendiente_pago: 'Esperando la transferencia del envío',
  pago_confirmado: 'Pago confirmado',
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
