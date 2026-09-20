import { getLatestTNSnapshot, getLatestSnapshot } from '@/lib/supabase'
import { createClient } from '@supabase/supabase-js'
import BalanceClient from '@/components/Balance/BalanceClient'

export const dynamic = 'force-dynamic'

function sb() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  )
}

async function getExpenses(year: number) {
  try {
    const { data } = await sb()
      .from('variable_expenses')
      .select('*')
      .like('month', `${year}-%`)
      .order('created_at', { ascending: false })
    return data ?? []
  } catch { return [] }
}

async function getMonthlySummaries(year: number) {
  try {
    const { data } = await sb()
      .from('monthly_summaries')
      .select('*')
      .like('month', `${year}-%`)
      .order('month', { ascending: false })
    return data ?? []
  } catch { return [] }
}

const SETTINGS_DEFAULTS = {
  unit_cost_default:   6500,
  packaging_per_order: 350,
  units_per_order:     3,
}

async function getCostSettings() {
  try {
    const { data } = await sb().from('app_settings').select('key, value')
    const s = { ...SETTINGS_DEFAULTS }
    ;(data || []).forEach(({ key, value }: { key: string; value: unknown }) => {
      const k = key as keyof typeof SETTINGS_DEFAULTS
      if (k in s) s[k] = typeof value === 'number' ? value : parseFloat(String(value))
    })
    return s
  } catch { return SETTINGS_DEFAULTS }
}

export default async function BalancePage({
  searchParams,
}: {
  searchParams?: { year?: string }
}) {
  const curYear = new Date().getFullYear()
  const year    = Math.max(2020, Math.min(curYear + 1, parseInt(searchParams?.year ?? '') || curYear))

  const [tnSnapshot, metaSnapshot, initialExpenses, initialSummaries, initialSettings] = await Promise.all([
    getLatestTNSnapshot().catch(() => null),
    getLatestSnapshot().catch(() => null),
    getExpenses(year),
    getMonthlySummaries(year),
    getCostSettings(),
  ])

  return (
    <div className="p-4 lg:p-6">
      <BalanceClient
        tnSnapshot={tnSnapshot}
        metaSnapshot={metaSnapshot}
        initialExpenses={initialExpenses}
        initialSummaries={initialSummaries}
        initialYear={year}
        initialSettings={initialSettings}
      />
    </div>
  )
}
