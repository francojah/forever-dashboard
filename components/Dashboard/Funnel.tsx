'use client'

import { LOCALE } from '@/lib/config'

/**
 * Funnel — Embudo de conversión visual: impresiones → clics → compras.
 * Muestra el volumen de cada etapa y el drop-off (tasa de paso) entre ellas.
 * Sin dependencias externas; se alimenta de los totales que ya calcula la app.
 */

interface FunnelProps {
  impressions: number
  clicks: number
  purchases: number
  spend?: number | null
  className?: string
}

function fmt(n: number): string {
  return Math.round(n).toLocaleString(LOCALE)
}

function pct(part: number, whole: number): string {
  if (!whole) return '—'
  return ((part / whole) * 100).toFixed(part / whole < 0.01 ? 2 : 1) + '%'
}

const STAGES = [
  { key: 'impressions', label: 'Impresiones', color: 'bg-indigo-500', track: 'bg-indigo-100 dark:bg-indigo-500/15' },
  { key: 'clicks', label: 'Clics', color: 'bg-violet-500', track: 'bg-violet-100 dark:bg-violet-500/15' },
  { key: 'purchases', label: 'Compras', color: 'bg-emerald-500', track: 'bg-emerald-100 dark:bg-emerald-500/15' },
] as const

export default function Funnel({ impressions, clicks, purchases, spend, className }: FunnelProps) {
  const values: Record<string, number> = { impressions, clicks, purchases }
  const max = Math.max(impressions, 1)

  const ctr = pct(clicks, impressions)
  const cvr = pct(purchases, clicks)
  const overall = pct(purchases, impressions)

  return (
    <div
      className={
        (className ?? '') +
        ' bg-white dark:bg-zinc-900 rounded-xl border border-gray-200 dark:border-zinc-800 p-5 shadow-sm'
      }
    >
      <div className="flex items-center justify-between mb-4">
        <h3 className="text-sm font-semibold text-gray-900 dark:text-zinc-100">Embudo de conversión</h3>
        {spend != null && purchases > 0 && (
          <span className="text-xs text-gray-400 dark:text-zinc-500">
            CPA ${fmt(spend / purchases)}
          </span>
        )}
      </div>

      <div className="space-y-3">
        {STAGES.map((stage, i) => {
          const val = values[stage.key]
          const widthPct = Math.max((val / max) * 100, val > 0 ? 4 : 0)
          const prev = i > 0 ? values[STAGES[i - 1].key] : null
          const stepRate = prev != null ? pct(val, prev) : null
          return (
            <div key={stage.key}>
              <div className="flex items-center justify-between text-xs mb-1">
                <span className="font-medium text-gray-600 dark:text-zinc-300">{stage.label}</span>
                <span className="tabular-nums text-gray-900 dark:text-zinc-100 font-semibold">{fmt(val)}</span>
              </div>
              <div className={'h-6 rounded-md overflow-hidden ' + stage.track}>
                <div
                  className={'h-full rounded-md ' + stage.color + ' transition-all duration-500'}
                  style={{ width: widthPct + '%' }}
                />
              </div>
              {stepRate && (
                <div className="text-[11px] text-gray-400 dark:text-zinc-500 mt-1 pl-0.5">
                  ↓ {stepRate} pasa a esta etapa
                </div>
              )}
            </div>
          )
        })}
      </div>

      <div className="grid grid-cols-3 gap-2 mt-4 pt-4 border-t border-gray-100 dark:border-zinc-800">
        <Metric label="CTR" value={ctr} />
        <Metric label="Conv. clic→compra" value={cvr} />
        <Metric label="Conv. total" value={overall} />
      </div>
    </div>
  )
}

function Metric({ label, value }: { label: string; value: string }) {
  return (
    <div className="text-center">
      <p className="text-[11px] uppercase tracking-wide text-gray-400 dark:text-zinc-500">{label}</p>
      <p className="text-sm font-semibold text-gray-900 dark:text-zinc-100 mt-0.5 tabular-nums">{value}</p>
    </div>
  )
}
