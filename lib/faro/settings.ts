/**
 * Parámetros de costos de un espacio de trabajo. Se guardan en workspaces.settings.
 * Los valores por defecto son genéricos (no de ninguna tienda en particular):
 * lo que falte configurar se marca como "estimado" en las pantallas.
 */

export type TaxRegime = 'monotributo' | 'responsable_inscripto' | 'otro'

export interface PaymentFee {
  /** Clave = método de pago de la orden (credit_card, debit_card, bank_transfer, ...) o '*' */
  method: string
  pct: number          // % sobre lo cobrado
  label?: string
}

import { EnhancementPrefs, normalizePrefs } from './enhancements'

export interface WorkspaceSettings {
  platform_fee_pct: number          // comisión de la plataforma (plan Tiendanube)
  payment_fees: PaymentFee[]        // comisiones de pasarela por método
  packaging_per_order: number       // ARS por orden
  iibb_pct: number                  // Ingresos Brutos sobre ventas netas
  tax_regime: TaxRegime
  ad_tax_pct: number                // % no recuperable que se suma a la inversión en anuncios
  cost_fallback_pct: number         // si un producto no tiene costo: % del precio de venta
  use_platform_cost: boolean        // usar el "costo" cargado en Tiendanube cuando exista
  configured: boolean               // terminó el onboarding de costos
  meta_enhancements: EnhancementPrefs // mejoras automáticas de Meta en anuncios nuevos
}

export const DEFAULT_SETTINGS: WorkspaceSettings = {
  platform_fee_pct: 0,
  payment_fees: [],
  packaging_per_order: 0,
  iibb_pct: 0,
  tax_regime: 'monotributo',
  ad_tax_pct: 21,
  cost_fallback_pct: 35,
  use_platform_cost: true,
  configured: false,
  meta_enhancements: normalizePrefs(null),
}

/** Sugerencias editables que se muestran en el onboarding. No se aplican solas. */
export const SUGGESTED_PAYMENT_FEES: PaymentFee[] = [
  { method: 'credit_card', pct: 6, label: 'Tarjeta de crédito' },
  { method: 'debit_card', pct: 3, label: 'Tarjeta de débito' },
  { method: 'account_money', pct: 6, label: 'Dinero en cuenta (Mercado Pago)' },
  { method: 'wallet', pct: 6, label: 'Billetera virtual' },
  { method: 'wire_transfer', pct: 0, label: 'Transferencia' },
  { method: 'bank_transfer', pct: 0, label: 'Transferencia' },
  { method: 'ticket', pct: 3, label: 'Efectivo / cupón' },
  { method: '*', pct: 4, label: 'Otros medios' },
]

export const PAYMENT_METHOD_LABELS: Record<string, string> = {
  credit_card: 'Tarjeta de crédito',
  debit_card: 'Tarjeta de débito',
  account_money: 'Dinero en cuenta',
  wallet: 'Billetera virtual',
  custom: 'Medio personalizado',
  bank_transfer: 'Transferencia',
  wire_transfer: 'Transferencia',
  ticket: 'Efectivo / cupón',
  cash: 'Efectivo',
  other: 'Otro',
  '*': 'Otros medios',
}

export function normalizeSettings(raw: unknown): WorkspaceSettings {
  const r = (raw && typeof raw === 'object' ? raw : {}) as Partial<WorkspaceSettings>
  const num = (v: unknown, d: number) => (typeof v === 'number' && isFinite(v) ? v : typeof v === 'string' && v.trim() !== '' && isFinite(Number(v)) ? Number(v) : d)
  return {
    platform_fee_pct: num(r.platform_fee_pct, DEFAULT_SETTINGS.platform_fee_pct),
    payment_fees: Array.isArray(r.payment_fees)
      ? r.payment_fees.filter((f) => f && typeof f.method === 'string').map((f) => ({ method: f.method, pct: num(f.pct, 0), label: f.label }))
      : [],
    packaging_per_order: num(r.packaging_per_order, DEFAULT_SETTINGS.packaging_per_order),
    iibb_pct: num(r.iibb_pct, DEFAULT_SETTINGS.iibb_pct),
    tax_regime: (['monotributo', 'responsable_inscripto', 'otro'] as const).includes(r.tax_regime as TaxRegime)
      ? (r.tax_regime as TaxRegime) : DEFAULT_SETTINGS.tax_regime,
    ad_tax_pct: num(r.ad_tax_pct, DEFAULT_SETTINGS.ad_tax_pct),
    cost_fallback_pct: num(r.cost_fallback_pct, DEFAULT_SETTINGS.cost_fallback_pct),
    use_platform_cost: typeof r.use_platform_cost === 'boolean' ? r.use_platform_cost : true,
    configured: !!r.configured,
    meta_enhancements: normalizePrefs(r.meta_enhancements),
  }
}

/** % de comisión para un método de pago dado. */
export function feePctFor(settings: WorkspaceSettings, method: string | null | undefined): { pct: number; known: boolean } {
  const m = (method || '').toLowerCase()
  const exact = settings.payment_fees.find((f) => f.method === m)
  if (exact) return { pct: exact.pct, known: true }
  const star = settings.payment_fees.find((f) => f.method === '*')
  if (star) return { pct: star.pct, known: true }
  return { pct: 0, known: false }
}
