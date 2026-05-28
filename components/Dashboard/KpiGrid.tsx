import type { Summary } from '@/lib/supabase'

interface Props {
  summary:    Summary
  breakeven:  number
  period?:    string
  tnRevenue?: number | null
  realRoas?:  number | null
}

function KpiCard({
  label, value, sub, status
}: {
  label: string; value: string; sub?: string; status?: 'ok' | 'warn' | 'bad' | 'neutral'
}) {
  const textColor = {
    ok:      'text-emerald-600 dark:text-emerald-400',
    warn:    'text-amber-600 dark:text-amber-400',
    bad:     'text-red-600 dark:text-red-400',
    neutral: 'text-gray-900 dark:text-white',
  }[status || 'neutral']

  return (
    <div className="bg-white dark:bg-zinc-900 rounded-xl border border-gray-200 dark:border-zinc-800 p-4 shadow-sm">
      <p className="text-xs text-gray-400 dark:text-zinc-500 font-medium uppercase tracking-wide mb-1">{label}</p>
      <p className={"text-2xl font-semibold " + textColor}>{value}</p>
      {sub && <p className="text-xs text-gray-400 dark:text-zinc-600 mt-1">{sub}</p>}
    </div>
  )
}

export default function KpiGrid({ summary, breakeven, period = '7d', tnRevenue = null, realRoas = null }: Props) {
  const roasValue = realRoas ?? summary.blended_roas
  const roasStatus = !roasValue ? 'neutral'
    : roasValue >= 5 ? 'ok'
    : roasValue >= 3 ? 'warn' : 'bad'

  const cpaStatus = !summary.blended_cpa ? 'neutral'
    : summary.blended_cpa <= breakeven ? 'ok'
    : summary.blended_cpa <= breakeven * 1.3 ? 'warn' : 'bad'

  const days = period === '30d' ? 30 : period === '7d' ? 7 : null
  const perDaySub = days && summary.total_purchases_7d
    ? '~' + (Math.round((summary.total_purchases_7d / days) * 10) / 10) + '/dia'
    : undefined

  const roasSub = realRoas != null ? 'real (TN/Meta)' : undefined

  const tnLabel = 'Ventas TN ' + (
    period === 'today'     ? 'Hoy'  :
    period === 'yesterday' ? 'Ayer' :
    period === '7d'        ? '7d'   :
    period === '30d'       ? '30d'  :
    period === 'custom'    ? 'Rango' : period
  )

  const spendLabel = 'Gasto ' + (
    period === 'today'     ? 'Hoy'  :
    period === 'yesterday' ? 'Ayer' :
    period === '30d'       ? '30d'  :
    period === 'custom'    ? 'Rango' : '7d'
  )

  const purchasesLabel = 'Compras ' + (
    period === 'today'     ? 'Hoy'  :
    period === 'yesterday' ? 'Ayer' :
    period === '30d'       ? '30d'  :
    period === 'custom'    ? 'Rango' : '7d'
  )

  return (
    <div className={"grid grid-cols-2 " + (tnRevenue != null ? 'md:grid-cols-4 lg:grid-cols-7' : 'md:grid-cols-3 lg:grid-cols-6') + " gap-3"}>
      {tnRevenue != null && (
        <KpiCard label={tnLabel} value={"$" + Math.round(tnRevenue / 1000) + "K"} sub="ARS - Tiendanube" status="neutral" />
      )}
      <KpiCard label={spendLabel}        value={"$" + Math.round((summary.total_spend_7d || 0) / 1000) + "K"}          sub="ARS total"    status="neutral" />
      <KpiCard label="Budget/dia"        value={"$" + Math.round((summary.daily_budget_active || 0) / 1000) + "K"}      sub="ARS activo"   status="neutral" />
      <KpiCard label={purchasesLabel}    value={String(summary.total_purchases_7d || 0)}                                 sub={perDaySub}    status="neutral" />
      <KpiCard label="ROAS blend."       value={roasValue ? roasValue.toFixed(2) + 'x' : '--'}                           sub={roasSub}      status={roasStatus} />
      <KpiCard label="CPA blend."        value={summary.blended_cpa ? '$' + Math.round(summary.blended_cpa / 1000) + 'K' : '--'} sub={'bk $' + breakeven / 1000 + 'K'} status={cpaStatus} />
      <KpiCard label="Ad sets activos"   value={String(summary.active_adsets || 0)}                                      sub="corriendo"   status="neutral" />
    </div>
  )
}
