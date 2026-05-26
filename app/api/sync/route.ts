import { NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

const META_TOKEN   = process.env.META_ACCESS_TOKEN!
const ACCOUNT_ID   = process.env.META_ACCOUNT_ID || 'act_1614288152915913'
const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL!
const SUPABASE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY!
const META_API     = 'https://graph.facebook.com/v21.0'

const PURCHASE_TYPES = ['omni_purchase', 'purchase', 'offsite_conversion.fb_pixel_purchase']
const INSIGHT_FIELDS = 'spend,impressions,clicks,ctr,actions,purchase_roas'
const BREAKEVEN_CPA  = 17500
const ROAS_MIN       = 2.86

// ── Helpers ──────────────────────────────────────────────────────
function fmt(str: string | null | undefined): number | null {
  const n = parseFloat(str ?? '')
  return isNaN(n) ? null : n
}

function findAction(arr: { action_type: string; value: string }[] | null, types: string[]): number | null {
  if (!arr) return null
  const found = arr.find(a => types.includes(a.action_type))
  return found ? parseFloat(found.value) : null
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function parseInsights(entity: any) {
  const i = entity.insights?.data?.[0] || {}
  const spend   = fmt(i.spend)
  const results = findAction(i.actions, PURCHASE_TYPES)
  return {
    spend,
    roas:            findAction(i.purchase_roas, PURCHASE_TYPES),
    results,
    cost_per_result: (spend && results && results > 0) ? parseFloat((spend / results).toFixed(2)) : null,
    impressions:     parseInt(i.impressions || '0'),
    clicks:          parseInt(i.clicks || '0'),
    ctr:             fmt(i.ctr),
  }
}

async function fetchMeta(path: string) {
  const url = `${META_API}/${path}&access_token=${META_TOKEN}`
  const res = await fetch(url, { next: { revalidate: 0 } })
  return res.json()
}

async function fetchCampaigns(preset: string) {
  const fields = `id,name,status,objective,insights.date_preset(${preset}){${INSIGHT_FIELDS}}`
  const res = await fetchMeta(`${ACCOUNT_ID}/campaigns?fields=${fields}&limit=50`)
  if (res.error) throw new Error(`Meta campaigns [${preset}]: ${res.error.message}`)
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return (res.data || []).map((c: any) => ({ id: c.id, name: c.name, status: c.status, objective: c.objective, ...parseInsights(c) }))
}

async function fetchAdsets(preset: string) {
  const fields = `id,name,status,campaign_id,daily_budget,optimization_goal,stop_time,insights.date_preset(${preset}){${INSIGHT_FIELDS}}`
  const res = await fetchMeta(`${ACCOUNT_ID}/adsets?fields=${fields}&limit=100`)
  if (res.error) throw new Error(`Meta adsets [${preset}]: ${res.error.message}`)
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return (res.data || []).map((s: any) => ({
    id: s.id, name: s.name, status: s.status, campaign_id: s.campaign_id,
    daily_budget: s.daily_budget ? parseInt(s.daily_budget) / 100 : null,
    optimization_goal: s.optimization_goal, stop_time: s.stop_time || null,
    ...parseInsights(s),
  }))
}

async function fetchAds(preset: string) {
  const fields = `id,name,status,adset_id,insights.date_preset(${preset}){${INSIGHT_FIELDS}}`
  const res = await fetchMeta(`${ACCOUNT_ID}/ads?fields=${fields}&limit=200`)
  if (res.error) throw new Error(`Meta ads [${preset}]: ${res.error.message}`)
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return (res.data || []).map((a: any) => ({ id: a.id, name: a.name, status: a.status, adset_id: a.adset_id, ...parseInsights(a) }))
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function buildSummary(adsets: any[]) {
  const activeAdsets = adsets.filter((s: { status: string }) => s.status === 'ACTIVE')
  const totalSpend   = adsets.reduce((sum: number, s: { spend: number | null }) => sum + (s.spend || 0), 0)
  const totalBudget  = activeAdsets.reduce((sum: number, s: { daily_budget: number | null }) => sum + (s.daily_budget || 0), 0)

  const convAdsets    = adsets.filter((s: { optimization_goal: string }) => s.optimization_goal === 'OFFSITE_CONVERSIONS')
  const convSpend     = convAdsets.reduce((sum: number, s: { spend: number | null }) => sum + (s.spend || 0), 0)
  const totalPurchases = convAdsets.reduce((sum: number, s: { results: number | null }) => sum + (s.results || 0), 0)
  const blendedCPA    = totalPurchases > 0 ? convSpend / totalPurchases : null

  const roasAdsets   = convAdsets.filter((s: { roas: number | null; spend: number | null }) => s.roas && s.spend)
  const weightedRoas = roasAdsets.length > 0
    ? roasAdsets.reduce((sum: number, s: { roas: number; spend: number }) => sum + s.roas * s.spend, 0) /
      roasAdsets.reduce((sum: number, s: { spend: number }) => sum + s.spend, 0)
    : null

  const alerts: object[] = []
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  activeAdsets.forEach((s: any) => {
    if (s.cost_per_result && s.optimization_goal === 'OFFSITE_CONVERSIONS') {
      if (s.cost_per_result > BREAKEVEN_CPA) {
        alerts.push({
          type: 'cpa_exceeded', entity_type: 'adset', entity_id: s.id, entity_name: s.name,
          message: `CPA $${Math.round(s.cost_per_result).toLocaleString('es-AR')} supera el breakeven`,
          severity: s.cost_per_result > BREAKEVEN_CPA * 1.5 ? 'danger' : 'warning',
          threshold: BREAKEVEN_CPA, actual_value: s.cost_per_result,
        })
      }
    }
    if (s.roas && s.roas < ROAS_MIN && s.spend > 5000) {
      alerts.push({
        type: 'roas_drop', entity_type: 'adset', entity_id: s.id, entity_name: s.name,
        message: `ROAS ${s.roas.toFixed(2)}x por debajo del mínimo (${ROAS_MIN}x)`,
        severity: 'warning', threshold: ROAS_MIN, actual_value: s.roas,
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

async function fetchPreset(preset: string) {
  const [campaigns, adsets, ads] = await Promise.all([
    fetchCampaigns(preset),
    fetchAdsets(preset),
    fetchAds(preset),
  ])
  const summary = buildSummary(adsets)
  return { campaigns, adsets, ads, summary }
}

// ── Handler ───────────────────────────────────────────────────────
export async function POST() {
  if (!META_TOKEN || !SUPABASE_URL || !SUPABASE_KEY) {
    return NextResponse.json({ error: 'Faltan variables de entorno' }, { status: 500 })
  }

  try {
    const today = new Date().toISOString().split('T')[0]

    // Primary fetch (last_7d)
    const { campaigns, adsets, ads, summary } = await fetchPreset('last_7d')

    // Additional presets (best-effort, don't fail if one is slow)
    const periods: Record<string, object | null> = { last_7d: { campaigns, adsets, ads, summary } }
    await Promise.allSettled(
      ['today', 'yesterday', 'last_30d'].map(async preset => {
        try {
          periods[preset] = await fetchPreset(preset)
        } catch {
          periods[preset] = null
        }
      })
    )

    const supabase = createClient(SUPABASE_URL, SUPABASE_KEY)
    const { error } = await supabase
      .from('meta_snapshots')
      .upsert({
        snapshot_date: today,
        campaigns, adsets, ads, summary, periods,
        created_at: new Date().toISOString(), // always refresh timestamp on sync
      }, { onConflict: 'snapshot_date' })

    if (error) throw error

    // Save alerts
    if (summary.alerts.length > 0) {
      await supabase
        .from('alerts')
        .insert(summary.alerts.map((a: object) => ({ ...a, created_at: new Date().toISOString() })))
    }

    return NextResponse.json({
      ok: true,
      date: today,
      campaigns: campaigns.length,
      adsets: adsets.length,
      ads: ads.length,
      spend: summary.total_spend_7d,
      purchases: summary.total_purchases_7d,
      roas: summary.blended_roas,
    })
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'Error desconocido'
    return NextResponse.json({ error: msg }, { status: 500 })
  }
}
