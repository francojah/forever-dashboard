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

export default async function BalancePage() {
  const year = new Date().getFullYear()

  const [tnSnapshot, metaSnapshot, initialExpenses, initialSummaries] = await Promise.all([
    getLatestTNSnapshot().catch(() => null),
    getLatestSnapshot().catch(() => null),
    getExpenses(year),
    getMonthlySummaries(year),
  ])

  return (
    <div className="p-4 lg:p-6">
      <BalanceClient
        tnSnapshot={tnSnapshot}
        metaSnapshot={metaSnapshot}
        initialExpenses={initialExpenses}
        initialSummaries={initialSummaries}
      />
    </div>
  )
}
