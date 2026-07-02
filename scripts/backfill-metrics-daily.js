/**
 * backfill-metrics-daily.js — Popula metrics_daily desde los snapshots históricos.
 *
 * Recorre meta_snapshots y, para cada día, escribe filas planas (campaign/adset/ad)
 * en metrics_daily. Así las series temporales tienen historia desde el día 1 sin
 * esperar a que el cron acumule.
 *
 * Uso:  node scripts/backfill-metrics-daily.js
 * Requiere: NEXT_PUBLIC_SUPABASE_URL (o SUPABASE_URL) + SUPABASE_SERVICE_ROLE_KEY
 *
 * Idempotente: usa upsert por (brand_id, metric_date, period, entity_type, entity_id).
 * Prioriza el preset 'today' de cada snapshot (métrica real del día); si no existe,
 * cae al dataset principal (last_7d) etiquetado como period='last_7d'.
 */

const { createClient } = require('@supabase/supabase-js')
require('dotenv').config({ path: '.env.local' })

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL
const SUPABASE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY

if (!SUPABASE_URL || !SUPABASE_KEY) {
  console.error('❌ Faltan SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY')
  process.exit(1)
}

const supabase = createClient(SUPABASE_URL, SUPABASE_KEY)

function buildRows(date, preset, period) {
  const rows = []
  const push = (entity_type, e, extra = {}) => {
    rows.push({
      brand_id: null,
      metric_date: date,
      period,
      entity_type,
      entity_id: e.id,
      entity_name: e.name || null,
      status: e.status || null,
      spend: e.spend ?? null,
      impressions: e.impressions ?? null,
      clicks: e.clicks ?? null,
      ctr: e.ctr ?? null,
      frequency: e.frequency ?? null,
      results: e.results ?? null,
      cost_per_result: e.cost_per_result ?? null,
      roas: e.roas ?? null,
      hook_rate: e.hook_rate ?? null,
      view_rate: e.view_rate ?? null,
      daily_budget: e.daily_budget ?? null,
      ...extra,
    })
  }
  ;(preset.campaigns || []).forEach((c) => push('campaign', c))
  ;(preset.adsets || []).forEach((s) => push('adset', s, { campaign_id: s.campaign_id }))
  ;(preset.ads || []).forEach((a) => push('ad', a, { adset_id: a.adset_id }))
  return rows
}

async function main() {
  console.log('🔄 Backfill de metrics_daily desde meta_snapshots...')

  const { data: snapshots, error } = await supabase
    .from('meta_snapshots')
    .select('snapshot_date, campaigns, adsets, ads, periods')
    .order('snapshot_date', { ascending: true })

  if (error) {
    console.error('❌ No se pudieron leer snapshots:', error.message)
    process.exit(1)
  }
  if (!snapshots || !snapshots.length) {
    console.log('ℹ️ No hay snapshots para backfillear.')
    return
  }

  let totalRows = 0
  let daysDone = 0

  for (const snap of snapshots) {
    const today = snap.periods && snap.periods.today
    const usePreset = today || { campaigns: snap.campaigns, adsets: snap.adsets, ads: snap.ads }
    const period = today ? 'day' : 'last_7d'
    const rows = buildRows(snap.snapshot_date, usePreset, period)
    if (!rows.length) continue

    // Chunks de 500 para no exceder límites de payload
    for (let i = 0; i < rows.length; i += 500) {
      const chunk = rows.slice(i, i + 500)
      const { error: upErr } = await supabase
        .from('metrics_daily')
        .upsert(chunk, { onConflict: 'brand_id,metric_date,period,entity_type,entity_id' })
      if (upErr) {
        console.error(`  ❌ ${snap.snapshot_date}: ${upErr.message}`)
        break
      }
    }
    totalRows += rows.length
    daysDone++
    console.log(`  ✅ ${snap.snapshot_date} (${period}): ${rows.length} filas`)
  }

  console.log(`\n✅ Backfill completo: ${daysDone} días · ${totalRows} filas en metrics_daily\n`)
}

main().catch((e) => {
  console.error('❌ Error:', e.message)
  process.exit(1)
})
