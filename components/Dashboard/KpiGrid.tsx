import type { Summary } from '@/lib/supabase'

interface Props {
  summary: Summary
  breakeven: number
  aov: number
}

function KpiCard({
  label, value, sub, status
}: {
  label: string; value: string; sub?: string; status?: 'ok' | 'warn' | 'bad' | 'neutral'
}) {
  const textColor = {
    ok: 'text-green-700',
    warn: 'text-amber-600',
    bad: 'text-red-600',
    neutral: 'text-gray-900',
  }[status || 'neutral']

  return (
    <div className="bg-white rounded-xl border border-gray-200 p-4">
      <p className="text-xs text-gray-500 font-medium uppercase tracking-wide mb-1">{label}</p>
      <p className={`text-2xl font-semibold ${textColor}`}>{value}</p>
      {sub && <p className="text-xs text-gray-400 mt-1">{sub}</p>}
    </div>
  )
}

export default function KpiGrid({ summary, breakeven, aov }: Props) {
  const roasStatus = !summary.blended_roas ? 'neutral'
    : summary.blended_roas >= 5 ? 'ok'
    : summary.blended_roas >= 3 ? 'warn' : 'bad'

  const cpaStatus = !summary.blended_cpa ? 'neutral'
    : summary.blended_cpa <= breakeven ? 'ok'
    : summary.blended_cpa <= breakeven * 1.3 ? 'warn' : 'bad'

  return (
    <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-3">
      <KpiCard
        label="Gasto 7d"
        value={`$${Math.round((summary.total_spend_7d || 0) / 1000)}K`}
        sub="ARS total"
        status="neutral"
      />
      <KpiCard
        label="Budget/día"
        value={`$${Math.round((summary.daily_budget_active || 0) / 1000)}K`}
        sub="ARS activo"
        status="neutral"
      />
      <KpiCard
        label="Compras 7d"
        value={String(summary.total_purchases_7d || 0)}
        sub={`~${Math.round((summary.total_purchases_7d || 0) / 7 * 10) / 10}/día`}
        status="neutral"
      />
      <KpiCard
        label="ROAS blend."
        value={summary.blended_roas ? `${summary.blended_roas}x` : '—'}
        sub="meta: 10x"
        status={roasStatus}
      />
      <KpiCard
        label="CPA blend."
        value={summary.blended_cpa ? `$${Math.round(summary.blended_cpa / 1000)}K` : '—'}
        sub={`breakeven $${breakeven / 1000}K`}
        status={cpaStatus}
      />
      <KpiCard
        label="Ad sets activos"
        value={String(summary.active_adsets || 0)}
        sub="corriendo"
        status="neutral"
      />
    </div>
  )
}
