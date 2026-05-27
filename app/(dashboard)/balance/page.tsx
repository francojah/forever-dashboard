import { getLatestTNSnapshot, getLatestSnapshot } from '@/lib/supabase'
import { createClient } from '@supabase/supabase-js'
import BalanceClient from '@/components/Balance/BalanceClient'

export const dynamic = 'force-dynamic'

const DEFAULT_SETTINGS = { tn_commission_pct: 3.5, shipping_pct: 8 }

async function getSettings() {
  try {
    const supabase = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!
    )
    const { data } = await supabase
      .from('app_settings')
      .select('key, value')
      .in('key', ['tn_commission_pct', 'shipping_pct'])

    const result = { ...DEFAULT_SETTINGS }
    ;(data || []).forEach(({ key, value }: { key: string; value: unknown }) => {
      const k = key as keyof typeof DEFAULT_SETTINGS
      if (k in result) result[k] = typeof value === 'number' ? value : parseFloat(String(value))
    })
    return result
  } catch {
    return DEFAULT_SETTINGS
  }
}

export default async function BalancePage() {
  const [tnSnapshot, metaSnapshot, settings] = await Promise.all([
    getLatestTNSnapshot().catch(() => null),
    getLatestSnapshot().catch(() => null),
    getSettings(),
  ])

  return (
    <div className="p-6">
      <BalanceClient tnSnapshot={tnSnapshot} metaSnapshot={metaSnapshot} settings={settings} />
    </div>
  )
}
