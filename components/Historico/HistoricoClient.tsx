'use client'

import { useState, useCallback } from 'react'
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer } from 'recharts'
import type { Summary } from '@/lib/supabase'

interface DataPoint { snapshot_date: string; summary: Summary }
interface Props { data: DataPoint[] }

type Metric = 'blended_roas' | 'blended_cpa' | 'total_spend_7d' | 'total_purchases_7d'
type Window = '7d' | '30d'

const METRICS: { key: Metric; label: string; color: string; format: (v: number) => string }[] = [
  { key: 'blended_roas',       label: 'ROAS',    color: '#10b981', format: v => `${v.toFixed(2)}x` },
  { key: 'blended_cpa',        label: 'CPA',     color: '#f59e0b', format: v => `$${Math.round(v / 1000)}K` },
  { key: 'total_spend_7d',     label: 'Gasto',   color: '#6366f1', format: v => `$${Math.round(v / 1000)}K` },
  { key: 'total_purchases_7d', label: 'Compras', color: '#ec4899', format: v => String(Math.round(v)) },
]

function shortDate(d: string) {
  const [, m, day] = d.split('-')
  return `${parseInt(day)}/${parseInt(m)}`
}

function avg(points: DataPoint[], key: Metric): number | null {
  const vals = points.map(p => p.summary[key] as number | null).filter(v => v != null) as number[]
  if (!vals.length) return null
  return vals.reduce((s, v) => s + v, 0) / vals.length
}

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
  const [activeMetrics, setActiveMetrics] = useState<Set<Metric>>(new Set<Metric>(['blended_roas', 'total_spend_7d']))
  const [compWindow, setCompWindow] = useState<Window>('7d')
  const [backfilling, setBackfilling] = useState(false)
  const [backfillMsg, setBackfillMsg] = useState<string | null>(null)

  const runBackfill = useCallback(async () => {
    setBackfilling(true)
    setBackfillMsg(null)
    try {
      const res = await fetch('/api/backfill-history', { method: 'POST' })
      const result = await res.json()
      if (result.error) throw new Error(result.error)
      setBackfillMsg(
        result.inserted > 0
          ? `Importados ${result.inserted} dias de Meta (${result.range}). Recarga la pagina para ver.`
          : result.message || 'Historial ya actualizado.'
      )
      setTimeout(() => window.location.reload(), 1500)
    } catch (e) {
      setBackfillMsg(`Error: ${e instanceof Error ? e.message : 'Error'}`)
    } finally {
      setBackfilling(false)
    }
  }, [])

  const ImportBtn = () => (
    <button onClick={runBackfill} disabled={backfilling}
      className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium border border-gray-200 dark:border-zinc-700 rounded-lg text-gray-600 dark:text-zinc-400 hover:bg-gray-100 dark:hover:bg-zinc-800 disabled:opacity-50 transition-all shrink-0"
      title="Importar ultimos 30 dias desde Meta">
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className={`w-3.5 h-3.5 ${backfilling ? 'animate-spin' : ''}`}>
        <path strokeLinecap="round" strokeLinejoin="round" d="M3 16.5v2.25A2.25 2.25 0 005.25 21h13.5A2.25 2.25 0 0021 18.75V16.5M16.5 12L12 16.5m0 0L7.5 12m4.5 4.5V3"/>
      </svg>
      {backfilling ? 'Importando...' : 'Importar 30d de Meta'}
    </button>
  )

  if (!data.length) {
    return (
      <div className="max-w-6xl mx-auto space-y-6">
        <div className="flex items-start justify-between gap-4">
          <div>
            <h1 className="text-xl font-semibold text-gray-900 dark:text-zinc-100">Historial de performance</h1>
            <p className="text-sm text-gray-500 dark:text-zinc-500 mt-0.5">Sin datos aun</p>
          </div>
          <ImportBtn />
        </div>
        {backfillMsg && <p className="text-sm text-gray-600 dark:text-zinc-400">{backfillMsg}</p>}
        <div className="flex flex-col items-center justify-center py-20 text-center">
          <div className="text-5xl mb-4">📈</div>
          <h2 className="text-lg font-semibold text-gray-800 dark:text-zinc-200 mb-2">Sin historial todavia</h2>
          <p className="text-sm text-gray-500 dark:text-zinc-500 max-w-xs">
            Haz click en Importar 30d de Meta para traer los ultimos 30 dias de datos.
          </p>
        </div>
      </div>
    )
  }

  const chartData = data.map(d => ({
    date:               shortDate(d.snapshot_date),
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

  const windowDays = compWindow === '7d' ? 7 : 30
  const sorted = [...data].sort((a, b) => a.snapshot_date.localeCompare(b.snapshot_date))
  const current  = sorted.slice(-windowDays)
  const previous = sorted.slice(-windowDays * 2, -windowDays)

  function delta(key: Metric) {
    const cur = avg(current, key)
    const prv = avg(previous, key)
    if (cur == null || prv == null || prv === 0) return null
    return ((cur - prv) / prv) * 100
  }

  return (
    <div className="max-w-6xl mx-auto space-y-6">
      {/* Header */}
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-xl font-semibold text-gray-900 dark:text-zinc-100">Historial de performance</h1>
          <p className="text-sm mt-0.5">
            {backfillMsg
              ? <span className="text-gray-600 dark:text-zinc-400">{backfillMsg}</span>
              : <span className="text-gray-500 dark:text-zinc-500">Evolucion diaria - {data.length} dias</span>
            }
          </p>
        </div>
        <ImportBtn />
      </div>

      {/* Comparison window + summary cards */}
      <div>
        <div className="flex items-center gap-3 mb-3">
          <p className="text-xs font-medium text-gray-500 dark:text-zinc-400 uppercase tracking-wide">Comparar</p>
          <div className="flex bg-gray-100 dark:bg-zinc-800 rounded-lg p-0.5 gap-0.5">
            {(['7d', '30d'] as Window[]).map(w => (
              <button key={w} onClick={() => setCompWindow(w)}
                className={`px-3 py-1 text-xs font-medium rounded-md transition-all ${
                  compWindow === w ? 'bg-white dark:bg-zinc-700 text-gray-900 dark:text-zinc-100 shadow-sm' : 'text-gray-500 dark:text-zinc-400'
                }`}>
                {w} vs {w} anterior
              </button>
            ))}
          </div>
        </div>

        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
          {METRICS.map(({ key, label, color, format }) => {
            const val = avg(current, key)
            const d = delta(key)
            const isInverse = key === 'blended_cpa'
            return (
              <div key={key} className="bg-white dark:bg-zinc-900 rounded-xl border border-gray-200 dark:border-zinc-800 p-4 shadow-sm">
                <div className="flex items-center gap-1.5 mb-1">
                  <span className="w-2 h-2 rounded-full" style={{ backgroundColor: color }} />
                  <p className="text-xs text-gray-400 dark:text-zinc-500 font-medium uppercase tracking-wide">{label}</p>
                </div>
                <p className="text-2xl font-semibold text-gray-900 dark:text-zinc-100">
                  {val != null ? format(val) : '--'}
                </p>
                {d != null && (
                  <p className={`text-xs mt-1 font-medium ${
                    (isInverse ? d <= 0 : d >= 0) ? 'text-emerald-600 dark:text-emerald-400' : 'text-red-500 dark:text-red-400'
                  }`}>
                    {d >= 0 ? '+' : ''}{d.toFixed(1)}% vs {compWindow} anterior
                  </p>
                )}
                {d == null && previous.length === 0 && (
                  <p className="text-xs mt-1 text-gray-400 dark:text-zinc-600">Sin periodo anterior</p>
                )}
              </div>
            )
          })}
        </div>
      </div>

      {/* Chart */}
      <div className="bg-white dark:bg-zinc-900 rounded-xl border border-gray-200 dark:border-zinc-800 p-5 shadow-sm">
        <div className="flex flex-wrap gap-2 mb-5">
          {METRICS.map(({ key, label, color }) => {
            const active = activeMetrics.has(key)
            return (
              <button key={key} onClick={() => toggleMetric(key)}
                className={`flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-medium border transition-all ${
                  active ? 'text-white border-transparent shadow-sm' : 'text-gray-500 dark:text-zinc-400 border-gray-200 dark:border-zinc-700'
                }`}
                style={active ? { backgroundColor: color, borderColor: color } : {}}>
                <span className="w-1.5 h-1.5 rounded-full" style={{ backgroundColor: active ? 'white' : color }} />
                {label}
              </button>
            )
          })}
        </div>
        <ResponsiveContainer width="100%" height={320}>
          <LineChart data={chartData} margin={{ top: 4, right: 16, left: 0, bottom: 0 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="rgba(156,163,175,0.2)" />
            <XAxis dataKey="date" tick={{ fontSize: 11, fill: '#9ca3af' }} axisLine={false} tickLine={false} />
            <YAxis yAxisId="left" tick={{ fontSize: 11, fill: '#9ca3af' }} axisLine={false} tickLine={false} width={45} />
            <YAxis yAxisId="right" orientation="right" tick={{ fontSize: 11, fill: '#9ca3af' }} axisLine={false} tickLine={false} width={45} />
            <Tooltip content={<CustomTooltip />} />
            <Legend wrapperStyle={{ fontSize: '12px' }} />
            {METRICS.map(({ key, label, color }, i) =>
              activeMetrics.has(key) ? (
                <Line key={key} yAxisId={i < 2 ? 'left' : 'right'} type="monotone" dataKey={key} name={label}
                  stroke={color} strokeWidth={2} dot={{ r: 3, fill: color }} activeDot={{ r: 5 }} connectNulls />
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
                    {s.total_spend_7d ? `$${Math.round(s.total_spend_7d / 1000)}K` : '--'}
                  </td>
                  <td className="px-4 py-2.5 text-right text-gray-600 dark:text-zinc-400">
                    {s.total_purchases_7d ?? '--'}
                  </td>
                  <td className="px-4 py-2.5 text-right">
                    {s.blended_cpa ? (
                      <span className={`font-medium ${s.blended_cpa <= 17500 ? 'text-emerald-600 dark:text-emerald-400' : s.blended_cpa <= 22750 ? 'text-amber-600 dark:text-amber-400' : 'text-red-600 dark:text-red-400'}`}>
                        ${Math.round(s.blended_cpa / 1000)}K
                      </span>
                    ) : <span className="text-gray-400">--</span>}
                  </td>
                  <td className="px-4 py-2.5 text-right">
                    {s.blended_roas ? (
                      <span className={`font-medium ${s.blended_roas >= 5 ? 'text-emerald-600 dark:text-emerald-400' : s.blended_roas >= 3 ? 'text-amber-600 dark:text-amber-400' : 'text-red-600 dark:text-red-400'}`}>
                        {s.blended_roas.toFixed(2)}x
                      </span>
                    ) : <span className="text-gray-400">--</span>}
                  </td>
                  <td className="px-4 py-2.5 text-right text-gray-600 dark:text-zinc-400">
                    {s.active_adsets != null ? s.active_adsets : '--'}
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
