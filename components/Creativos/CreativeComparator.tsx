'use client'

import { useState } from 'react'
import { LOCALE } from '@/lib/config'

/**
 * CreativeComparator — Compara creativos lado a lado.
 * Elegís hasta 3 anuncios y ves hook rate, view rate, CTR, CPA, ROAS, frecuencia.
 * La mejor métrica de cada fila se resalta en verde.
 */

interface AdItem {
  id: string
  name: string
  spend: number | null
  roas: number | null
  cost_per_result: number | null
  ctr: number | null
  hook_rate?: number | null
  view_rate?: number | null
  frequency?: number | null
}

interface Props {
  ads: AdItem[]
  breakeven?: number
}

type MetricDef = {
  key: keyof AdItem
  label: string
  fmt: (v: number) => string
  better: 'high' | 'low'
}

const METRICS: MetricDef[] = [
  { key: 'hook_rate', label: 'Hook rate', fmt: (v) => v.toFixed(1) + '%', better: 'high' },
  { key: 'view_rate', label: 'View rate', fmt: (v) => v.toFixed(1) + '%', better: 'high' },
  { key: 'ctr', label: 'CTR', fmt: (v) => v.toFixed(2) + '%', better: 'high' },
  { key: 'cost_per_result', label: 'CPA', fmt: (v) => '$' + Math.round(v).toLocaleString(LOCALE), better: 'low' },
  { key: 'roas', label: 'ROAS', fmt: (v) => v.toFixed(2) + 'x', better: 'high' },
  { key: 'frequency', label: 'Frecuencia', fmt: (v) => v.toFixed(1), better: 'low' },
  { key: 'spend', label: 'Gasto', fmt: (v) => '$' + Math.round(v).toLocaleString(LOCALE), better: 'high' },
]

export default function CreativeComparator({ ads }: Props) {
  const withData = ads.filter((a) => (a.spend || 0) > 0)
  const [selected, setSelected] = useState<string[]>(withData.slice(0, 2).map((a) => a.id))

  const toggle = (id: string) => {
    setSelected((prev) =>
      prev.includes(id) ? prev.filter((x) => x !== id) : prev.length < 3 ? [...prev, id] : prev
    )
  }

  const chosen = selected.map((id) => withData.find((a) => a.id === id)).filter(Boolean) as AdItem[]

  // Mejor valor por métrica (para resaltar)
  function bestValue(m: MetricDef): number | null {
    const vals = chosen.map((a) => a[m.key] as number | null | undefined).filter((v): v is number => v != null)
    if (!vals.length) return null
    return m.better === 'high' ? Math.max(...vals) : Math.min(...vals)
  }

  return (
    <div className="bg-white dark:bg-zinc-900 rounded-xl border border-gray-200 dark:border-zinc-800 p-5 shadow-sm">
      <h3 className="text-sm font-semibold text-gray-900 dark:text-zinc-100 mb-1">Comparador de creativos</h3>
      <p className="text-[11px] text-gray-400 dark:text-zinc-500 mb-3">Elegí hasta 3 · el mejor valor de cada fila se resalta</p>

      {/* Selector */}
      <div className="flex flex-wrap gap-1.5 mb-4">
        {withData.slice(0, 12).map((a) => (
          <button
            key={a.id}
            onClick={() => toggle(a.id)}
            className={
              'px-2.5 py-1 text-[11px] rounded-lg border transition-all max-w-[180px] truncate ' +
              (selected.includes(a.id)
                ? 'border-indigo-400 bg-indigo-50 dark:bg-indigo-500/15 text-indigo-700 dark:text-indigo-300'
                : 'border-gray-200 dark:border-zinc-700 text-gray-600 dark:text-zinc-300 hover:bg-gray-50 dark:hover:bg-zinc-800')
            }
            title={a.name}
          >
            {a.name}
          </button>
        ))}
      </div>

      {chosen.length === 0 ? (
        <p className="text-xs text-gray-400 dark:text-zinc-500">Elegí al menos un creativo.</p>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-xs">
            <thead>
              <tr className="border-b border-gray-100 dark:border-zinc-800">
                <th className="py-2 pr-3 text-left font-medium text-gray-400 dark:text-zinc-500">Métrica</th>
                {chosen.map((a) => (
                  <th key={a.id} className="py-2 px-2 text-right font-medium text-gray-700 dark:text-zinc-200 max-w-[140px]">
                    <span className="block truncate" title={a.name}>{a.name}</span>
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {METRICS.map((m) => {
                const best = bestValue(m)
                return (
                  <tr key={m.key} className="border-b border-gray-50 dark:border-zinc-800/50">
                    <td className="py-2 pr-3 text-gray-500 dark:text-zinc-400">{m.label}</td>
                    {chosen.map((a) => {
                      const v = a[m.key] as number | null | undefined
                      const isBest = v != null && best != null && v === best && chosen.length > 1
                      return (
                        <td
                          key={a.id}
                          className={
                            'py-2 px-2 text-right tabular-nums ' +
                            (isBest ? 'text-emerald-600 dark:text-emerald-400 font-semibold' : 'text-gray-700 dark:text-zinc-300')
                          }
                        >
                          {v == null ? '—' : m.fmt(v)}
                        </td>
                      )
                    })}
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}
