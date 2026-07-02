/**
 * config.ts — Configuración central de la app.
 *
 * Objetivo: eliminar valores hardcodeados dispersos (account id, breakeven,
 * márgenes, moneda) y tener una única fuente de verdad. Los valores por marca
 * se leerán en el futuro desde la tabla `brands`; por ahora vienen de env con
 * fallback a los defaults de Forever Basics.
 *
 * IMPORTANTE: los defaults de breakeven/roas reflejan la estructura de costos
 * real de Forever Basics (merch $19.5K + envío $5.75K + TN 2.5% $1.44K +
 * packaging $350 ≈ $27K/orden; AOV $57.5K → margen 53%). El breakeven de CPA
 * es ~$30.5K, NO $17.5K (ese valor viejo quedó desactualizado en scripts).
 */

// ── Meta Ads ────────────────────────────────────────────────────
export const META_ACCOUNT_ID =
  process.env.META_ACCOUNT_ID || 'act_1614288152915913'
export const META_API_VERSION = process.env.META_API_VERSION || 'v21.0'
export const META_API_BASE = `https://graph.facebook.com/${META_API_VERSION}`

// ── Economía del negocio (defaults Forever Basics) ──────────────
// Se sobreescriben dinámicamente desde app_settings en Supabase.
export const DEFAULT_BREAKEVEN_CPA = Number(process.env.BREAKEVEN_CPA) || 30462
export const DEFAULT_ROAS_MIN = Number(process.env.ROAS_MIN) || 1.77 // 1 / 0.53 margen
export const DEFAULT_AOV = Number(process.env.AOV) || 57500
export const DEFAULT_MARGIN = Number(process.env.MARGIN) || 0.53

// ── Moneda / locale ─────────────────────────────────────────────
export const CURRENCY = process.env.CURRENCY || 'ARS'
export const LOCALE = process.env.LOCALE || 'es-AR'

// ── Umbrales de alertas ─────────────────────────────────────────
export const ALERT_MIN_SPEND = Number(process.env.ALERT_MIN_SPEND) || 5000

// ── Helpers de formato ──────────────────────────────────────────
export function formatMoney(n: number | null | undefined): string {
  if (n == null) return 'N/A'
  return '$' + Math.round(n).toLocaleString(LOCALE)
}

export function formatMoneyK(n: number | null | undefined): string {
  if (n == null) return 'N/A'
  return '$' + Math.round(n / 1000) + 'K'
}
