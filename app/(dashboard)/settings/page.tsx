import SettingsClient from '@/components/Settings/SettingsClient'

export const dynamic = 'force-dynamic'

const DEFAULTS = {
  breakeven_cpa:     17500,
  roas_min:          2.86,
  roas_scale:        6,
  tn_commission_pct: 1.2,
  shipping_pct:      10,
}

async function getSettings() {
  try {
    const { createClient } = await import('@supabase/supabase-js')
    const supabase = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!
    )
    const { data } = await supabase.from('app_settings').select('key, value')
    const result = { ...DEFAULTS }
    ;(data || []).forEach(({ key, value }: { key: string; value: unknown }) => {
      const k = key as keyof typeof DEFAULTS
      if (k in result) result[k] = typeof value === 'number' ? value : parseFloat(String(value))
    })
    return result
  } catch {
    return DEFAULTS
  }
}

export default async function SettingsPage() {
  const settings = await getSettings()
  return (
    <div className="p-6">
      <SettingsClient initialSettings={settings} />
    </div>
  )
}
