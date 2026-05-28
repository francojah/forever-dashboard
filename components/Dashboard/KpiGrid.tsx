import type { Summary } from '@/lib/supabase'
import { InfoTooltip } from '@/components/ui/InfoTooltip'

interface Props {
  summary:     Summary
  breakeven:   number
  period?:     string
  tnRevenue?:  number | null
  realRoas?:   number | null
  prevSummary?: Summary | null
}

function delta(current: number | null | undefined, prev: number | null | undefined): number | null {
  if (current == null || prev == null || prev === 0) return null
  return parseFloat(((current - prev) / Math.abs(prev) * 100).toFixed(1))
}

function DeltaBadge({ pct, invert = false }: { pct: number | null; invert?: boolean }) {
  if (pct == null) return null
  const positive = invert ? pct < 0 : pct > 0
  const neutral   = Math.abs(pct) < 2
  const cls = neutral
    ? 'text-gray-400 dark:text-zinc-500'
    : positive
    ? 'text-emerald-600 dark:text-emerald-400'
    : 'text-red-500 dark:text-red-400'
  const arrow = neutral ? '' : pct > 0 ? ' ↑' : ' ↓'
  return (
    <span className={'text-xs font-medium ' + cls}>
      {(pct > 0 ? '+' : '') + pct + '%' + arrow}
    </span>
  )
}

function KpiCard({
  label, value, sub, status, delta: d, invertDelta, tooltip
}: {
  label: string; value: string; sub?: string; status?: 'ok' | 'warn' | 'bad' | 'neutral'
  delta?: number | null; invertDelta?: boolean; tooltip?: string
}) {
  const textColor = {
    ok:      'text-emerald-600 dark:text-emerald-400',
    warn:    'text-amber-600 dark:text-amber-400',
    bad:     'text-red-600 dark:text-red-400',
    neutral: 'text-gray-900 dark:text-white',
  }[status || 'neutral']

  return (
    <div className="bg-white dark:bg-zinc-900 rounded-xl border border-gray-200 dark:border-zinc-800 p-4 shadow-sm">
      <div className="flex items-center gap-1 mb-1">
        <p className="text-xs text-gray-400 dark:text-zinc-500 font-medium uppercase tracking-wide">{label}</p>
        {tooltip && <InfoTooltip text={tooltip} />}
      </div>
      <p className={'text-2xl font-semibold ' + textColor}>{value}</p>
      <div className="flex items-center gap-2 mt-1">
        {sub && <p className="text-xs text-gray-400 dark:text-zinc-600">{sub}</p>}
        {d != null && <DeltaBadge pct={d} invert={invertDelta} />}
      </div>
    </div>
  )
}

export default function KpiGrid({ summary, breakeven, period = '7d', tnRevenue = null, realRoas = null, prevSummary = null }: Props) {
  const roasValue  = realRoas ?? summary.blended_roas
  const roasStatus = !roasValue ? 'neutral'
    : roasValue >= 5 ? 'ok'
    : roasValue >= 3 ? 'warn' : 'bad'

  const cpaStatus = !summary.blended_cpa ? 'neutral'
    : summary.blended_cpa <= breakeven ? 'ok'
    : summary.blended_cpa <= breakeven * 1.3 ? 'warn' : 'bad'

  const days     = period === '30d' ? 30 : period === '7d' ? 7 : null
  const perDaySub = days && summary.total_purchases_7d
    ? '~' + (Math.round((summary.total_purchases_7d / days) * 10) / 10) + '/dia'
    : undefined

  const roasSub = realRoas != null ? 'real (TN/Meta)' : undefined

  const tnLabel = 'Ventas TN ' + (
    period === 'hoy'    ? 'Hoy'   :
    period === 'ayer'   ? 'Ayer'  :
    period === '7d'     ? '7d'    :
    period === '30d'    ? '30d'   :
    period === 'custom' ? 'Rango' : period
  )

  const spendLabel = 'Gasto ' + (
    period === 'hoy'    ? 'Hoy'   :
    period === 'ayer'   ? 'Ayer'  :
    period === '30d'    ? '30d'   :
    period === 'custom' ? 'Rango' : '7d'
  )

  const purchasesLabel = 'Compras ' + (
    period === 'hoy'    ? 'Hoy'   :
    period === 'ayer'   ? 'Ayer'  :
    period === '30d'    ? '30d'   :
    period === 'custom' ? 'Rango' : '7d'
  )

  // WoW deltas
  const dSpend     = delta(summary.total_spend_7d, prevSummary?.total_spend_7d)
  const dPurchases = delta(summary.total_purchases_7d, prevSummary?.total_purchases_7d)
  const dRoas      = delta(roasValue, prevSummary ? (realRoas ?? prevSummary.blended_roas) : null)
  const dCpa       = delta(summary.blended_cpa, prevSummary?.blended_cpa)

  return (
    <div className={'grid grid-cols-2 ' + (tnRevenue != null ? 'md:grid-cols-4 lg:grid-cols-7' : 'md:grid-cols-3 lg:grid-cols-6') + ' gap-3'}>
      {tnRevenue != null && (
        <KpiCard
          label={tnLabel} value={'$' + Math.round(tnRevenue / 1000) + 'K'} sub="ARS - Tiendanube" status="neutral"
          tooltip="Total facturado en Tiendanube en el período. Incluye todas las fuentes de tráfico, no solo Meta Ads."
        />
      )}
      <KpiCard
        label={spendLabel} value={'$' + Math.round((summary.total_spend_7d || 0) / 1000) + 'K'} sub="ARS total" status="neutral" delta={dSpend}
        tooltip="Total invertido en Meta Ads en el período. Incluye todos los ad sets con actividad."
      />
      <KpiCard
        label="Budget/dia" value={'$' + Math.round((summary.daily_budget_active || 0) / 1000) + 'K'} sub="ARS activo" status="neutral"
        tooltip="Presupuesto diario total de todos los ad sets activos en este momento. No incluye ad sets pausados."
      />
      <KpiCard
        label={purchasesLabel} value={String(summary.total_purchases_7d || 0)} sub={perDaySub} status="neutral" delta={dPurchases}
        tooltip="Compras atribuidas por el pixel de Meta (ventana de 28 días). Puede sobreestimar el impacto real porque incluye conversiones influenciadas por anuncios anteriores."
      />
      <KpiCard
        label="ROAS blend." value={roasValue ? roasValue.toFixed(2) + 'x' : '--'} sub={roasSub} status={roasStatus} delta={dRoas}
        tooltip={realRoas != null
          ? 'ROAS real: ventas totales de Tiendanube ÷ gasto Meta. Más conservador que el ROAS de Meta porque no infla por ventana de atribución.'
          : 'ROAS ponderado por gasto entre todos los ad sets de conversión. Calculado con ventana de atribución de 28 días de Meta.'}
      />
      <KpiCard
        label="CPA blend." value={summary.blended_cpa ? '$' + Math.round(summary.blended_cpa / 1000) + 'K' : '--'} sub={'bk $' + breakeven / 1000 + 'K'} status={cpaStatus} delta={dCpa} invertDelta
        tooltip={'Costo promedio por compra atribuida. Verde = por debajo del breakeven ($' + (breakeven / 1000) + 'K). Rojo = cada venta cuesta más de lo que genera.'}
      />
      <KpiCard
        label="Ad sets activos" value={String(summary.active_adsets || 0)} sub="corriendo" status="neutral"
        tooltip="Cantidad de ad sets con estado ACTIVE actualmente. Los pausados no cuentan aunque tengan presupuesto asignado."
      />
    </div>
  )
}
