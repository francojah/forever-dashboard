'use client'

import { useState } from 'react'
import type { Snapshot } from '@/lib/supabase'

const BREAKEVEN_CPA = 17500
const ROAS_MIN = 2.86
const ROAS_TARGET = 10

interface Props {
  snapshot: Snapshot | null
}

type RecoType = 'scale' | 'maintain' | 'reduce' | 'pause' | 'test'

interface Recommendation {
  adset_id: string
  adset_name: string
  type: RecoType
  current_budget: number
  suggested_budget: number
  reason: string
  delta_ars: number
}

const RECO_CONFIG: Record<RecoType, { label: string; color: string; bg: string; darkBg: string; icon: string }> = {
  scale:    { label: 'Escalar',   color: 'text-emerald-700 dark:text-emerald-400', bg: 'bg-emerald-50',  darkBg: 'dark:bg-emerald-900/20', icon: '↑' },
  maintain: { label: 'Mantener',  color: 'text-blue-700    dark:text-blue-400',    bg: 'bg-blue-50',     darkBg: 'dark:bg-blue-900/20',     icon: '→' },
  reduce:   { label: 'Reducir',   color: 'text-amber-700   dark:text-amber-400',   bg: 'bg-amber-50',    darkBg: 'dark:bg-amber-900/20',    icon: '↓' },
  pause:    { label: 'Pausar',    color: 'text-red-700     dark:text-red-400',     bg: 'bg-red-50',      darkBg: 'dark:bg-red-900/20',      icon: '✕' },
  test:     { label: 'Testear',   color: 'text-purple-700  dark:text-purple-400',  bg: 'bg-purple-50',   darkBg: 'dark:bg-purple-900/20',   icon: '?' },
}

function buildRecommendations(snapshot: Snapshot): Recommendation[] {
  const recos: Recommendation[] = []

  for (const s of snapshot.adsets) {
    if (s.status !== 'ACTIVE') continue
    const budget = s.daily_budget || 0
    if (!budget) continue

    const isConv = s.optimization_goal === 'OFFSITE_CONVERSIONS'

    if (isConv) {
      const cpa = s.cost_per_result
      const roas = s.roas
      const spend = s.spend || 0

      if (!cpa && !roas) {
        // No data yet
        if (spend < 2000) {
          recos.push({
            adset_id: s.id, adset_name: s.name,
            type: 'test',
            current_budget: budget,
            suggested_budget: budget,
            reason: 'Gasto insuficiente para evaluar performance. Esperá más datos.',
            delta_ars: 0,
          })
        }
        continue
      }

      if (cpa && cpa > BREAKEVEN_CPA * 1.5) {
        // Very bad CPA — pause
        recos.push({
          adset_id: s.id, adset_name: s.name,
          type: 'pause',
          current_budget: budget,
          suggested_budget: 0,
          reason: `CPA $${Math.round(cpa / 1000)}K supera 1.5x el breakeven ($${BREAKEVEN_CPA / 1000}K). No es rentable.`,
          delta_ars: -budget,
        })
      } else if (cpa && cpa > BREAKEVEN_CPA) {
        // Over breakeven — reduce 20%
        const suggested = Math.round(budget * 0.8 / 500) * 500
        recos.push({
          adset_id: s.id, adset_name: s.name,
          type: 'reduce',
          current_budget: budget,
          suggested_budget: suggested,
          reason: `CPA $${Math.round(cpa / 1000)}K sobre el breakeven. Reducir inversión hasta mejorar.`,
          delta_ars: suggested - budget,
        })
      } else if (roas && roas >= ROAS_TARGET * 0.8) {
        // High ROAS — scale 30%
        const suggested = Math.round(budget * 1.3 / 500) * 500
        recos.push({
          adset_id: s.id, adset_name: s.name,
          type: 'scale',
          current_budget: budget,
          suggested_budget: suggested,
          reason: `ROAS ${roas.toFixed(2)}x excepcional. Escalar presupuesto para maximizar retorno.`,
          delta_ars: suggested - budget,
        })
      } else if (roas && roas >= ROAS_MIN && cpa && cpa <= BREAKEVEN_CPA) {
        // Profitable — maintain
        recos.push({
          adset_id: s.id, adset_name: s.name,
          type: 'maintain',
          current_budget: budget,
          suggested_budget: budget,
          reason: `ROAS ${roas.toFixed(2)}x y CPA $${Math.round(cpa / 1000)}K dentro de rango. Mantener.`,
          delta_ars: 0,
        })
      } else if (roas && roas < ROAS_MIN && spend > 5000) {
        // ROAS below minimum
        const suggested = Math.round(budget * 0.7 / 500) * 500
        recos.push({
          adset_id: s.id, adset_name: s.name,
          type: 'reduce',
          current_budget: budget,
          suggested_budget: suggested,
          reason: `ROAS ${roas.toFixed(2)}x por debajo del mínimo (${ROAS_MIN}x). Reducir exposición.`,
          delta_ars: suggested - budget,
        })
      } else {
        recos.push({
          adset_id: s.id, adset_name: s.name,
          type: 'maintain',
          current_budget: budget,
          suggested_budget: budget,
          reason: 'Performance dentro de parámetros normales.',
          delta_ars: 0,
        })
      }
    } else {
      // Traffic — just maintain unless CTR is terrible
      const ctr = s.ctr
      if (ctr !== null && ctr < 0.5) {
        recos.push({
          adset_id: s.id, adset_name: s.name,
          type: 'reduce',
          current_budget: budget,
          suggested_budget: Math.round(budget * 0.8 / 500) * 500,
          reason: `CTR ${ctr.toFixed(2)}% muy bajo. Revisar creativos antes de seguir invirtiendo.`,
          delta_ars: Math.round(budget * 0.8 / 500) * 500 - budget,
        })
      } else {
        recos.push({
          adset_id: s.id, adset_name: s.name,
          type: 'maintain',
          current_budget: budget,
          suggested_budget: budget,
          reason: 'Campaña de tráfico con CTR aceptable. Mantener.',
          delta_ars: 0,
        })
      }
    }
  }

  // Sort: pause first, then reduce, scale, maintain, test
  const order: RecoType[] = ['pause', 'reduce', 'scale', 'maintain', 'test']
  return recos.sort((a, b) => order.indexOf(a.type) - order.indexOf(b.type))
}

export default function PresupuestoClient({ snapshot }: Props) {
  const [applied, setApplied] = useState<Set<string>>(new Set())

  if (!snapshot) {
    return (
      <div className="flex flex-col items-center justify-center h-[60vh] text-center">
        <div className="text-5xl mb-4">💰</div>
        <h2 className="text-lg font-semibold text-gray-800 dark:text-zinc-200 mb-2">Sin datos todavía</h2>
        <p className="text-sm text-gray-500 dark:text-zinc-500 max-w-xs">
          Esperá el primer sync diario para ver recomendaciones de presupuesto.
        </p>
      </div>
    )
  }

  const recos = buildRecommendations(snapshot)
  const totalCurrentBudget = recos.reduce((s, r) => s + r.current_budget, 0)
  const totalSuggestedBudget = recos.reduce((s, r) => s + (r.type === 'pause' ? 0 : r.suggested_budget), 0)
  const totalDelta = totalSuggestedBudget - totalCurrentBudget

  const scaleCount  = recos.filter(r => r.type === 'scale').length
  const pauseCount  = recos.filter(r => r.type === 'pause').length
  const reduceCount = recos.filter(r => r.type === 'reduce').length

  return (
    <div className="max-w-4xl mx-auto space-y-6">
      {/* Header */}
      <div>
        <h1 className="text-xl font-semibold text-gray-900 dark:text-zinc-100">Optimizador de presupuesto</h1>
        <p className="text-sm text-gray-500 dark:text-zinc-500 mt-0.5">
          Recomendaciones basadas en datos de los últimos 7 días · {snapshot.snapshot_date}
        </p>
      </div>

      {/* Summary cards */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <div className="bg-white dark:bg-zinc-900 rounded-xl border border-gray-200 dark:border-zinc-800 p-4 shadow-sm">
          <p className="text-xs text-gray-400 dark:text-zinc-500 uppercase tracking-wide font-medium mb-1">Budget actual/día</p>
          <p className="text-2xl font-semibold text-gray-900 dark:text-zinc-100">${Math.round(totalCurrentBudget / 1000)}K</p>
          <p className="text-xs text-gray-400 dark:text-zinc-500 mt-1">ARS total activo</p>
        </div>
        <div className="bg-white dark:bg-zinc-900 rounded-xl border border-gray-200 dark:border-zinc-800 p-4 shadow-sm">
          <p className="text-xs text-gray-400 dark:text-zinc-500 uppercase tracking-wide font-medium mb-1">Budget sugerido/día</p>
          <p className={`text-2xl font-semibold ${totalDelta < 0 ? 'text-emerald-600 dark:text-emerald-400' : totalDelta > 0 ? 'text-blue-600 dark:text-blue-400' : 'text-gray-900 dark:text-zinc-100'}`}>
            ${Math.round(totalSuggestedBudget / 1000)}K
          </p>
          <p className={`text-xs mt-1 font-medium ${totalDelta < 0 ? 'text-emerald-600 dark:text-emerald-400' : totalDelta > 0 ? 'text-blue-600 dark:text-blue-400' : 'text-gray-400'}`}>
            {totalDelta !== 0 ? `${totalDelta > 0 ? '+' : ''}${Math.round(totalDelta / 1000)}K vs actual` : 'Sin cambios'}
          </p>
        </div>
        <div className="bg-white dark:bg-zinc-900 rounded-xl border border-gray-200 dark:border-zinc-800 p-4 shadow-sm">
          <p className="text-xs text-gray-400 dark:text-zinc-500 uppercase tracking-wide font-medium mb-1">Para escalar</p>
          <p className="text-2xl font-semibold text-emerald-600 dark:text-emerald-400">{scaleCount}</p>
          <p className="text-xs text-gray-400 dark:text-zinc-500 mt-1">ad sets</p>
        </div>
        <div className="bg-white dark:bg-zinc-900 rounded-xl border border-gray-200 dark:border-zinc-800 p-4 shadow-sm">
          <p className="text-xs text-gray-400 dark:text-zinc-500 uppercase tracking-wide font-medium mb-1">Para reducir/pausar</p>
          <p className="text-2xl font-semibold text-red-600 dark:text-red-400">{pauseCount + reduceCount}</p>
          <p className="text-xs text-gray-400 dark:text-zinc-500 mt-1">ad sets</p>
        </div>
      </div>

      {/* Recommendations */}
      <div className="space-y-3">
        <h2 className="text-sm font-semibold text-gray-700 dark:text-zinc-300 uppercase tracking-wide">
          Recomendaciones por ad set
        </h2>

        {recos.length === 0 && (
          <div className="text-center py-10 text-gray-500 dark:text-zinc-500 text-sm">
            No hay ad sets activos con datos suficientes para analizar.
          </div>
        )}

        {recos.map(r => {
          const cfg = RECO_CONFIG[r.type]
          const isApplied = applied.has(r.adset_id)

          return (
            <div
              key={r.adset_id}
              className={`rounded-xl border p-4 transition-all ${
                isApplied
                  ? 'border-gray-200 dark:border-zinc-800 bg-gray-50 dark:bg-zinc-800/30 opacity-60'
                  : `border-gray-200 dark:border-zinc-800 bg-white dark:bg-zinc-900`
              } shadow-sm`}
            >
              <div className="flex items-start justify-between gap-3">
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 mb-1.5 flex-wrap">
                    <span className={`inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-semibold ${cfg.bg} ${cfg.darkBg} ${cfg.color}`}>
                      {cfg.icon} {cfg.label}
                    </span>
                    <span className="text-sm font-medium text-gray-800 dark:text-zinc-200 truncate">
                      {r.adset_name}
                    </span>
                  </div>
                  <p className="text-xs text-gray-500 dark:text-zinc-400 mb-3">{r.reason}</p>
                  <div className="flex items-center gap-4 text-xs">
                    <span className="text-gray-400 dark:text-zinc-500">
                      Actual: <span className="font-medium text-gray-700 dark:text-zinc-300">${Math.round(r.current_budget / 1000)}K/día</span>
                    </span>
                    {r.type !== 'pause' && r.type !== 'maintain' && r.type !== 'test' && (
                      <>
                        <span className="text-gray-300 dark:text-zinc-700">→</span>
                        <span className="text-gray-400 dark:text-zinc-500">
                          Sugerido: <span className={`font-medium ${r.delta_ars > 0 ? 'text-emerald-600 dark:text-emerald-400' : 'text-amber-600 dark:text-amber-400'}`}>
                            ${Math.round(r.suggested_budget / 1000)}K/día
                            {r.delta_ars !== 0 && ` (${r.delta_ars > 0 ? '+' : ''}${Math.round(r.delta_ars / 1000)}K)`}
                          </span>
                        </span>
                      </>
                    )}
                    {r.type === 'pause' && (
                      <>
                        <span className="text-gray-300 dark:text-zinc-700">→</span>
                        <span className="font-medium text-red-600 dark:text-red-400">Pausar ad set en Meta</span>
                      </>
                    )}
                  </div>
                </div>
                <button
                  onClick={() => setApplied(prev => new Set([...prev, r.adset_id]))}
                  disabled={isApplied}
                  className="shrink-0 text-xs text-gray-400 dark:text-zinc-500 hover:text-gray-600 dark:hover:text-zinc-300 border border-gray-200 dark:border-zinc-700 rounded-lg px-3 py-1.5 transition-colors disabled:opacity-40"
                >
                  {isApplied ? '✓ Aplicado' : 'Marcar como aplicado'}
                </button>
              </div>
            </div>
          )
        })}
      </div>

      {/* Disclaimer */}
      <div className="bg-amber-50 dark:bg-amber-950/30 border border-amber-200 dark:border-amber-900/50 rounded-xl p-4">
        <p className="text-xs text-amber-700 dark:text-amber-400">
          <strong>Importante:</strong> Estas recomendaciones son orientativas y se basan en los datos de los últimos 7 días. Los cambios de presupuesto deben aplicarse manualmente en Meta Ads Manager. Considerá el contexto estacional y cualquier cambio reciente en creativos antes de actuar.
        </p>
      </div>
    </div>
  )
}
