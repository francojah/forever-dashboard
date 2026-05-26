'use client'

import { useState } from 'react'
import type { Snapshot, PeriodMetrics } from '@/lib/supabase'
import KpiGrid from './KpiGrid'
import AdsetTable from './AdsetTable'
import AlertsPanel from './AlertsPanel'

const BREAKEVEN_CPA = 17500
const AOV = 50000

type Period = 'today' | 'yesterday' | 'last_7d' | 'last_30d'

const PERIOD_LABELS: Record<Period, string> = {
  today:     'Hoy',
  yesterday: 'Ayer',
  last_7d:   'Últimos 7d',
  last_30d:  'Últimos 30d',
}

interface Props {
  snapshot: Snapshot | null
}

export default function DashboardClient({ snapshot }: Props) {
  const [period, setPeriod] = useState<Period>('last_7d')

  if (!snapshot) {
    return (
      <div className="flex flex-col items-center justify-center h-[60vh] text-center">
        <div className="text-5xl mb-4">📭</div>
        <h2 className="text-lg font-semibold text-gray-800 dark:text-zinc-200 mb-2">Sin datos todavía</h2>
        <p className="text-sm text-gray-500 dark:text-zinc-500 max-w-xs">
          El primer sync se va a ejecutar automáticamente a las 7am.
          O podés correrlo manualmente desde GitHub Actions → Daily Meta Ads Sync → Run workflow.
        </p>
      </div>
    )
  }

  // Resolve which data set to show based on selected period
  const periodData: PeriodMetrics | null =
    period === 'last_7d'
      ? { campaigns: snapshot.campaigns, adsets: snapshot.adsets, ads: snapshot.ads, summary: snapshot.summary }
      : (snapshot.periods?.[period] ?? null)

  const { summary, campaigns, adsets, ads } = periodData ?? {
    summary: snapshot.summary,
    campaigns: snapshot.campaigns,
    adsets: snapshot.adsets,
    ads: snapshot.ads,
  }

  // Build adset/campaign maps
  const campMap: Record<string, string> = {}
  campaigns.forEach(c => { campMap[c.id] = c.name })

  const activeAdsets = adsets
    .filter(s => s.status === 'ACTIVE' && (s.spend || 0) > 0)
    .sort((a, b) => (b.spend || 0) - (a.spend || 0))

  return (
    <div className="max-w-6xl mx-auto">

      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 mb-6">
        <div>
          <h1 className="text-xl font-semibold text-gray-900 dark:text-zinc-100">Dashboard Meta Ads</h1>
          <p className="text-sm text-gray-500 dark:text-zinc-500 mt-0.5">
            Sync {snapshot.snapshot_date} · {new Date(snapshot.created_at).toLocaleTimeString('es-AR', { hour: '2-digit', minute: '2-digit' })}
            {!periodData && period !== 'last_7d' && (
              <span className="ml-2 text-amber-500">(sin datos para este período — mostrando 7d)</span>
            )}
          </p>
        </div>
        <div className="flex items-center gap-2">
          {/* Period selector */}
          <div className="flex bg-gray-100 dark:bg-zinc-800 rounded-lg p-0.5 gap-0.5">
            {(Object.keys(PERIOD_LABELS) as Period[]).map(p => (
              <button
                key={p}
                onClick={() => setPeriod(p)}
                className={`px-3 py-1.5 text-xs font-medium rounded-md transition-all ${
                  period === p
                    ? 'bg-white dark:bg-zinc-700 text-gray-900 dark:text-zinc-100 shadow-sm'
                    : 'text-gray-500 dark:text-zinc-400 hover:text-gray-700 dark:hover:text-zinc-200'
                }`}
              >
                {PERIOD_LABELS[p]}
              </button>
            ))}
          </div>
          {/* HOT SALE badge */}
          {(() => {
            const hotSaleEnd = new Date('2026-05-31')
            const now = new Date()
            const diff = Math.ceil((hotSaleEnd.getTime() - now.getTime()) / (1000 * 60 * 60 * 24))
            if (diff > 0 && diff <= 10) {
              return (
                <span className="bg-red-100 dark:bg-red-900/30 text-red-700 dark:text-red-400 text-xs font-medium px-2.5 py-1 rounded-full whitespace-nowrap">
                  🔥 HOT SALE: {diff}d
                </span>
              )
            }
            return null
          })()}
        </div>
      </div>

      {/* KPIs */}
      <KpiGrid summary={summary} breakeven={BREAKEVEN_CPA} aov={AOV} />

      {/* Alertas */}
      {summary.alerts && summary.alerts.length > 0 && (
        <AlertsPanel alerts={summary.alerts} />
      )}

      {/* Ad sets activos */}
      <div className="mt-6">
        <AdsetTable
          adsets={activeAdsets}
          campaignMap={campMap}
          breakeven={BREAKEVEN_CPA}
        />
      </div>

    </div>
  )
}
