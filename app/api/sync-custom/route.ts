import { NextResponse } from 'next/server'

const META_TOKEN = process.env.META_ACCESS_TOKEN!
const ACCOUNT_ID = process.env.META_ACCOUNT_ID || 'act_1614288152915913'
const META_API   = 'https://graph.facebook.com/v21.0'
const TN_API     = 'https://api.tiendanube.com/v1'
const TN_USER_ID = process.env.TIENDANUBE_USER_ID!
const TN_TOKEN   = process.env.TIENDANUBE_ACCESS_TOKEN!

const PURCHASE_TYPES = ['omni_purchase', 'purchase', 'offsite_conversion.fb_pixel_purchase']
const INSIGHT_FIELDS = 'spend,impressions,clicks,ctr,actions,purchase_roas'
const BREAKEVEN_CPA  = 17500
const ROAS_MIN       = 2.86

function fmt(str: string | null | undefined): number | null {
  const n = parseFloat(str ?? '')
  return isNaN(n) ? null : n
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
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
function buildSummary(adsets: any[]) {
  const activeAdsets  = adsets.filter((s: { status: string }) => s.status === 'ACTIVE')
  const totalSpend    = adsets.reduce((sum: number, s: { spend: number | null }) => sum + (s.spend || 0), 0)
  const totalBudget   = activeAdsets.reduce((sum: number, s: { daily_budget: number | null }) => sum + (s.daily_budget || 0), 0)
  const convAdsets    = adsets.filter((s: { optimization_goal: string }) => s.optimization_goal === 'OFFSITE_CONVERSIONS')
  const convSpend     = convAdsets.reduce((sum: number, s: { spend: number | null }) => sum + (s.spend || 0), 0)
  const totalPurchases = convAdsets.reduce((sum: number, s: { results: number | null }) => sum + (s.results || 0), 0)
  const blendedCPA    = totalPurchases > 0 ? convSpend / totalPurchases : null
  const roasAdsets    = convAdsets.filter((s: { roas: number | null; spend: number | null }) => s.roas && s.spend)
  const weightedRoas  = roasAdsets.length > 0
    ? roasAdsets.reduce((sum: number, s: { roas: number; spend: number }) => sum + s.roas * s.spend, 0) /
      roasAdsets.reduce((sum: number, s: { spend: number }) => sum + s.spend, 0)
    : null
  const alerts: object[] = []
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  activeAdsets.forEach((s: any) => {
    if (s.cost_per_result && s.optimization_goal === 'OFFSITE_CONVERSIONS' && s.cost_per_result > BREAKEVEN_CPA) {
      alerts.push({ type: 'cpa_exceeded', entity_type: 'adset', entity_id: s.id, entity_name: s.name,
        message: 'CPA $' + Math.round(s.cost_per_result).toLocaleString('es-AR') + ' supera el breakeven',
        severity: s.cost_per_result > BREAKEVEN_CPA * 1.5 ? 'danger' : 'warning',
        threshold: BREAKEVEN_CPA, actual_value: s.cost_per_result })
    }
    if (s.roas && s.roas < ROAS_MIN && s.spend > 5000) {
      alerts.push({ type: 'roas_drop', entity_type: 'adset', entity_id: s.id, entity_name: s.name,
        message: 'ROAS ' + s.roas.toFixed(2) + 'x por debajo del minimo (' + ROAS_MIN + 'x)',
        severity: 'warning', threshold: ROAS_MIN, actual_value: s.roas })
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

async function fetchTNRevenue(since: string, until: string): Promise<number | null> {
  if (!TN_USER_ID || !TN_TOKEN) return null
  try {
    const sinceISO = since + 'T00:00:00.000-03:00'
    const untilISO = until + 'T23:59:59.000-03:00'
    const params = new URLSearchParams({
      created_at_min: sinceISO,
      created_at_max: untilISO,
      status: 'open,closed,paid',
      per_page: '200',
    })
    const res = await fetch(TN_API + '/' + TN_USER_ID + '/orders?' + params, {
      headers: {
        'Authentication': 'bearer ' + TN_TOKEN,
        'User-Agent': 'ForeverDashboard/1.0 (francojah@gmail.com)',
      },
      cache: 'no-store',
    })
    const orders = await res.json()
    if (!Array.isArray(orders)) return null
    const paid = orders.filter((o: { payment_status: string }) => ['paid', 'closed'].includes(o.payment_status))
    const revenue = paid.reduce((s: number, o: { total: string }) => s + parseFloat(o.total || '0'), 0)
    return Math.round(revenue)
  } catch {
    return null
  }
}

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url)
  const since = searchParams.get('from') || new Date().toISOString().split('T')[0]
  const until = searchParams.get('to')   || since

  if (!META_TOKEN) {
    return NextResponse.json({ error: 'Faltan variables de entorno' }, { status: 500 })
  }

  try {
    const [campaigns, adsets, ads, tnRevenue] = await Promise.all([
      fetchCampaigns(since, until),
      fetchAdsets(since, until),
      fetchAds(since, until),
      fetchTNRevenue(since, until),
    ])
    const summary = buildSummary(adsets)
    return NextResponse.json({
      ok: true,
      range: { since, until },
      meta: { campaigns, adsets, ads, summary },
      tn_revenue: tnRevenue,
    })
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'Error desconocido'
    return NextResponse.json({ error: msg }, { status: 500 })
  }
}
