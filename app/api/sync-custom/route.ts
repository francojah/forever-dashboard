import { NextResponse } from 'next/server'
import { createClient, SupabaseClient } from '@supabase/supabase-js'

const META_TOKEN = process.env.META_ACCESS_TOKEN!
const ACCOUNT_ID = process.env.META_ACCOUNT_ID || 'act_1614288152915913'
const META_API   = 'https://graph.facebook.com/v21.0'
const TN_API     = 'https://api.tiendanube.com/v1'

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL!
const SUPABASE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY!

const PURCHASE_TYPES = ['omni_purchase', 'purchase', 'offsite_conversion.fb_pixel_purchase']
const INSIGHT_FIELDS = 'spend,impressions,clicks,ctr,actions,purchase_roas'

// ── Settings dinámicos desde Supabase ──────────────────────────────
async function getThresholds(supabase: SupabaseClient) {
  try {
    const { data } = await supabase.from('app_settings').select('key, value')
    const map: Record<string, number> = {}
    ;(data || []).forEach(({ key, value }: { key: string; value: unknown }) => {
      map[key] = typeof value === 'number' ? value : parseFloat(String(value))
    })
    return {
      breakeven_cpa: map.breakeven_cpa ?? 17500,
      roas_min:      map.roas_min      ?? 2.86,
    }
  } catch {
    return { breakeven_cpa: 17500, roas_min: 2.86 }
  }
}

// ── TN credential resolver: Supabase first, env vars fallback ──────
async function getTNCredentials(supabase: SupabaseClient): Promise<{ token: string; userId: string } | null> {
  try {
    const { data } = await supabase
      .from('app_config')
      .select('value')
      .eq('key', 'tiendanube_credentials')
      .single()
    if (data?.value?.access_token && data?.value?.user_id) {
      return { token: data.value.access_token, userId: data.value.user_id }
    }
  } catch { /* table may not exist yet */ }
  const token  = process.env.TIENDANUBE_ACCESS_TOKEN
  const userId = process.env.TIENDANUBE_USER_ID
  return token && userId ? { token, userId } : null
}

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
  const url = META_API + '/' + path + '&access_token=' + META_TOKEN
  const res = await fetch(url, { next: { revalidate: 0 } })
  return res.json()
}

async function fetchCampaigns(since: string, until: string) {
  const timeRange = encodeURIComponent('{"since":"' + since + '","until":"' + until + '"}')
  const fields = 'id,name,status,objective,insights.time_range(' + timeRange + '){' + INSIGHT_FIELDS + '}'
  const res = await fetchMeta(ACCOUNT_ID + '/campaigns?fields=' + fields + '&limit=50')
  if (res.error) throw new Error('Meta campaigns: ' + res.error.message)
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return (res.data || []).map((c: any) => ({ id: c.id, name: c.name, status: c.status, objective: c.objective, ...parseInsights(c) }))
}

async function fetchAdsets(since: string, until: string) {
  const timeRange = encodeURIComponent('{"since":"' + since + '","until":"' + until + '"}')
  const fields = 'id,name,status,campaign_id,daily_budget,optimization_goal,stop_time,insights.time_range(' + timeRange + '){' + INSIGHT_FIELDS + '}'
  const res = await fetchMeta(ACCOUNT_ID + '/adsets?fields=' + fields + '&limit=100')
  if (res.error) throw new Error('Meta adsets: ' + res.error.message)
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return (res.data || []).map((s: any) => ({
    id: s.id, name: s.name, status: s.status, campaign_id: s.campaign_id,
    daily_budget: s.daily_budget ? parseInt(s.daily_budget) / 100 : null,
    optimization_goal: s.optimization_goal, stop_time: s.stop_time || null,
    ...parseInsights(s),
  }))
}

async function fetchAds(since: string, until: string) {
  const timeRange = encodeURIComponent('{"since":"' + since + '","until":"' + until + '"}')
  const fields = 'id,name,status,adset_id,insights.time_range(' + timeRange + '){' + INSIGHT_FIELDS + '}'
  const res = await fetchMeta(ACCOUNT_ID + '/ads?fields=' + fields + '&limit=200')
  if (res.error) throw new Error('Meta ads: ' + res.error.message)
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return (res.data || []).map((a: any) => ({ id: a.id, name: a.name, status: a.status, adset_id: a.adset_id, ...parseInsights(a) }))
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function buildSummary(adsets: any[], breakeven_cpa: number, roas_min: number) {
  const activeAdsets   = adsets.filter(s => s.status === 'ACTIVE')
  const totalSpend     = adsets.reduce((sum, s) => sum + (s.spend || 0), 0)
  const totalBudget    = activeAdsets.reduce((sum, s) => sum + (s.daily_budget || 0), 0)
  const convAdsets     = adsets.filter(s => s.optimization_goal === 'OFFSITE_CONVERSIONS')
  const convSpend      = convAdsets.reduce((sum, s) => sum + (s.spend || 0), 0)
  const totalPurchases = convAdsets.reduce((sum, s) => sum + (s.results || 0), 0)
  const blendedCPA     = totalPurchases > 0 ? convSpend / totalPurchases : null
  const roasAdsets     = convAdsets.filter(s => s.roas && s.spend)
  const weightedRoas   = roasAdsets.length > 0
    ? roasAdsets.reduce((sum, s) => sum + s.roas * s.spend, 0) / roasAdsets.reduce((sum, s) => sum + s.spend, 0)
    : null

  const alerts: object[] = []
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  activeAdsets.forEach((s: any) => {
    if (s.cost_per_result && s.optimization_goal === 'OFFSITE_CONVERSIONS' && s.cost_per_result > breakeven_cpa) {
      alerts.push({
        type: 'cpa_exceeded', entity_type: 'adset', entity_id: s.id, entity_name: s.name,
        message: 'CPA $' + Math.round(s.cost_per_result).toLocaleString('es-AR') + ' supera el breakeven',
        severity: s.cost_per_result > breakeven_cpa * 1.5 ? 'danger' : 'warning',
        threshold: breakeven_cpa, actual_value: s.cost_per_result,
      })
    }
    if (s.roas && s.roas < roas_min && (s.spend || 0) > 5000) {
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

async function fetchTNRevenue(since: string, until: string, tnCreds: { token: string; userId: string } | null): Promise<number | null> {
  if (!tnCreds) return null
  try {
    const sinceISO = since + 'T00:00:00.000-03:00'
    const untilISO = until + 'T23:59:59.000-03:00'
    const params = new URLSearchParams({
      created_at_min: sinceISO, created_at_max: untilISO,
      status: 'open,closed,paid', per_page: '200',
    })
    const res = await fetch(TN_API + '/' + tnCreds.userId + '/orders?' + params, {
      headers: {
        'Authentication': 'bearer ' + tnCreds.token,
        'User-Agent': 'ForeverDashboard/1.0 (francojah@gmail.com)',
      },
      cache: 'no-store',
    })
    const orders = await res.json()
    if (!Array.isArray(orders)) return null
    const paid = orders.filter((o: { payment_status: string }) => ['paid', 'closed'].includes(o.payment_status))
    return Math.round(paid.reduce((s: number, o: { total: string }) => s + parseFloat(o.total || '0'), 0))
  } catch { return null }
}

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url)
  const since = searchParams.get('from') || new Date().toISOString().split('T')[0]
  const until = searchParams.get('to')   || since

  if (!META_TOKEN) return NextResponse.json({ error: 'Faltan variables de entorno' }, { status: 500 })

  const supabase = createClient(SUPABASE_URL, SUPABASE_KEY)
  const [{ breakeven_cpa, roas_min }, tnCreds] = await Promise.all([
    getThresholds(supabase),
    getTNCredentials(supabase),
  ])

  try {
    const [campaigns, adsets, ads, tnRevenue] = await Promise.all([
      fetchCampaigns(since, until),
      fetchAdsets(since, until),
      fetchAds(since, until),
      fetchTNRevenue(since, until, tnCreds),
    ])
    const summary = buildSummary(adsets, breakeven_cpa, roas_min)
    return NextResponse.json({
      ok: true, range: { since, until },
      meta: { campaigns, adsets, ads, summary },
      tn_revenue: tnRevenue,
    })
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'Error desconocido'
    return NextResponse.json({ error: msg }, { status: 500 })
  }
}
