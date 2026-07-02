'use client'

import { useEffect, useState } from 'react'
import {
  ResponsiveContainer, AreaChart, Area, XAxis, YAxis, CartesianGrid,
  Tooltip as RechartTooltip, ReferenceLine,
} from 'recharts'
import { LOCALE } from '@/lib/config'

/**
 * TrendChart — Gráfico de evolución temporal sobre metrics_daily (vía /api/trends).
 * Autocontenido: incluye selector de métrica y ventana. Se puede dropear en
 * cualquier página (Histórico, Dashboard, detalle de campaña).
 *
 * Uso:  <TrendChart entityType="account" breakeven={30462} />
 *       <TrendChart entityType="adset" entityId="123" entityName="Adv+ Hombres" />
 */

type Metric = 'spend' | 'roas' | 'cost_per_result' | 'results' | 'ctr'

const METRICS: { key: Metric; label: string; money?: boolean; suffix?: string }[] = [
  { key: 'spend', label: 'Gasto', money: true },
  { key: 'cost_per_result', label: 'CPA', money: true },
  { key: 'roas', label: 'ROAS', suffix: 'x' },
  { key: 'results', label: 'Compras' },
  { key: 'ctr', label: 'CTR', suffix: '%' },
]

interface Props {
  entityType?: 'account' | 'campaign' | 'adset' | 'ad'
  entityId?: string
  entityName?: string
  breakeven?: number
  defaultMetric?: Metric
  defaultDays?: number
}

export default function TrendChart({
  entityType = 'account',
  entityId,
  entityName,
  breakeven,
  defaultMetric = 'spend',
  defaultDays = 30,
}: Props) {
  const [metric, setMetric] = useState<Metric>(defaultMetric)
  const [days, setDays] = useState(defaultDays)
  const [data, setData] = useState<{ date: string; value: number }[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const meta = METRICS.find((m) => m.key === metric)!

  useEffect(() => {
    let cancelled = false
    setLoading(true)
    setError(null)
    const params = new URLSearchParams({ entity_type: entityType, metric, days: String(days) })
    if (entityId) params.set('entity_id', entityId)
    fetch(`/api/trends?${params.toString()}`)
      .then((r) => r.json())
      .then((res) => {
        if (cancelled) return
        if (res.error) setError(res.error)
        else setData(res.series || [])
      })
      .catch((e) => !cancelled && setError(e.message))
      .finally(() => !cancelled && setLoading(false))
    return () => {
      cancelled = true
    }
  }, [entityType, entityId, metric, days])

  const fmtVal = (v: number) =>
    meta.money ? '$' + Math.round(v).toLocaleString(LOCALE) : v.toLocaleString(LOCALE) + (meta.suffix || '')

  const showBreakeven = metric === 'cost_per_result' && breakeven

  return (
    <div className="bg-white dark:bg-zinc-900 rounded-xl border border-gray-200 dark:border-zinc-800 p-4 shadow-sm">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 mb-4">
        <div>
          <h3 className="text-sm font-semibold text-gray-900 dark:text-zinc-100">
            Tendencia · {meta.label}
          </h3>
          <p className="text-[11px] text-gray-400 dark:text-zinc-500">
            {entityName || (entityType === 'account' ? 'Cuenta completa' : entityType)} · últimos {days} días
          </p>
        </div>
        <div className="flex items-center gap-2">
          <div className="flex bg-gray-100 dark:bg-zinc-800 rounded-lg p-0.5 gap-0.5">
            {METRICS.map((m) => (
              <button
                key={m.key}
                onClick={() => setMetric(m.key)}
                className={
                  'px-2.5 py-1 text-[11px] font-medium rounded-md transition-all ' +
                  (metric === m.key
                    ? 'bg-white dark:bg-zinc-700 text-gray-900 dark:text-zinc-100 shadow-sm'
                    : 'text-gray-500 dark:text-zinc-400 hover:text-gray-700 dark:hover:text-zinc-200')
                }
              >
                {m.label}
              </button>
            ))}
          </div>
          <select
            value={days}
            onChange={(e) => setDays(Number(e.target.value))}
            className="text-[11px] rounded-md border border-gray-200 dark:border-zinc-700 bg-white dark:bg-zinc-900 px-2 py-1 text-gray-700 dark:text-zinc-200"
          >
            <option value={7}>7d</option>
            <option value={14}>14d</option>
            <option value={30}>30d</option>
            <option value={90}>90d</option>
          </select>
        </div>
      </div>

      {loading ? (
        <div className="h-56 flex items-center justify-center text-xs text-gray-400 dark:text-zinc-500">
          Cargando...
        </div>
      ) : error ? (
        <div className="h-56 flex items-center justify-center text-xs text-red-400 text-center px-4">
          {error.includes('metrics_daily') || error.includes('does not exist')
            ? 'La tabla metrics_daily todavía no existe o está vacía. Corré la migración y el backfill.'
            : error}
        </div>
      ) : data.length === 0 ? (
        <div className="h-56 flex items-center justify-center text-xs text-gray-400 dark:text-zinc-500">
          Sin datos para este período todavía.
        </div>
      ) : (
        <ResponsiveContainer width="100%" height={224}>
          <AreaChart data={data} margin={{ top: 5, right: 8, left: 0, bottom: 0 }}>
            <defs>
              <linearGradient id="trendFill" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor="#6366f1" stopOpacity={0.35} />
                <stop offset="100%" stopColor="#6366f1" stopOpacity={0} />
              </linearGradient>
            </defs>
            <CartesianGrid strokeDasharray="3 3" stroke="currentColor" className="text-gray-100 dark:text-zinc-800" />
            <XAxis
              dataKey="date"
              tick={{ fontSize: 10 }}
              tickFormatter={(d) => (d as string).slice(5)}
              stroke="currentColor"
              className="text-gray-400 dark:text-zinc-600"
            />
            <YAxis
              tick={{ fontSize: 10 }}
              tickFormatter={(v) => (meta.money ? '$' + Math.round(Number(v) / 1000) + 'K' : String(v))}
              stroke="currentColor"
              className="text-gray-400 dark:text-zinc-600"
              width={44}
            />
            <RechartTooltip
              formatter={(v) => [fmtVal(Number(v)), meta.label]}
              labelFormatter={(d) => String(d)}
              contentStyle={{ fontSize: 12, borderRadius: 8 }}
            />
            {showBreakeven && (
              <ReferenceLine
                y={breakeven}
                stroke="#ef4444"
                strokeDasharray="4 4"
                label={{ value: 'breakeven', fontSize: 10, fill: '#ef4444', position: 'insideTopRight' }}
              />
            )}
            <Area type="monotone" dataKey="value" stroke="#6366f1" strokeWidth={2} fill="url(#trendFill)" />
          </AreaChart>
        </ResponsiveContainer>
      )}
    </div>
  )
}
