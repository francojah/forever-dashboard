/**
 * parse-insights.js — Parseo de insights de Meta Ads API (CommonJS, testeable).
 *
 * Extraído de sync-meta.js para poder testearlo en aislamiento. Es la lógica
 * más frágil de la app: si Meta cambia un action_type, las métricas se rompen
 * en silencio. Los tests en scripts/__tests__ cubren estos casos.
 */

const PURCHASE_TYPES = [
  'omni_purchase',
  'purchase',
  'offsite_conversion.fb_pixel_purchase',
]
const VIDEO_VIEW = ['video_view']

function formatNumber(str) {
  const n = parseFloat(str)
  return isNaN(n) ? null : n
}

function findAction(arr, types) {
  if (!arr) return null
  const found = arr.find((a) => types.includes(a.action_type))
  return found ? parseFloat(found.value) : null
}

function parseInsights(entity) {
  const i = (entity.insights && entity.insights.data && entity.insights.data[0]) || {}
  const spend = formatNumber(i.spend)
  const results = findAction(i.actions, PURCHASE_TYPES)
  const impr = parseInt(i.impressions || '0', 10)
  const videoPlays = findAction(i.video_play_actions, VIDEO_VIEW)
  const videoP50 = findAction(i.video_p50_watched_actions, VIDEO_VIEW)
  return {
    spend,
    roas: findAction(i.purchase_roas, PURCHASE_TYPES),
    results,
    cost_per_result:
      spend && results && results > 0
        ? parseFloat((spend / results).toFixed(2))
        : null,
    impressions: impr,
    clicks: parseInt(i.clicks || '0', 10),
    ctr: formatNumber(i.ctr),
    video_plays: videoPlays,
    video_p50: videoP50,
    hook_rate:
      videoPlays && impr > 0
        ? parseFloat(((videoPlays / impr) * 100).toFixed(1))
        : null,
    view_rate:
      videoP50 && impr > 0
        ? parseFloat(((videoP50 / impr) * 100).toFixed(1))
        : null,
    frequency: formatNumber(i.frequency),
  }
}

module.exports = { parseInsights, formatNumber, findAction, PURCHASE_TYPES }
