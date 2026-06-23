import { NextResponse } from 'next/server'
import { requireAuth } from '@/lib/auth'
import { createClient } from '@supabase/supabase-js'

const META_TOKEN   = process.env.META_ACCESS_TOKEN!
const ACCOUNT_ID   = process.env.META_ACCOUNT_ID || 'act_1614288152915913'
const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL!
const SUPABASE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY!
const META_API     = 'https://graph.facebook.com/v21.0'

const PURCHASE_TYPES = ['omni_purchase', 'purchase', 'offsite_conversion.fb_pixel_purchase']
const INSIGHT_FIELDS = 'spend,impressions,clicks,ctr,frequency,actions,purchase_roas,video_play_actions,video_p50_watched_actions'

// Default thresholds — overridden by app_settings in Supabase
// BREAKEVEN_CPA real Forever Basics: merch $19.5K + envío $5.75K + TN 2.5% $1.44K + packaging $350 = ~$27K/orden
// AOV $57.5K → margen 53% → BE_CPA = $57.5K − $27K = $30.5K
const DEFAULT_BREAKEVEN_CPA = 30462
const DEFAULT_ROAS_MIN      = 1.77  // 1 / 0.53 margen

// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function getThresholds(supabase: any) {
  try {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { data } = await supabase
      .from('app_settings')
      .select('breakeven_cpa, roas_min')
      .order('updated_at', { ascending: false })
      .limit(1)
      .single() as { data: { breakeven_cpa: number; roas_min: number } | null; error: unknown }
    if (data) {
      return {
        breakeven_cpa: Number(data.breakeven_cpa) || DEFAULT_BREAKEVEN_CPA,
        roas_min:      Number(data.roas_min)      || DEFAULT_ROAS_MIN,
      }
    }
  } catch { /* table may not exist yet */ }
  return { breakeven_cpa: DEFAULT_BREAKEVEN_CPA, roas_min: DEFAULT_ROAS_MIN }
}

// -- Helpers ------------------------------------------------------
function fmt(str: string | null | undefined): number | null {
  const n = parseFloat(str ?? '')
  return isNaN(n) ? null : n
}

function findAction(arr: { action_type: string; value: string }[] | null, types: string[]): number | null {
  if (!arr) return null
  const found = arr.find(a => types.includes(a.action_type))
  return found ? parseFloat(found.value) : null
}

const VIDEO_VIEW = ['video_view']

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function parseInsights(entity: any) {
  const i = entity.insights?.data?.[0] || {}
  const spend      = fmt(i.spend)
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
    ctr:             fmt(i.ctr),
    frequency:       fmt(i.frequency),
    video_plays:     videoPlays,
    video_p50:       videoP50,
    hook_rate:       (videoPlays && impr > 0) ? parseFloat((videoPlays / impr * 100).toFixed(1)) : null,
    view_rate:       (videoP50   && impr > 0) ? parseFloat((videoP50   / impr * 100).toFixed(1)) : null,
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
function buildSummary(adsets: any[], breakeven_cpa: number, roas_min: number) {
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
      if (s.cost_per_result > breakeven_cpa) {
        alerts.push({
          type: 'cpa_exceeded', entity_type: 'adset', entity_id: s.id, entity_name: s.name,
          message: 'CPA $' + Math.round(s.cost_per_result).toLocaleString('es-AR') + ' supera el breakeven',
          severity: s.cost_per_result > breakeven_cpa * 1.5 ? 'danger' : 'warning',
          threshold: breakeven_cpa, actual_value: s.cost_per_result,
        })
      }
    }
    if (s.roas && s.roas < roas_min && s.spend > 5000) {
      alerts.push({
        type: 'roas_drop', entity_type: 'adset', entity_id: s.id, entity_name: s.name,
        message: 'ROAS ' + s.roas.toFixed(2) + 'x por debajo del minimo (' + roas_min + 'x)',
        severity: 'warning', threshold: roas_min, actual_value: s.roas,
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

async function fetchPreset(preset: string, breakeven_cpa: number, roas_min: number) {
  const [campaigns, adsets, ads] = await Promise.all([
    fetchCampaigns(preset),
    fetchAdsets(preset),
    fetchAds(preset),
  ])
  const summary = buildSummary(adsets, breakeven_cpa, roas_min)
  return { campaigns, adsets, ads, summary }
}

// -- Handler ------------------------------------------------------
export async function POST() {
  const auth = await requireAuth()
  if (auth instanceof NextResponse) return auth

  if (!META_TOKEN || !SUPABASE_URL || !SUPABASE_KEY) {
    return NextResponse.json({ error: 'Faltan variables de entorno' }, { status: 500 })
  }

  try {
    const today = new Date().toISOString().split('T')[0]

    const supabase = createClient(SUPABASE_URL, SUPABASE_KEY)
    const { breakeven_cpa, roas_min } = await getThresholds(supabase)

    // Primary fetch (last_7d)
    const { campaigns, adsets, ads, summary } = await fetchPreset('last_7d', breakeven_cpa, roas_min)

    // Additional presets (best-effort, don't fail if one is slow)
    const periods: Record<string, object | null> = { last_7d: { campaigns, adsets, ads, summary } }
    await Promise.allSettled(
      ['today', 'yesterday', 'last_30d'].map(async preset => {
        try {
          periods[preset] = await fetchPreset(preset, breakeven_cpa, roas_min)
        } catch {
          periods[preset] = null
        }
      })
    )

    const { error } = await supabase
      .from('meta_snapshots')
      .upsert({
        snapshot_date: today,
        campaigns, adsets, ads, summary, periods,
        created_at: new Date().toISOString(),
      }, { onConflict: 'snapshot_date' })

    if (error) throw error

    // Save alerts -- deduplicated: skip alerts already fired today for same entity+type
    if (summary.alerts.length > 0) {
      const todayStart = new Date()
      todayStart.setHours(0, 0, 0, 0)
      const { data: existingAlerts } = await supabase
        .from('alerts')
        .select('entity_id, type')
        .gte('created_at', todayStart.toISOString())
      const existingKeys = new Set(
        (existingAlerts || []).map((a: { entity_id: string; type: string }) => a.entity_id + ':' + a.type)
      )
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const newAlerts = (summary.alerts as any[])
        .map((a: any) => ({ ...a, created_at: new Date().toISOString() }))
        .filter((a: any) => !existingKeys.has(a.entity_id + ':' + a.type))
      if (newAlerts.length > 0) {
        await supabase.from('alerts').insert(newAlerts)
      }
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
    const message = err instanceof Error ? err.message : 'Error desconocido'
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
