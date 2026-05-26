import { NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

const META_TOKEN   = process.env.META_ACCESS_TOKEN!
const ACCOUNT_ID   = process.env.META_ACCOUNT_ID || 'act_1614288152915913'
const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL!
const SUPABASE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY!
const META_API     = 'https://graph.facebook.com/v21.0'

// Fetch account-level daily insights for a date range
async function fetchDailyInsights(since: string, until: string) {
  const params = new URLSearchParams({
    time_range: JSON.stringify({ since, until }),
    time_increment: '1',
    level: 'account',
    fields: 'spend,impressions,clicks,ctr,actions,purchase_roas,date_start,date_stop',
    limit: '31',
    access_token: META_TOKEN,
  })
  const res = await fetch(`${META_API}/${ACCOUNT_ID}/insights?${params}`)
  return res.json()
}

// Fetch adsets for a specific date range (for per-day budget info)
async function fetchAdsetsSummary(since: string, until: string) {
  const fields = `id,name,status,campaign_id,daily_budget,optimization_goal,insights.time_range({"since":"${since}","until":"${until}"}){spend,impressions,clicks,ctr,actions,purchase_roas}`
  const params = new URLSearchParams({ fields, limit: '100', access_token: META_TOKEN })
  const res = await fetch(`${META_API}/${ACCOUNT_ID}/adsets?${params}`)
  return res.json()
}

const PURCHASE_TYPES = ['omni_purchase', 'purchase', 'offsite_conversion.fb_pixel_purchase']

function findAction(arr: { action_type: string; value: string }[] | null | undefined, types: string[]): number | null {
  if (!arr) return null
  const found = arr.find(a => types.includes(a.action_type))
  return found ? parseFloat(found.value) : null
}

export async function POST() {
  if (!META_TOKEN || !SUPABASE_URL || !SUPABASE_KEY) {
    return NextResponse.json({ error: 'Faltan variables de entorno' }, { status: 500 })
  }

  const supabase = createClient(SUPABASE_URL, SUPABASE_KEY)

  // Date range: last 30 days
  const until = new Date()
  const since = new Date()
  since.setDate(since.getDate() - 30)

  const sinceStr = since.toISOString().split('T')[0]
  const untilStr = until.toISOString().split('T')[0]

  try {
    // Fetch daily account insights
    const insightsRes = await fetchDailyInsights(sinceStr, untilStr)
    if (insightsRes.error) throw new Error(`Meta insights: ${insightsRes.error.message}`)

    const dailyData: { date: string; spend: number; impressions: number; clicks: number; ctr: number | null; purchases: number; roas: number | null }[] = []

    for (const day of (insightsRes.data || [])) {
      const spend = parseFloat(day.spend || '0')
      const purchases = findAction(day.actions, PURCHASE_TYPES) ?? 0
      const roas = findAction(day.purchase_roas, PURCHASE_TYPES)
      dailyData.push({
        date: day.date_start,
        spend,
        impressions: parseInt(day.impressions || '0'),
        clicks: parseInt(day.clicks || '0'),
        ctr: day.ctr ? parseFloat(day.ctr) : null,
        purchases,
        roas,
      })
    }

    // Upsert each day as a lightweight snapshot
    const upserts = dailyData.map(d => ({
      snapshot_date: d.date,
      campaigns: [],
      adsets: [],
      ads: [],
      summary: {
        total_spend_7d: Math.round(d.spend),
        daily_budget_active: 0,
        total_purchases_7d: d.purchases,
        blended_cpa: d.purchases > 0 ? Math.round(d.spend / d.purchases) : null,
        blended_roas: d.roas,
        conversion_spend_7d: Math.round(d.spend),
        active_adsets: 0,
        alerts: [],
      },
      created_at: new Date().toISOString(),
    }))

    // Insert in batches, skip dates that already have full snapshots (campaigns/adsets/ads populated)
    const { data: existing } = await supabase
      .from('meta_snapshots')
      .select('snapshot_date, campaigns')
      .gte('snapshot_date', sinceStr)

    const fullDates = new Set(
      (existing || [])
        .filter((r: { campaigns: unknown[] }) => r.campaigns && (r.campaigns as unknown[]).length > 0)
        .map((r: { snapshot_date: string }) => r.snapshot_date)
    )

    const toUpsert = upserts.filter(u => !fullDates.has(u.snapshot_date))

    if (toUpsert.length === 0) {
      return NextResponse.json({ ok: true, inserted: 0, message: 'Todos los días ya tienen datos completos.' })
    }

    const { error } = await supabase
      .from('meta_snapshots')
      .upsert(toUpsert, { onConflict: 'snapshot_date', ignoreDuplicates: false })

    if (error) throw error

    return NextResponse.json({
      ok: true,
      inserted: toUpsert.length,
      skipped: upserts.length - toUpsert.length,
      range: `${sinceStr} → ${untilStr}`,
    })
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'Error desconocido'
    return NextResponse.json({ error: msg }, { status: 500 })
  }
}
