'use client'

import { useState } from 'react'
import type { Snapshot, PeriodMetrics } from '@/lib/supabase'
import AdsetTable from '@/components/Dashboard/AdsetTable'
import PresupuestoClient from '@/components/Presupuesto/PresupuestoClient'

const BREAKEVEN_CPA = 17500

type Period = 'today' | 'yesterday' | 'last_7d' | 'last_30d'
const PERIOD_LABELS: Record<Period, string> = {
  today:     'Hoy',
  yesterday: 'Ayer',
  last_7d:   '7 días',
  last_30d:  '30 días',
}
const PERIOD_SHORT: Record<Period, string> = {
  today: 'hoy', yesterday: 'ayer', last_7d: '7d', last_30d: '30d',
}

type Tab = 'adsets' | 'presupuesto'

interface Props {
  snapshot: Snapshot | null
}

export default function CampaniasClient({ snapshot }: Props) {
  const [tab, setTab] = useState<Tab>('adsets')
  const [period, setPeriod] = useState<Period>('last_7d')

  if (!snapshot) {
    return (
      <div className="flex flex-col items-center justify-center h-[50vh] text-center">
        <div className="text-5xl mb-4">📭</div>
        <h2 className="text-lg font-semibold text-gray-800 dark:text-zinc-200 mb-2">Sin datos todavía</h2>
        <p className="text-sm text-gray-500 dark:text-zinc-500 max-w-xs">
          Ejecutá un sync desde el Dashboard para importar los datos de Meta.
        </p>
      </div>
    )
  }

  const periodData: PeriodMetrics =
    period === 'last_7d'
      ? { campaigns: snapshot.campaigns, adsets: snapshot.adsets, ads: snapshot.ads, summary: snapshot.summary }
      : (snapshot.periods?.[period] ?? { campaigns: snapshot.campaigns, adsets: snapshot.adsets, ads: snapshot.ads, summary: snapshot.summary })

  const { campaigns, adsets, ads } = periodData

  const campMap: Record<string, string> = {}
  campaigns.forEach(c => { campMap[c.id] = c.name })

  const activeAdsets = adsets
    .filter(s => s.status === 'ACTIVE' && (s.spend || 0) > 0)
    .sort((a, b) => (b.spend || 0) - (a.spend || 0))

  const activeAdsetIds = new Set(activeAdsets.map(s => s.id))
  const activeAds = ads
    .filter(a => activeAdsetIds.has(a.adset_id) && (a.spend || 0) > 0)
    .sort((a, b) => (b.spend || 0) - (a.spend || 0))

  return (
    <div className="max-w-6xl mx-auto">

      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 mb-6">
        <div>
          <h1 className="text-xl font-semibold text-gray-900 dark:text-zinc-100">Campañas</h1>
          <p className="text-sm text-gray-500 dark:text-zinc-500 mt-0.5">
            Ad sets, creativos y optimización de presupuesto · {snapshot.snapshot_date}
          </p>
        </div>

        {/* Period tabs — solo para Ad Sets */}
        {tab === 'adsets' && (
          <div className="flex bg-gray-100 dark:bg-zinc-800 rounded-lg p-0.5 gap-0.5">
            {(Object.keys(PERIOD_LABELS) as Period[]).map(p => (
              <button key={p} onClick={() => setPeriod(p)}
                className={'px-3 py-1.5 text-xs font-medium rounded-md transition-all ' + (
                  period === p
                    ? 'bg-white dark:bg-zinc-700 text-gray-900 dark:text-zinc-100 shadow-sm'
                    : 'text-gray-500 dark:text-zinc-400 hover:text-gray-700 dark:hover:text-zinc-200'
                )}>
                {PERIOD_LABELS[p]}
              </button>
            ))}
          </div>
        )}
      </div>

      {/* Tabs */}
      <div className="flex gap-1 border-b border-gray-200 dark:border-zinc-800 mb-6">
        {([['adsets', 'Ad Sets & Creativos'], ['presupuesto', 'Presupuesto']] as [Tab, string][]).map(([t, label]) => (
          <button key={t} onClick={() => setTab(t)}
            className={'px-4 py-2.5 text-sm font-medium border-b-2 transition-all -mb-px ' + (
              tab === t
                ? 'border-indigo-500 text-indigo-600 dark:text-indigo-400'
                : 'border-transparent text-gray-500 dark:text-zinc-400 hover:text-gray-700 dark:hover:text-zinc-200'
            )}>
            {label}
          </button>
        ))}
      </div>

      {/* Tab content */}
      {tab === 'adsets' && (
        <AdsetTable
          adsets={activeAdsets}
          ads={activeAds}
          campaignMap={campMap}
          breakeven={BREAKEVEN_CPA}
          period={PERIOD_SHORT[period]}
        />
      )}

      {tab === 'presupuesto' && (
        <PresupuestoClient snapshot={snapshot} />
      )}

    </div>
  )
}
