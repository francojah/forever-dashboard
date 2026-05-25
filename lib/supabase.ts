import { createBrowserClient, createServerClient } from '@supabase/ssr'
import { cookies } from 'next/headers'

// ── Tipos principales ──────────────────────────────────────────
export type Snapshot = {
  id: string
  snapshot_date: string
  campaigns: Campaign[]
  adsets: Adset[]
  ads: Ad[]
  summary: Summary
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
  const cookieStore = cookies()
  return createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        get(name: string) { return cookieStore.get(name)?.value },
        set(name, value, options) { try { cookieStore.set({ name, value, ...options }) } catch {} },
        remove(name, options) { try { cookieStore.set({ name, value: '', ...options }) } catch {} },
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
