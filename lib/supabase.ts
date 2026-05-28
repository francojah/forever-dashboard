import { createBrowserClient, createServerClient } from '@supabase/ssr'

// ── Tipos principales ──────────────────────────────────────────

export type PeriodMetrics = {
  campaigns: Campaign[]
  adsets: Adset[]
  ads: Ad[]
  summary: Summary
}

export type Snapshot = {
  id: string
  snapshot_date: string
  campaigns: Campaign[]
  adsets: Adset[]
  ads: Ad[]
  summary: Summary
  periods?: {
    today?: PeriodMetrics
    yesterday?: PeriodMetrics
    last_7d?: PeriodMetrics
    last_30d?: PeriodMetrics
  }
  created_at: string
}

export type Campaign = {
  id: string
  name: string
  status: string
  objective: string
  spend: number | null
  roas: number | null
  results: number | null
  cost_per_result: number | null
  impressions: number
  clicks: number
  ctr: number | null
}

export type Adset = {
  id: string
  name: string
  status: string
  campaign_id: string
  daily_budget: number | null
  optimization_goal: string
  spend: number | null
  roas: number | null
  results: number | null
  cost_per_result: number | null
  impressions: number
  clicks: number
  ctr: number | null
  stop_time: string | null
  frequency?: number | null
}

export type Ad = {
  id: string
  name: string
  status: string
  adset_id: string
  spend: number | null
  roas: number | null
  results: number | null
  cost_per_result: number | null
  impressions: number
  clicks: number
  ctr: number | null
  video_plays?: number | null
  video_p50?: number | null
  hook_rate?: number | null
  view_rate?: number | null
  frequency?: number | null
}

export type Summary = {
  total_spend_7d: number
  daily_budget_active: number
  total_purchases_7d: number
  blended_cpa: number | null
  blended_roas: number | null
  conversion_spend_7d: number
  active_adsets: number
  alerts: AlertData[]
}

export type AlertData = {
  type: string
  entity_type: string
  entity_id: string
  entity_name: string
  message: string
  severity: 'info' | 'warning' | 'danger'
  threshold: number
  actual_value: number
}

export type Creative = {
  id: string
  meta_ad_id: string | null
  name: string
  file_url: string | null
  file_type: 'image' | 'video' | 'carousel' | null
  adset_id: string | null
  adset_name: string | null
  campaign_name: string | null
  status: 'active' | 'paused' | 'testing' | 'winner' | 'loser'
  notes: string | null
  tags: string[]
  created_at: string
}

export type Lead = {
  id: string
  meta_lead_id: string | null
  full_name: string | null
  email: string | null
  phone: string | null
  form_name: string | null
  campaign_name: string | null
  status: 'new' | 'contacted' | 'qualified' | 'negotiating' | 'closed_won' | 'closed_lost'
  assigned_to: string | null
  notes: string | null
  created_at: string
}

export type Idea = {
  id: string
  title: string
  description: string | null
  format: 'video' | 'image' | 'carousel' | 'reel' | 'story' | null
  priority: 'high' | 'medium' | 'low'
  based_on: string | null
  status: 'pending' | 'in_progress' | 'filming' | 'editing' | 'done' | 'discarded'
  generated_by: 'ia' | 'team'
  created_at: string
}

// ── Clientes ───────────────────────────────────────────────────
export function createClientBrowser() {
  return createBrowserClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
  )
}

export function createClientServer() {
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const { cookies } = require('next/headers') as { cookies: () => { get: (name: string) => { value: string } | undefined; set: (opts: object) => void } }
  const cookieStore = cookies()
  return createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        get(name: string) { return cookieStore.get(name)?.value },
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        set(name: string, value: string, options: any) { try { cookieStore.set({ name, value, ...options }) } catch {} },
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        remove(name: string, options: any) { try { cookieStore.set({ name, value: '', ...options }) } catch {} },
      },
    }
  )
}

// ── Helpers de datos ───────────────────────────────────────────
export async function getLatestSnapshot(): Promise<Snapshot | null> {
  const supabase = createClientServer()
  const { data } = await supabase
    .from('meta_snapshots')
    .select('*')
    .order('snapshot_date', { ascending: false })
    .limit(1)
    .single()
  return data
}

export async function getSnapshotByDate(date: string): Promise<Snapshot | null> {
  const supabase = createClientServer()
  const { data } = await supabase
    .from('meta_snapshots')
    .select('*')
    .eq('snapshot_date', date)
    .single()
  return data
}

export async function getSnapshotDates(): Promise<string[]> {
  const supabase = createClientServer()
  const { data } = await supabase
    .from('meta_snapshots')
    .select('snapshot_date')
    .order('snapshot_date', { ascending: false })
    .limit(30)
  return (data || []).map((d: { snapshot_date: string }) => d.snapshot_date)
}

// ── Tiendanube types ───────────────────────────────────────────
export type TNSummary = {
  total_revenue: number
  total_orders: number
  aov: number
  unique_customers: number
  top_products: { name: string; quantity: number; revenue: number }[]
  payment_methods: Record<string, number>
  shipping_methods?: Record<string, number>
  top_provinces?: { name: string; count: number }[]
  conversion_rate?: number
  shipping_revenue?: number  // monto cobrado por envíos al cliente
}

export type TNSnapshot = {
  id: string
  snapshot_date: string
  summary_today:     TNSummary | null
  summary_yesterday: TNSummary | null
  summary_7d:        TNSummary | null
  summary_30d:       TNSummary | null
  summary_ytd:       TNSummary | null
  orders_count: number
  created_at: string
}

export async function getLatestTNSnapshot(): Promise<TNSnapshot | null> {
  const supabase = createClientServer()
  const { data } = await supabase
    .from('tiendanube_snapshots')
    .select('*')
    .order('snapshot_date', { ascending: false })
    .limit(1)
    .single()
  return data
}


export async function getHistoricalSnapshots(limit = 30): Promise<{ snapshot_date: string; summary: Summary }[]> {
  const supabase = createClientServer()
  const { data } = await supabase
    .from('meta_snapshots')
    .select('snapshot_date, summary')
    .order('snapshot_date', { ascending: true })
    .limit(limit)
  return (data || []) as { snapshot_date: string; summary: Summary }[]
}
