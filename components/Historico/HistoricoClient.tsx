'use client'

import { useState, useMemo } from 'react'
import {
  ComposedChart, Line, Bar, XAxis, YAxis, CartesianGrid,
  Tooltip, Legend, ReferenceLine, ResponsiveContainer, Area,
} from 'recharts'
import type { Summary } from '@/lib/supabase'
import TrendChart from '@/components/Dashboard/TrendChart'

const BREAKEVEN_CPA = 30462
const ROAS_MIN      = 1.77

interface DataPoint { snapshot_date: string; summary: Summary }
interface Props     { data: DataPoint[] }

type MetricKey = 'blended_roas' | 'blended_cpa' | 'total_spend_7d' | 'total_purchases_7d'

interface MetricDef {
  key:     MetricKey
  label:   string
  color:   string
  type:    'line' | 'bar'
  format:  (v: number) => string
  yAxisId: 'roas' | 'cpa' | 'spend' | 'units'
  refLine?: { value: number; label: string; color: string }
}

const METRIC_DEFS: MetricDef[] = [
  {
    key: 'blended_roas', label: 'ROAS', color: '#10b981', type: 'line', yAxisId: 'roas',
    format: v => v.toFixed(2) + 'x',
    refLine: { value: ROAS_MIN, label: `Min ${ROAS_MIN}x`, color: '#f59e0b' },
  },
  {
    key: 'blended_cpa', label: 'CPA', color: '#f59e0b', type: 'line', yAxisId: 'cpa',
    format: v => '$' + Math.round(v / 1000) + 'K',
    refLine: { value: BREAKEVEN_CPA, label: `BE $${Math.round(BREAKEVEN_CPA / 1000)}K`, color: '#ef4444' },
  },
  {
    key: 'total_spend_7d', label: 'Gasto', color: '#6366f1', type: 'bar', yAxisId: 'spend',
    format: v => '$' + Math.round(v / 1000) + 'K',
  },
  {
    key: 'total_purchases_7d', label: 'Compras', color: '#ec4899', type: 'line', yAxisId: 'units',
    format: v => String(Math.round(v)),
  },
]

function shortDate(d: string) {
  const [, m, day] = d.split('-')
  return parseInt(day) + '/' + parseInt(m)
}

function avg(arr: (number | null)[]): number | null {
  const vals = arr.filter((v): v is number => v != null)
  return vals.length ? vals.reduce((s, v) => s + v, 0) / vals.length : null
}

function last7Avg(points: DataPoint[], key: MetricKey): number | null {
  return avg(points.slice(-7).map(p => p.summary[key] as number | null))
}

function prev7Avg(points: DataPoint[], key: MetricKey): number | null {
  return avg(points.slice(-14, -7).map(p => p.summary[key] as number | null))
}

function delta(curr: number | null, prev: number | null): number | null {
  if (curr == null || prev == null || prev === 0) return null
  return (curr - prev) / Math.abs(prev) * 100
}

// ── Custom tooltip ────────────────────────────────────────────────
// eslint-disable-next-line @typescript-eslint/no-explicit-any
function ChartTooltip({ active, payload, label }: any) {
  if (!active || !payload?.length) return null
  return (
    <div className="bg-white dark:bg-zinc-900 border border-gray-200 dark:border-zinc-700 rounded-xl shadow-xl px-4 py-3 text-sm min-w-[160px]">
      <p className="font-semibold text-gray-700 dark:text-zinc-200 mb-2">{label}</p>
      {payload.map((p: { name: string; value: number; color: string }) => {
        const m = METRIC_DEFS.find(d => d.label === p.name)
        return (
          <div key={p.name} className="flex items-center justify-between gap-4">
            <span className="flex items-center gap-1.5">
              <span className="w-2 h-2 rounded-full" style={{ background: p.color }} />
              <span className="text-gray-500 dark:text-zinc-400">{p.name}</span>
            </span>
            <span className="font-semibold tabular-nums" style={{ color: p.color }}>
              {m ? m.format(p.value) : p.value}
            </span>
          </div>
        )
      })}
    </div>
  )
}

// ── Stat card ─────────────────────────────────────────────────────
function StatCard({ metric, points, window }: { metric: MetricDef; points: DataPoint[]; window: number }) {
  const half = Math.max(Math.floor(window / 2), 1)
  const curr = avg(points.slice(-half).map(p => p.summary[metric.key] as number | null))
  const prev = avg(points.slice(-window, -half).map(p => p.summary[metric.key] as number | null))
  const pct  = delta(curr, prev)

  const isGoodDelta = metric.key === 'blended_roas' || metric.key === 'total_purchases_7d'
    ? (pct ?? 0) >= 0
    : (pct ?? 0) <= 0

  const windowLabel = window <= 7 ? `últimos ${window}d` : `últimos ${Math.ceil(window / 2)}d`

  return (
    <div className="bg-white dark:bg-zinc-900 rounded-xl border border-gray-200 dark:border-zinc-800 p-4 shadow-sm">
      <p className="text-mini text-gray-400 dark:text-zinc-500 uppercase tracking-wide font-medium mb-1">
        {metric.label} — {windowLabel}
      </p>
      <p className="text-2xl font-semibold tabular-nums" style={{ color: metric.color }}>
        {curr != null ? metric.format(curr) : '—'}
      </p>
      {pct != null && (
        <p className={`text-xs mt-1 font-medium ${isGoodDelta ? 'text-emerald-600 dark:text-emerald-400' : 'text-red-500'}`}>
          {pct >= 0 ? '+' : ''}{pct.toFixed(1)}% vs período anterior
        </p>
      )}
      {/* Reference context */}
      {metric.refLine && curr != null && (
        <p className="text-mini text-gray-400 dark:text-zinc-500 mt-1">
          {metric.key === 'blended_roas'
            ? curr >= ROAS_MIN
              ? `✓ Sobre el mínimo (${ROAS_MIN}x)`
              : `✗ Bajo el mínimo (${ROAS_MIN}x)`
            : curr <= BREAKEVEN_CPA
              ? `✓ Bajo el BE ($${Math.round(BREAKEVEN_CPA / 1000)}K)`
              : `✗ Sobre el BE ($${Math.round(BREAKEVEN_CPA / 1000)}K)`
          }
        </p>
      )}
    </div>
  )
}

// ── Insight headline ──────────────────────────────────────────────
function InsightBanner({ points }: { points: DataPoint[] }) {
  if (points.length < 4) return null
  const half   = Math.max(Math.floor(points.length / 2), 1)
  const rCurr  = avg(points.slice(-half).map(p => p.summary.blended_roas as number | null))
  const rPrev  = avg(points.slice(-points.length, -half).map(p => p.summary.blended_roas as number | null))
  const cCurr  = avg(points.slice(-half).map(p => p.summary.blended_cpa as number | null))
  const rPct   = delta(rCurr, rPrev)
  const roasOk = rCurr != null && rCurr >= ROAS_MIN
  const cpaOk  = cCurr != null && cCurr <= BREAKEVEN_CPA
  const trend  = rPct != null ? (rPct >= 5 ? '↑ mejorando' : rPct <= -5 ? '↓ deteriorando' : '→ estable') : null

  const color = roasOk && cpaOk
    ? 'bg-emerald-50 dark:bg-emerald-950/20 border-emerald-200 dark:border-emerald-900/40 text-emerald-800 dark:text-emerald-300'
    : !roasOk || !cpaOk
    ? 'bg-red-50 dark:bg-red-950/20 border-red-200 dark:border-red-900/40 text-red-800 dark:text-red-300'
    : 'bg-amber-50 dark:bg-amber-950/20 border-amber-200 dark:border-amber-900/40 text-amber-800 dark:text-amber-300'

  const msg = [
    rCurr != null && `ROAS promedio ${rCurr.toFixed(2)}x${trend ? ` (${trend}${rPct != null ? ` ${rPct > 0 ? '+' : ''}${rPct.toFixed(0)}%` : ''})` : ''}`,
    cCurr != null && `CPA $${Math.round(cCurr / 1000)}K ${cpaOk ? '· bajo breakeven' : '· sobre breakeven'}`,
  ].filter(Boolean).join(' · ')

  return (
    <div className={`rounded-xl border px-4 py-3 text-xs font-medium ${color}`}>
      {msg || 'Sin suficientes datos para insight'}
    </div>
  )
}

// ── Main ──────────────────────────────────────────────────────────
export default function HistoricoClient({ data }: Props) {
  const [visibleMetrics, setVisible] = useState<Set<MetricKey>>(
    new Set<MetricKey>(['blended_roas', 'total_spend_7d'])
  )
  const [window, setWindow] = useState<7 | 14 | 30>(30)

  const points   = useMemo(() => [...data].sort((a, b) => a.snapshot_date.localeCompare(b.snapshot_date)), [data])
  const filtered = useMemo(() => points.slice(-window), [points, window])

  const chartData = useMemo(() => filtered.map(p => ({
    date:    shortDate(p.snapshot_date),
    fullDate: p.snapshot_date,
    ...Object.fromEntries(METRIC_DEFS.map(m => [m.key, p.summary[m.key] ?? null])),
  })), [filtered])

  function toggleMetric(key: MetricKey) {
    setVisible(prev => {
      const n = new Set(prev)
      n.has(key) ? n.delete(key) : n.add(key)
      return n
    })
  }

  const activeMetrics = METRIC_DEFS.filter(m => visibleMetrics.has(m.key))

  // Determine which Y-axis IDs are active
  const activeYAxes = new Set(activeMetrics.map(m => m.yAxisId))

  if (!data.length) {
    return (
      <div className="flex flex-col items-center justify-center h-[50vh] text-center">
        <p className="text-gray-400 dark:text-zinc-500 text-sm">Sin datos históricos todavía. Ejecutá algunos syncs diarios.</p>
      </div>
    )
  }

  return (
    <div className="max-w-5xl mx-auto space-y-6">

      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
        <div>
          <h1 className="text-xl font-semibold text-gray-900 dark:text-zinc-100">Tendencias</h1>
          <p className="text-sm text-gray-500 dark:text-zinc-500 mt-0.5">
            Evolución de métricas Meta Ads · {points.length} días de datos
          </p>
        </div>
        {/* Window selector */}
        <div className="flex bg-gray-100 dark:bg-zinc-800 rounded-lg p-0.5 gap-0.5">
          {([7, 14, 30] as const).map(w => (
            <button key={w} onClick={() => setWindow(w)}
              className={'px-3 py-1.5 text-xs font-medium rounded-md transition-all ' + (
                window === w
                  ? 'bg-white dark:bg-zinc-700 text-gray-900 dark:text-zinc-100 shadow-sm'
                  : 'text-gray-500 dark:text-zinc-400 hover:text-gray-700 dark:hover:text-zinc-200'
              )}>
              {w}d
            </button>
          ))}
        </div>
      </div>

      {/* Insight headline */}
      <InsightBanner points={filtered} />

      {/* Stat cards */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        {METRIC_DEFS.map(m => <StatCard key={m.key} metric={m} points={filtered} window={window} />)}
      </div>

      {/* Metric toggles */}
      <div className="flex flex-wrap gap-2">
        {METRIC_DEFS.map(m => (
          <button key={m.key} onClick={() => toggleMetric(m.key)}
            className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-medium border transition-all ${
              visibleMetrics.has(m.key)
                ? 'text-white border-transparent'
                : 'bg-white dark:bg-zinc-900 border-gray-200 dark:border-zinc-700 text-gray-500 dark:text-zinc-400'
            }`}
            style={visibleMetrics.has(m.key) ? { background: m.color, borderColor: m.color } : {}}
          >
            <span className="w-2 h-2 rounded-full" style={{ background: visibleMetrics.has(m.key) ? 'rgba(255,255,255,0.8)' : m.color }} />
            {m.label}
          </button>
        ))}
      </div>

      {/* Main chart */}
      <div className="bg-white dark:bg-zinc-900 rounded-2xl border border-gray-200 dark:border-zinc-800 shadow-sm p-5">
        {activeMetrics.length === 0 ? (
          <p className="text-center py-16 text-gray-400 dark:text-zinc-500 text-sm">
            Seleccioná al menos una métrica arriba.
          </p>
        ) : (
          <ResponsiveContainer width="100%" height={320}>
            <ComposedChart data={chartData} margin={{ top: 8, right: 8, bottom: 0, left: 0 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="rgba(128,128,128,0.1)" />
              <XAxis
                dataKey="date"
                tick={{ fontSize: 11, fill: 'currentColor' }}
                className="text-gray-400 dark:text-zinc-500"
                tickLine={false}
                axisLine={false}
                interval="preserveStartEnd"
              />

              {/* Y axes — only render if metric is visible */}
              {activeYAxes.has('roas') && (
                <YAxis yAxisId="roas" orientation="left" tick={{ fontSize: 11 }} tickFormatter={v => v.toFixed(1) + 'x'}
                  tickLine={false} axisLine={false} className="text-gray-400 dark:text-zinc-500" width={40} />
              )}
              {activeYAxes.has('cpa') && (
                <YAxis yAxisId="cpa" orientation="right" tick={{ fontSize: 11 }}
                  tickFormatter={v => '$' + Math.round(v / 1000) + 'K'}
                  tickLine={false} axisLine={false} className="text-gray-400 dark:text-zinc-500" width={48} />
              )}
              {activeYAxes.has('spend') && !activeYAxes.has('cpa') && (
                <YAxis yAxisId="spend" orientation="right" tick={{ fontSize: 11 }}
                  tickFormatter={v => '$' + Math.round(v / 1000) + 'K'}
                  tickLine={false} axisLine={false} className="text-gray-400 dark:text-zinc-500" width={48} />
              )}
              {activeYAxes.has('units') && (
                <YAxis yAxisId="units" orientation="left" hide={activeYAxes.has('roas')} tick={{ fontSize: 11 }}
                  tickLine={false} axisLine={false} className="text-gray-400 dark:text-zinc-500" width={32} />
              )}

              <Tooltip content={<ChartTooltip />} />
              <Legend
                wrapperStyle={{ fontSize: 12, paddingTop: 12 }}
                formatter={(value) => <span className="text-gray-500 dark:text-zinc-400">{value}</span>}
              />

              {/* Reference lines */}
              {visibleMetrics.has('blended_roas') && (
                <ReferenceLine yAxisId="roas" y={ROAS_MIN} stroke="#f59e0b" strokeDasharray="4 3" strokeWidth={1.5}
                  label={{ value: `${ROAS_MIN}x`, position: 'insideTopLeft', fontSize: 10, fill: '#f59e0b' }} />
              )}
              {visibleMetrics.has('blended_cpa') && (
                <ReferenceLine yAxisId="cpa" y={BREAKEVEN_CPA} stroke="#ef4444" strokeDasharray="4 3" strokeWidth={1.5}
                  label={{ value: `BE $${Math.round(BREAKEVEN_CPA / 1000)}K`, position: 'insideTopRight', fontSize: 10, fill: '#ef4444' }} />
              )}

              {/* Series */}
              {activeMetrics.map(m => {
                // Use the first active axis if a metric's axis is not rendered
                const yId = activeYAxes.has(m.yAxisId) ? m.yAxisId : Array.from(activeYAxes)[0]
                if (m.type === 'bar') {
                  return (
                    <Bar key={m.key} yAxisId={yId} dataKey={m.key} name={m.label}
                      fill={m.color} opacity={0.7} radius={[3, 3, 0, 0]} maxBarSize={24} />
                  )
                }
                return (
                  <Line key={m.key} yAxisId={yId} type="monotone" dataKey={m.key} name={m.label}
                    stroke={m.color} strokeWidth={2} dot={false} activeDot={{ r: 5, strokeWidth: 0 }}
                    connectNulls={true} />
                )
              })}
            </ComposedChart>
          </ResponsiveContainer>
        )}
      </div>

      {/* Data table */}
      <div className="bg-white dark:bg-zinc-900 rounded-2xl border border-gray-200 dark:border-zinc-800 shadow-sm overflow-hidden">
        <div className="px-5 py-3 border-b border-gray-100 dark:border-zinc-800">
          <p className="text-xs font-semibold text-gray-500 dark:text-zinc-400 uppercase tracking-wide">Datos diarios</p>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="bg-gray-50/60 dark:bg-zinc-800/40">
                <th className="text-left px-4 py-2.5 text-xs font-semibold text-gray-400 dark:text-zinc-500 uppercase tracking-wide">Fecha</th>
                {METRIC_DEFS.map(m => (
                  <th key={m.key} className="text-right px-4 py-2.5 text-xs font-semibold uppercase tracking-wide" style={{ color: m.color }}>{m.label}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {[...filtered].reverse().map((p, i) => {
                const s      = p.summary
                const roasOk = s.blended_roas != null && s.blended_roas >= ROAS_MIN
                const cpaOk  = s.blended_cpa  != null && s.blended_cpa  <= BREAKEVEN_CPA
                return (
                  <tr key={i} className="border-t border-gray-50 dark:border-zinc-800 hover:bg-gray-50/40 dark:hover:bg-zinc-800/30 transition-colors">
                    <td className="px-4 py-2.5 text-gray-500 dark:text-zinc-400 text-xs">{p.snapshot_date}</td>
                    <td className={`px-4 py-2.5 text-right tabular-nums font-medium ${roasOk ? 'text-emerald-600 dark:text-emerald-400' : s.blended_roas != null ? 'text-red-500' : 'text-gray-400 dark:text-zinc-600'}`}>
                      {s.blended_roas != null ? s.blended_roas.toFixed(2) + 'x' : '—'}
                    </td>
                    <td className={`px-4 py-2.5 text-right tabular-nums font-medium ${cpaOk ? 'text-emerald-600 dark:text-emerald-400' : s.blended_cpa != null ? 'text-red-500' : 'text-gray-400 dark:text-zinc-600'}`}>
                      {s.blended_cpa != null ? '$' + Math.round(s.blended_cpa / 1000) + 'K' : '—'}
                    </td>
                    <td className="px-4 py-2.5 text-right tabular-nums text-gray-600 dark:text-zinc-300">
                      {s.total_spend_7d != null ? '$' + Math.round(s.total_spend_7d / 1000) + 'K' : '—'}
                    </td>
                    <td className="px-4 py-2.5 text-right tabular-nums text-gray-600 dark:text-zinc-300">
                      {s.total_purchases_7d ?? '—'}
                    </td>
                  </tr>
                )
              })}
              {/* Promedio período */}
              {filtered.length > 1 && (() => {
                const avgRoas  = avg(filtered.map(p => p.summary.blended_roas as number | null))
                const avgCpa   = avg(filtered.map(p => p.summary.blended_cpa as number | null))
                const avgSpend = avg(filtered.map(p => p.summary.total_spend_7d as number | null))
                const avgPurch = avg(filtered.map(p => p.summary.total_purchases_7d as number | null))
                return (
                  <tr className="border-t-2 border-gray-200 dark:border-zinc-700 bg-gray-50/80 dark:bg-zinc-800/50 font-semibold">
                    <td className="px-4 py-2.5 text-xs text-gray-500 dark:text-zinc-400 uppercase tracking-wide">Promedio período</td>
                    <td className={`px-4 py-2.5 text-right tabular-nums text-xs ${avgRoas != null && avgRoas >= ROAS_MIN ? 'text-emerald-600 dark:text-emerald-400' : 'text-red-500'}`}>
                      {avgRoas != null ? avgRoas.toFixed(2) + 'x' : '—'}
                    </td>
                    <td className={`px-4 py-2.5 text-right tabular-nums text-xs ${avgCpa != null && avgCpa <= BREAKEVEN_CPA ? 'text-emerald-600 dark:text-emerald-400' : 'text-red-500'}`}>
                      {avgCpa != null ? '$' + Math.round(avgCpa / 1000) + 'K' : '—'}
                    </td>
                    <td className="px-4 py-2.5 text-right tabular-nums text-xs text-gray-600 dark:text-zinc-300">
                      {avgSpend != null ? '$' + Math.round(avgSpend / 1000) + 'K' : '—'}
                    </td>
                    <td className="px-4 py-2.5 text-right tabular-nums text-xs text-gray-600 dark:text-zinc-300">
                      {avgPurch != null ? avgPurch.toFixed(1) : '—'}
                    </td>
                  </tr>
                )
              })()}
            </tbody>
          </table>
        </div>
      </div>

      {/* Tendencia granular por entidad (desde metrics_daily) */}
      <TrendChart entityType="account" breakeven={BREAKEVEN_CPA} defaultMetric="spend" />
    </div>
  )
}
