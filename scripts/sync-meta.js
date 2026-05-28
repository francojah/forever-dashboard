/**
 * sync-meta.js — Script de sincronización diaria con Meta Ads API
 *
 * Se ejecuta automáticamente via GitHub Actions cada día a las 7am AR.
 * También podés correrlo manualmente: node scripts/sync-meta.js
 *
 * Requiere en .env.local (o variables de entorno en GitHub Secrets):
 *   META_ACCESS_TOKEN, META_ACCOUNT_ID, SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY
 */

const https = require('https')
const { createClient } = require('@supabase/supabase-js')

// ── Cargar variables de entorno ────────────────────────────────
require('dotenv').config({ path: '.env.local' })

const META_TOKEN   = process.env.META_ACCESS_TOKEN
const ACCOUNT_ID   = process.env.META_ACCOUNT_ID   || 'act_1614288152915913'
const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL
const SUPABASE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY
const META_API     = 'https://graph.facebook.com/v21.0'

if (!META_TOKEN || !SUPABASE_URL || !SUPABASE_KEY) {
  console.error('❌ Faltan variables de entorno. Revisá .env.local')
  process.exit(1)
}

const supabase = createClient(SUPABASE_URL, SUPABASE_KEY)

// ── Helpers ────────────────────────────────────────────────────
function fetchMeta(path) {
  return new Promise((resolve, reject) => {
    const url = `${META_API}/${path}&access_token=${META_TOKEN}`
    https.get(url, (res) => {
      let data = ''
      res.on('data', (chunk) => data += chunk)
      res.on('end', () => {
        try { resolve(JSON.parse(data)) }
        catch (e) { reject(e) }
      })
    }).on('error', reject)
  })
}

function formatNumber(str) {
  const n = parseFloat(str)
  return isNaN(n) ? null : n
}

// ── Helper para parsear insights de Meta API ───────────────────
// Los campos de métricas vienen anidados en insights.data[0]
// purchase_roas, actions y cost_per_action son arrays de objetos {action_type, value}
const PURCHASE_TYPES = ['omni_purchase', 'purchase', 'offsite_conversion.fb_pixel_purchase']

function parseInsights(entity) {
  const i = entity.insights?.data?.[0] || {}
  const findAction = (arr, types) => {
    if (!arr) return null
    const found = arr.find(a => types.includes(a.action_type))
    return found ? parseFloat(found.value) : null
  }
  const VIDEO_VIEW = ['video_view']
  const spend      = formatNumber(i.spend)
  const results    = findAction(i.actions, PURCHASE_TYPES)
  const impr       = parseInt(i.impressions || '0')
  const videoPlays = findAction(i.video_play_actions, VIDEO_VIEW)
  const videoP50   = findAction(i.video_p50_watched_actions, VIDEO_VIEW)
  return {
    spend,
    roas:            findAction(i.purchase_roas, PURCHASE_TYPES),
    results,
    cost_per_result: (spend && results && results > 0) ? parseFloat((spend / results).toFixed(2)) : null,
    impressions:     impr,
    clicks:          parseInt(i.clicks || '0'),
    ctr:             formatNumber(i.ctr),
    video_plays:     videoPlays,
    video_p50:       videoP50,
    hook_rate:       (videoPlays && impr > 0) ? parseFloat((videoPlays / impr * 100).toFixed(1)) : null,
    view_rate:       (videoP50   && impr > 0) ? parseFloat((videoP50   / impr * 100).toFixed(1)) : null,
  }
}

const INSIGHT_FIELDS = 'spend,impressions,clicks,ctr,actions,purchase_roas,video_play_actions,video_p50_watched_actions'
const DATE_PRESETS = ['today', 'yesterday', 'last_7d', 'last_30d']

// ── Fetch campaigns for a given date_preset ────────────────────
async function fetchCampaigns(preset = 'last_7d') {
  const fields = `id,name,status,objective,insights.date_preset(${preset}){${INSIGHT_FIELDS}}`
  const res = await fetchMeta(`${ACCOUNT_ID}/campaigns?fields=${fields}&limit=50`)
  if (res.error) throw new Error(`Meta API campaigns [${preset}]: ${res.error.message}`)
  return (res.data || []).map(c => ({
    id: c.id,
    name: c.name,
    status: c.status,
    objective: c.objective,
    ...parseInsights(c),
  }))
}

// ── Fetch ad sets for a given date_preset ─────────────────────
async function fetchAdsets(preset = 'last_7d') {
  const fields = `id,name,status,campaign_id,daily_budget,optimization_goal,stop_time,insights.date_preset(${preset}){${INSIGHT_FIELDS}}`
  const res = await fetchMeta(`${ACCOUNT_ID}/adsets?fields=${fields}&limit=100`)
  if (res.error) throw new Error(`Meta API adsets [${preset}]: ${res.error.message}`)
  return (res.data || []).map(s => ({
    id: s.id,
    name: s.name,
    status: s.status,
    campaign_id: s.campaign_id,
    daily_budget: s.daily_budget ? parseInt(s.daily_budget) / 100 : null,
    optimization_goal: s.optimization_goal,
    stop_time: s.stop_time || null,
    ...parseInsights(s),
  }))
}

// ── Fetch ads for a given date_preset ─────────────────────────
async function fetchAds(preset = 'last_7d') {
  const fields = `id,name,status,adset_id,insights.date_preset(${preset}){${INSIGHT_FIELDS}}`
  const res = await fetchMeta(`${ACCOUNT_ID}/ads?fields=${fields}&limit=200`)
  if (res.error) throw new Error(`Meta API ads [${preset}]: ${res.error.message}`)
  return (res.data || []).map(a => ({
    id: a.id,
    name: a.name,
    status: a.status,
    adset_id: a.adset_id,
    ...parseInsights(a),
  }))
}

// ── Fetch all data for one preset ─────────────────────────────
async function fetchPreset(preset) {
  const [campaigns, adsets, ads] = await Promise.all([
    fetchCampaigns(preset),
    fetchAdsets(preset),
    fetchAds(preset),
  ])
  const summary = buildSummary(campaigns, adsets, ads)
  return { campaigns, adsets, ads, summary }
}

// ── Calcular resumen ───────────────────────────────────────────
function buildSummary(campaigns, adsets, ads) {
  const activeAdsets = adsets.filter(s => s.status === 'ACTIVE')
  const totalSpend = adsets.reduce((sum, s) => sum + (s.spend || 0), 0)
  const totalBudget = activeAdsets.reduce((sum, s) => sum + (s.daily_budget || 0), 0)

  const convAdsets = adsets.filter(s => s.optimization_goal === 'OFFSITE_CONVERSIONS')
  const convSpend = convAdsets.reduce((sum, s) => sum + (s.spend || 0), 0)
  const totalPurchases = convAdsets.reduce((sum, s) => sum + (s.results || 0), 0)

  const blendedCPA = totalPurchases > 0 ? convSpend / totalPurchases : null

  // Weighted blended ROAS
  const roasAdsets = convAdsets.filter(s => s.roas && s.spend)
  const weightedRoas = roasAdsets.length > 0
    ? roasAdsets.reduce((sum, s) => sum + s.roas * s.spend, 0) /
      roasAdsets.reduce((sum, s) => sum + s.spend, 0)
    : null

  // Alertas automáticas
  const alerts = []
  const BREAKEVEN_CPA = 17500
  const ROAS_MIN = 2.86

  adsets.forEach(s => {
    if (s.status !== 'ACTIVE') return
    if (s.cost_per_result && s.optimization_goal === 'OFFSITE_CONVERSIONS') {
      if (s.cost_per_result > BREAKEVEN_CPA) {
        alerts.push({
          type: 'cpa_exceeded',
          entity_type: 'adset',
          entity_id: s.id,
          entity_name: s.name,
          message: `CPA $${Math.round(s.cost_per_result).toLocaleString('es-AR')} supera el breakeven de $${BREAKEVEN_CPA.toLocaleString('es-AR')}`,
          severity: s.cost_per_result > BREAKEVEN_CPA * 1.5 ? 'danger' : 'warning',
          threshold: BREAKEVEN_CPA,
          actual_value: s.cost_per_result,
        })
      }
    }
    if (s.roas && s.roas < ROAS_MIN && s.spend > 5000) {
      alerts.push({
        type: 'roas_drop',
        entity_type: 'adset',
        entity_id: s.id,
        entity_name: s.name,
        message: `ROAS ${s.roas.toFixed(2)}x está por debajo del mínimo rentable (${ROAS_MIN}x)`,
        severity: 'warning',
        threshold: ROAS_MIN,
        actual_value: s.roas,
      })
    }
  })

  return {
    total_spend_7d: Math.round(totalSpend),
    daily_budget_active: Math.round(totalBudget),
    total_purchases_7d: totalPurchases,
    blended_cpa: blendedCPA ? Math.round(blendedCPA) : null,
    blended_roas: weightedRoas ? parseFloat(weightedRoas.toFixed(2)) : null,
    conversion_spend_7d: Math.round(convSpend),
    active_adsets: activeAdsets.length,
    alerts,
  }
}

// ── Main ───────────────────────────────────────────────────────
async function main() {
  const today = new Date().toISOString().split('T')[0]
  console.log(`\n🔄 Sincronizando Meta Ads — ${today}`)

  try {
    // Fetch primary dataset (last_7d) for backward compat
    console.log('  📊 Fetching last_7d (principal)...')
    const { campaigns, adsets, ads, summary } = await fetchPreset('last_7d')
    console.log(`  ✅ ${campaigns.length} campañas · ${adsets.length} ad sets · ${ads.length} anuncios`)
    console.log(`  💰 Gasto 7d: $${summary.total_spend_7d.toLocaleString('es-AR')} ARS`)
    console.log(`  🛒 Compras: ${summary.total_purchases_7d}`)
    console.log(`  📈 ROAS blend: ${summary.blended_roas || 'N/A'}x`)

    // Fetch all other presets
    const periods = { last_7d: { campaigns, adsets, ads, summary } }
    for (const preset of ['today', 'yesterday', 'last_30d']) {
      console.log(`  📊 Fetching ${preset}...`)
      try {
        periods[preset] = await fetchPreset(preset)
        const s = periods[preset].summary
        console.log(`  ✅ ${preset}: gasto $${s.total_spend_7d.toLocaleString('es-AR')} · compras ${s.total_purchases_7d}`)
      } catch (e) {
        console.warn(`  ⚠️ No se pudo obtener ${preset}:`, e.message)
        periods[preset] = null
      }
    }

    // Guardar snapshot en Supabase
    console.log('  💾 Guardando en Supabase...')
    const { error } = await supabase
      .from('meta_snapshots')
      .upsert({
        snapshot_date: today,
        campaigns,
        adsets,
        ads,
        summary,
        periods,
      }, { onConflict: 'snapshot_date' })

    if (error) throw error

    // Insertar alertas nuevas
    if (summary.alerts.length > 0) {
      console.log(`  🚨 ${summary.alerts.length} alertas generadas`)
      const { error: alertError } = await supabase
        .from('alerts')
        .insert(summary.alerts.map(a => ({ ...a, created_at: new Date().toISOString() })))
      if (alertError) console.warn('  ⚠️ No se pudieron guardar alertas:', alertError.message)
    }

    console.log(`\n✅ Sync completado exitosamente — ${today}\n`)

  } catch (err) {
    console.error('\n❌ Error en sync:', err.message)
    process.exit(1)
  }
}

main()
