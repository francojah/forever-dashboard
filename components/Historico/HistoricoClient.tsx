'use client'

import { useState } from 'react'
import {
  LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip,
  Legend, ResponsiveContainer,
} from 'recharts'
import type { Summary } from '@/lib/supabase'

interface DataPoint {
  snapshot_date: string
  summary: Summary
}

interface Props {
  data: DataPoint[]
}

type Metric = 'blended_roas' | 'blended_cpa' | 'total_spend_7d' | 'total_purchases_7d'

const METRICS: { key: Metric; label: string; color: string; format: (v: number) => string }[] = [
  { key: 'blended_roas',       label: 'ROAS',       color: '#10b981', format: v => `${v.toFixed(2)}x` },
  { key: 'blended_cpa',        label: 'CPA',         color: '#f59e0b', format: v => `$${Math.round(v / 1000)}K` },
  { key: 'total_spend_7d',     label: 'Gasto',       color: '#6366f1', format: v => `$${Math.round(v / 1000)}K` },
  { key: 'total_purchases_7d', label: 'Compras',     color: '#ec4899', format: v => String(Math.round(v)) },
]

function shortDate(d: string) {
  const [, m, day] = d.split('-')
  return `${parseInt(day)}/${parseInt(m)}`
}

// Custom tooltip
function CustomTooltip({ active, payload, label }: { active?: boolean; payload?: { name: string; value: number; color: string }[]; label?: string }) {
  if (!active || !payload?.length) return null
  return (
    <div className="bg-white dark:bg-zinc-900 border border-gray-200 dark:border-zinc-700 rounded-xl shadow-lg px-4 py-3 text-sm">
      <p className="font-semibold text-gray-700 dark:text-zinc-300 mb-2">{label}</p>
      {payload.map(p => {
        const metric = METRICS.find(m => m.label === p.name)
        return (
          <p key={p.name} style={{ color: p.color }} className="flex gap-3 justify-between">
            <span>{p.name}</span>
            <span className="font-medium">{metric ? metric.format(p.value) : p.value}</span>
          </p>
        )
      })}
    </div>
  )
}

export default function HistoricoClient({ data }: Props) {
  const [activeMetrics, setActiveMetrics] = useState<Set<Metric>>(new Set(['blended_roas', 'total_spend_7d']))

  if (!data.length) {
    return (
      <div className="flex flex-col items-center justify-center h-[60vh] text-center">
        <div className="text-5xl mb-4">📈</div>
        <h2 className="text-lg font-semibold text-gray-800 dark:text-zinc-200 mb-2">Sin historial todavía</h2>
        <p className="text-sm text-gray-500 dark:text-zinc-500 max-w-xs">
          El historial se construye con cada sync diario. Volvé después del primer sync.
        </p>
      </div>
    )
  }

  const chartData = data.map(d => ({
    date: shortDate(d.snapshot_date),
    full_date: d.snapshot_date,
    blended_roas:       d.summary.blended_roas ?? 0,
    blended_cpa:        d.summary.blended_cpa ?? 0,
    total_spend_7d:     d.summary.total_spend_7d ?? 0,
    total_purchases_7d: d.summary.total_purchases_7d ?? 0,
  }))

  const toggleMetric = (key: Metric) => {
    setActiveMetrics(prev => {
      const next = new Set(prev)
      if (next.has(key)) { if (next.size > 1) next.delete(key) }
      else next.add(key)
      return next
    })
  }

  // Summary stats
  const latest = data[data.length - 1]?.summary
  const prev = data[data.length - 2]?.summary

  function delta(key: Metric) {
    if (!latest || !prev) return null
    const a = latest[key] as number | null
    const b = prev[key] as number | null
    if (a == null || b == null || b === 0) return null
    return ((a - b) / b) * 100
  }

  return (
    <div className="max-w-6xl mx-auto space-y-6">
      {/* Header */}
      <div>
        <h1 className="text-xl font-semibold text-gray-900 dark:text-zinc-100">Historial de performance</h1>
        <p className="text-sm text-gray-500 dark:text-zinc-500 mt-0.5">
          Evolución diaria de métricas clave · últimos {data.length} días
        </p>
      </div>

      {/* Summary cards */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        {METRICS.map(({ key, label, color, format }) => {
          const val = latest?.[key] as number | null
          const d = delta(key)
          return (
            <div key={key} className="bg-white dark:bg-zinc-900 rounded-xl border border-gray-200 dark:border-zinc-800 p-4 shadow-sm">
              <div className="flex items-center gap-1.5 mb-1">
                <span className="w-2 h-2 rounded-full" style={{ backgroundColor: color }} />
                <p className="text-xs text-gray-400 dark:text-zinc-500 font-medium uppercase tracking-wide">{label}</p>
              </div>
              <p className="text-2xl font-semibold text-gray-900 dark:text-zinc-100">
                {val != null ? format(val) : '—'}
              </p>
              {d != null && (
                <p className={`text-xs mt-1 font-medium ${d >= 0 ? 'text-emerald-600 dark:text-emerald-400' : 'text-red-500 dark:text-red-400'}`}>
                  {d >= 0 ? '↑' : '↓'} {Math.abs(d).toFixed(1)}% vs ayer
                </p>
              )}
            </div>
          )
        })}
      </div>

      {/* Chart */}
      <div className="bg-white dark:bg-zinc-900 rounded-xl border border-gray-200 dark:border-zinc-800 p-5 shadow-sm">
        {/* Metric toggles */}
        <div className="flex flex-wrap gap-2 mb-5">
          {METRICS.map(({ key, label, color }) => {
            const active = activeMetrics.has(key)
            return (
              <button
                key={key}
                onClick={() => toggleMetric(key)}
                className={`flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-medium border transition-all ${
                  active
                    ? 'text-white border-transparent shadow-sm'
                    : 'text-gray-500 dark:text-zinc-400 border-gray-200 dark:border-zinc-700 bg-transparent'
                }`}
                style={active ? { backgroundColor: color, borderColor: color } : {}}
              >
                <span className="w-1.5 h-1.5 rounded-full" style={{ backgroundColor: active ? 'white' : color }} />
                {label}
              </button>
            )
          })}
        </div>

        <ResponsiveContainer width="100%" height={320}>
          <LineChart data={chartData} margin={{ top: 4, right: 16, left: 0, bottom: 0 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="rgba(156,163,175,0.2)" />
            <XAxis
              dataKey="date"
              tick={{ fontSize: 11, fill: '#9ca3af' }}
              axisLine={false}
              tickLine={false}
            />
            <YAxis
              yAxisId="left"
              tick={{ fontSize: 11, fill: '#9ca3af' }}
              axisLine={false}
              tickLine={false}
              width={45}
            />
            <YAxis
              yAxisId="right"
              orientation="right"
              tick={{ fontSize: 11, fill: '#9ca3af' }}
              axisLine={false}
              tickLine={false}
              width={45}
            />
            <Tooltip content={<CustomTooltip />} />
            <Legend wrapperStyle={{ fontSize: '12px' }} />
            {METRICS.map(({ key, label, color }, i) =>
              activeMetrics.has(key) ? (
                <Line
                  key={key}
                  yAxisId={i < 2 ? 'left' : 'right'}
                  type="monotone"
                  dataKey={key}
                  name={label}
                  stroke={color}
                  strokeWidth={2}
                  dot={{ r: 3, fill: color }}
                  activeDot={{ r: 5 }}
                  connectNulls
                />
              ) : null
            )}
          </LineChart>
        </ResponsiveContainer>
      </div>

      {/* Data table */}
      <div className="bg-white dark:bg-zinc-900 rounded-xl border border-gray-200 dark:border-zinc-800 overflow-hidden shadow-sm">
        <div className="p-4 border-b border-gray-100 dark:border-zinc-800">
          <h2 className="text-sm font-semibold text-gray-700 dark:text-zinc-300">Detalle diario</h2>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="text-xs text-gray-400 dark:text-zinc-500 bg-gray-50 dark:bg-zinc-800/50">
                <th className="text-left px-4 py-2.5 font-medium">Fecha</th>
                <th className="text-right px-4 py-2.5 font-medium">Gasto</th>
                <th className="text-right px-4 py-2.5 font-medium">Compras</th>
                <th className="text-right px-4 py-2.5 font-medium">CPA</th>
                <th className="text-right px-4 py-2.5 font-medium">ROAS</th>
                <th className="text-right px-4 py-2.5 font-medium">Ad sets</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100 dark:divide-zinc-800">
              {[...data].reverse().map(({ snapshot_date, summary: s }) => (
                <tr key={snapshot_date} className="hover:bg-gray-50 dark:hover:bg-zinc-800/30 transition-colors">
                  <td className="px-4 py-2.5 font-medium text-gray-700 dark:text-zinc-300">{snapshot_date}</td>
                  <td className="px-4 py-2.5 text-right text-gray-600 dark:text-zinc-400">
                    ${Math.round((s.total_spend_7d || 0) / 1000)}K
                  </td>
                  <td className="px-4 py-2.5 text-right text-gray-600 dark:text-zinc-400">
                    {s.total_purchases_7d || 0}
                  </td>
                  <td className="px-4 py-2.5 text-right">
                    {s.blended_cpa ? (
                      <span className={`font-medium ${s.blended_cpa <= 17500 ? 'text-emerald-600 dark:text-emerald-400' : s.blended_cpa <= 22750 ? 'text-amber-600 dark:text-amber-400' : 'text-red-600 dark:text-red-400'}`}>
                        ${Math.round(s.blended_cpa / 1000)}K
                      </span>
                    ) : <span className="text-gray-400">—</span>}
                  </td>
                  <td className="px-4 py-2.5 text-right">
                    {s.blended_roas ? (
                      <span className={`font-medium ${s.blended_roas >= 5 ? 'text-emerald-600 dark:text-emerald-400' : s.blended_roas >= 3 ? 'text-amber-600 dark:text-amber-400' : 'text-red-600 dark:text-red-400'}`}>
                        {s.blended_roas.toFixed(2)}x
                      </span>
                    ) : <span className="text-gray-400">—</span>}
                  </td>
                  <td className="px-4 py-2.5 text-right text-gray-600 dark:text-zinc-400">
                    {s.active_adsets || 0}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  )
}
