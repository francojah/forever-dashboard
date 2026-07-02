/**
 * sync-meta.js — Script de sincronización diaria con Meta Ads API
 *
 * Se ejecuta automáticamente via GitHub Actions cada día a las 7am AR.
 * También podés correrlo manualmente: node scripts/sync-meta.js
 *
 * Requiere en .env.local (o variables de entorno en GitHub Secrets):
 *   META_ACCESS_TOKEN, META_ACCOUNT_ID, SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY
 * Opcional:
 *   SYNC_ALERT_WEBHOOK  → URL (Slack/Discord/genérica) para avisar si el sync falla
 *   META_API_VERSION, BREAKEVEN_CPA, ROAS_MIN, ALERT_MIN_SPEND
 *
 * Mejoras clave vs versión anterior:
 *   • Retry con backoff exponencial + timeout en cada request a Meta
 *   • Paginación por cursor (no se pierden entidades en cuentas grandes)
 *   • Notificación automática si el sync falla (SYNC_ALERT_WEBHOOK)
 *   • Registro de cada corrida en la tabla sync_runs (health/observabilidad)
 *   • Parser de insights extraído a scripts/lib/parse-insights.js (testeable)
 */

const https = require('https')
const { createClient } = require('@supabase/supabase-js')

require('dotenv').config({ path: '.env.local' })

const cfg = require('./lib/config')
const { parseInsights } = require('./lib/parse-insights')

const META_TOKEN = process.env.META_ACCESS_TOKEN
const ACCOUNT_ID = cfg.META_ACCOUNT_ID
const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL
const SUPABASE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY
const META_API = cfg.META_API_BASE
const ALERT_WEBHOOK = process.env.SYNC_ALERT_WEBHOOK

if (!META_TOKEN || !SUPABASE_URL || !SUPABASE_KEY) {
  console.error('❌ Faltan variables de entorno. Revisá .env.local')
  process.exit(1)
}

const supabase = createClient(SUPABASE_URL, SUPABASE_KEY)

// ── HTTP con timeout ───────────────────────────────────────────
function httpGet(url, timeoutMs = 30000) {
  return new Promise((resolve, reject) => {
    const req = https.get(url, (res) => {
      let data = ''
      res.on('data', (chunk) => (data += chunk))
      res.on('end', () => {
        try {
          resolve({ status: res.statusCode, json: JSON.parse(data) })
        } catch (e) {
          reject(new Error(`Respuesta no-JSON de Meta (status ${res.statusCode})`))
        }
      })
    })
    req.on('error', reject)
    req.setTimeout(timeoutMs, () => {
      req.destroy(new Error(`Timeout tras ${timeoutMs}ms`))
    })
  })
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms))

// ── Fetch a Meta con retry + backoff exponencial ───────────────
// Reintenta ante errores de red, 5xx, y rate-limit (código 4/17/613/80004).
const RETRYABLE_META_CODES = [1, 2, 4, 17, 32, 613, 80000, 80004]

async function fetchMeta(path, { retries = 4, baseDelay = 1500 } = {}) {
  const sep = path.includes('?') ? '&' : '?'
  const url = `${META_API}/${path}${sep}access_token=${META_TOKEN}`
  let lastErr
  for (let attempt = 0; attempt <= retries; attempt++) {
    try {
      const { status, json } = await httpGet(url)
      if (json && json.error) {
        const code = json.error.code
        const retryable = status >= 500 || RETRYABLE_META_CODES.includes(code)
        if (retryable && attempt < retries) {
          const delay = baseDelay * Math.pow(2, attempt)
          console.warn(`  ⏳ Meta error ${code} (${json.error.message}). Reintento en ${delay}ms...`)
          await sleep(delay)
          continue
        }
        throw new Error(`Meta API: ${json.error.message} (code ${code})`)
      }
      return json
    } catch (err) {
      lastErr = err
      if (attempt < retries) {
        const delay = baseDelay * Math.pow(2, attempt)
        console.warn(`  ⏳ ${err.message}. Reintento en ${delay}ms...`)
        await sleep(delay)
        continue
      }
    }
  }
  throw lastErr
}

// ── Fetch con paginación por cursor ────────────────────────────
async function fetchAllPages(path, maxPages = 20) {
  let results = []
  let next = path
  let page = 0
  while (next && page < maxPages) {
    const res = await fetchMeta(next)
    if (res.data) results = results.concat(res.data)
    const nextUrl = res.paging && res.paging.next
    if (nextUrl) {
      // La URL de "next" ya trae host/versión/token → la usamos relativa a META_API
      next = nextUrl.replace(`${META_API}/`, '')
      // sacamos el access_token que ya volveremos a agregar en fetchMeta
      next = next.replace(/([?&])access_token=[^&]+/, '$1').replace(/[?&]$/, '')
    } else {
      next = null
    }
    page++
  }
  return results
}

const INSIGHT_FIELDS =
  'spend,impressions,clicks,ctr,frequency,actions,purchase_roas,video_play_actions,video_p50_watched_actions'

async function fetchCampaigns(preset = 'last_7d') {
  const fields = `id,name,status,objective,insights.date_preset(${preset}){${INSIGHT_FIELDS}}`
  const data = await fetchAllPages(`${ACCOUNT_ID}/campaigns?fields=${fields}&limit=100`)
  return data.map((c) => ({
    id: c.id,
    name: c.name,
    status: c.status,
    objective: c.objective,
    ...parseInsights(c),
  }))
}

async function fetchAdsets(preset = 'last_7d') {
  const fields = `id,name,status,campaign_id,daily_budget,optimization_goal,stop_time,insights.date_preset(${preset}){${INSIGHT_FIELDS}}`
  const data = await fetchAllPages(`${ACCOUNT_ID}/adsets?fields=${fields}&limit=100`)
  return data.map((s) => ({
    id: s.id,
    name: s.name,
    status: s.status,
    campaign_id: s.campaign_id,
    daily_budget: s.daily_budget ? parseInt(s.daily_budget, 10) / 100 : null,
    optimization_goal: s.optimization_goal,
    stop_time: s.stop_time || null,
    ...parseInsights(s),
  }))
}

async function fetchAds(preset = 'last_7d') {
  const fields = `id,name,status,adset_id,insights.date_preset(${preset}){${INSIGHT_FIELDS}}`
  const data = await fetchAllPages(`${ACCOUNT_ID}/ads?fields=${fields}&limit=200`)
  return data.map((a) => ({
    id: a.id,
    name: a.name,
    status: a.status,
    adset_id: a.adset_id,
    ...parseInsights(a),
  }))
}

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
  const activeAdsets = adsets.filter((s) => s.status === 'ACTIVE')
  const totalSpend = adsets.reduce((sum, s) => sum + (s.spend || 0), 0)
  const totalBudget = activeAdsets.reduce((sum, s) => sum + (s.daily_budget || 0), 0)

  const convAdsets = adsets.filter((s) => s.optimization_goal === 'OFFSITE_CONVERSIONS')
  const convSpend = convAdsets.reduce((sum, s) => sum + (s.spend || 0), 0)
  const totalPurchases = convAdsets.reduce((sum, s) => sum + (s.results || 0), 0)

  const blendedCPA = totalPurchases > 0 ? convSpend / totalPurchases : null

  const roasAdsets = convAdsets.filter((s) => s.roas && s.spend)
  const weightedRoas =
    roasAdsets.length > 0
      ? roasAdsets.reduce((sum, s) => sum + s.roas * s.spend, 0) /
        roasAdsets.reduce((sum, s) => sum + s.spend, 0)
      : null

  const alerts = []
  const BREAKEVEN_CPA = cfg.DEFAULT_BREAKEVEN_CPA
  const ROAS_MIN = cfg.DEFAULT_ROAS_MIN
  const MIN_SPEND = cfg.ALERT_MIN_SPEND

  adsets.forEach((s) => {
    if (s.status !== 'ACTIVE') return
    if (s.cost_per_result && s.optimization_goal === 'OFFSITE_CONVERSIONS') {
      if (s.cost_per_result > BREAKEVEN_CPA) {
        alerts.push({
          type: 'cpa_exceeded',
          entity_type: 'adset',
          entity_id: s.id,
          entity_name: s.name,
          message: `CPA $${Math.round(s.cost_per_result).toLocaleString(cfg.LOCALE)} supera el breakeven de $${BREAKEVEN_CPA.toLocaleString(cfg.LOCALE)}`,
          severity: s.cost_per_result > BREAKEVEN_CPA * 1.5 ? 'danger' : 'warning',
          threshold: BREAKEVEN_CPA,
          actual_value: s.cost_per_result,
        })
      }
    }
    if (s.roas && s.roas < ROAS_MIN && s.spend > MIN_SPEND) {
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

// ── Notificación de fallo ──────────────────────────────────────
async function notifyFailure(message) {
  if (!ALERT_WEBHOOK) return
  try {
    const body = JSON.stringify({ text: `🚨 [Forever Ads] Sync Meta FALLÓ: ${message}` })
    await new Promise((resolve, reject) => {
      const url = new URL(ALERT_WEBHOOK)
      const req = https.request(
        url,
        { method: 'POST', headers: { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(body) } },
        (res) => {
          res.on('data', () => {})
          res.on('end', resolve)
        }
      )
      req.on('error', reject)
      req.setTimeout(10000, () => req.destroy(new Error('webhook timeout')))
      req.write(body)
      req.end()
    })
  } catch (e) {
    console.warn('  ⚠️ No se pudo enviar la notificación de fallo:', e.message)
  }
}

// ── Popular metrics_daily (tabla plana para series temporales) ─
// Escribe 1 fila por entidad (campaign/adset/ad) para el día, con period='day'.
// Idempotente: upsert por (brand_id, metric_date, period, entity_type, entity_id).
async function upsertMetricsDaily(date, preset) {
  if (!preset) return 0
  const rows = []
  const push = (entity_type, e, extra = {}) => {
    rows.push({
      brand_id: null, // legacy mono-marca; se completa en el backfill por marca
      metric_date: date,
      period: 'day',
      entity_type,
      entity_id: e.id,
      entity_name: e.name || null,
      status: e.status || null,
      spend: e.spend,
      impressions: e.impressions ?? null,
      clicks: e.clicks ?? null,
      ctr: e.ctr,
      frequency: e.frequency ?? null,
      results: e.results,
      cost_per_result: e.cost_per_result,
      roas: e.roas,
      hook_rate: e.hook_rate ?? null,
      view_rate: e.view_rate ?? null,
      daily_budget: e.daily_budget ?? null,
      ...extra,
    })
  }
  preset.campaigns.forEach((c) => push('campaign', c))
  preset.adsets.forEach((s) => push('adset', s, { campaign_id: s.campaign_id }))
  preset.ads.forEach((a) => push('ad', a, { adset_id: a.adset_id }))

  try {
    const { error } = await supabase
      .from('metrics_daily')
      .upsert(rows, { onConflict: 'brand_id,metric_date,period,entity_type,entity_id' })
    if (error) throw error
    return rows.length
  } catch (e) {
    // La tabla puede no existir todavía (migración pendiente); no bloqueamos el sync.
    console.warn('  ⚠️ No se pudo popular metrics_daily:', e.message)
    return 0
  }
}

// ── Log de la corrida (health/observabilidad) ──────────────────
async function logRun(run) {
  try {
    await supabase.from('sync_runs').insert(run)
  } catch (e) {
    // La tabla puede no existir todavía; no bloqueamos el sync por eso.
    console.warn('  ⚠️ No se pudo registrar la corrida en sync_runs:', e.message)
  }
}

// ── Main ───────────────────────────────────────────────────────
async function main() {
  const startedAt = Date.now()
  const today = new Date().toISOString().split('T')[0]
  console.log(`\n🔄 Sincronizando Meta Ads — ${today}`)

  try {
    console.log('  📊 Fetching last_7d (principal)...')
    const { campaigns, adsets, ads, summary } = await fetchPreset('last_7d')
    console.log(`  ✅ ${campaigns.length} campañas · ${adsets.length} ad sets · ${ads.length} anuncios`)
    console.log(`  💰 Gasto 7d: $${summary.total_spend_7d.toLocaleString(cfg.LOCALE)} ${cfg.CURRENCY}`)
    console.log(`  🛒 Compras: ${summary.total_purchases_7d}`)
    console.log(`  📈 ROAS blend: ${summary.blended_roas || 'N/A'}x`)

    const periods = { last_7d: { campaigns, adsets, ads, summary } }
    for (const preset of ['today', 'yesterday', 'last_30d']) {
      console.log(`  📊 Fetching ${preset}...`)
      try {
        periods[preset] = await fetchPreset(preset)
      } catch (e) {
        console.warn(`  ⚠️ No se pudo obtener ${preset}:`, e.message)
        periods[preset] = null
      }
    }

    console.log('  💾 Guardando en Supabase...')
    const { error } = await supabase
      .from('meta_snapshots')
      .upsert({ snapshot_date: today, campaigns, adsets, ads, summary, periods }, { onConflict: 'snapshot_date' })
    if (error) throw error

    if (summary.alerts.length > 0) {
      console.log(`  🚨 ${summary.alerts.length} alertas generadas`)
      const { error: alertError } = await supabase
        .from('alerts')
        .insert(summary.alerts.map((a) => ({ ...a, created_at: new Date().toISOString() })))
      if (alertError) console.warn('  ⚠️ No se pudieron guardar alertas:', alertError.message)
    }

    // Popular tabla plana para series temporales (usa el preset del día).
    const dailyPreset = periods.today || { campaigns, adsets, ads }
    const nRows = await upsertMetricsDaily(today, dailyPreset)
    if (nRows) console.log(`  📈 metrics_daily: ${nRows} filas actualizadas`)

    const durationMs = Date.now() - startedAt
    await logRun({
      source: 'meta',
      status: 'success',
      snapshot_date: today,
      duration_ms: durationMs,
      details: {
        campaigns: campaigns.length,
        adsets: adsets.length,
        ads: ads.length,
        spend_7d: summary.total_spend_7d,
        alerts: summary.alerts.length,
      },
    })

    console.log(`\n✅ Sync completado exitosamente — ${today} (${(durationMs / 1000).toFixed(1)}s)\n`)
  } catch (err) {
    console.error('\n❌ Error en sync:', err.message)
    await logRun({
      source: 'meta',
      status: 'error',
      snapshot_date: today,
      duration_ms: Date.now() - startedAt,
      error: err.message,
    })
    await notifyFailure(err.message)
    process.exit(1)
  }
}

main()
