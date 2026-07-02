/**
 * config.js — Config central para los scripts Node (CommonJS).
 * Espejo de lib/config.ts para el runtime del cron / CLI.
 */
const META_API_VERSION = process.env.META_API_VERSION || 'v21.0'

module.exports = {
  META_ACCOUNT_ID: process.env.META_ACCOUNT_ID || 'act_1614288152915913',
  META_API_VERSION,
  META_API_BASE: `https://graph.facebook.com/${META_API_VERSION}`,
  DEFAULT_BREAKEVEN_CPA: Number(process.env.BREAKEVEN_CPA) || 30462,
  DEFAULT_ROAS_MIN: Number(process.env.ROAS_MIN) || 1.77,
  ALERT_MIN_SPEND: Number(process.env.ALERT_MIN_SPEND) || 5000,
  CURRENCY: process.env.CURRENCY || 'ARS',
  LOCALE: process.env.LOCALE || 'es-AR',
}
