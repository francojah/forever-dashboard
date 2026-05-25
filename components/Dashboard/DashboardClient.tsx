'use client'

import { useState } from 'react'
import type { Snapshot } from '@/lib/supabase'
import KpiGrid from './KpiGrid'
import AdsetTable from './AdsetTable'
import CreativeRanking from './CreativeRanking'
import AlertsPanel from './AlertsPanel'

const BREAKEVEN_CPA = 17500
const AOV = 50000

interface Props {
  snapshot: Snapshot | null
  availableDates: string[]
}

export default function DashboardClient({ snapshot, availableDates }: Props) {
  const [selectedDate, setSelectedDate] = useState(availableDates[0] || '')

  if (!snapshot) {
    return (
      <div className="flex flex-col items-center justify-center h-[60vh] text-center">
        <div className="text-5xl mb-4">📭</div>
        <h2 className="text-lg font-semibold text-gray-800 mb-2">Sin datos todavía</h2>
        <p className="text-sm text-gray-500 max-w-xs">
          El primer sync se va a ejecutar automáticamente a las 7am.
          O podés correrlo manualmente desde GitHub Actions → Daily Meta Ads Sync → Run workflow.
        </p>
      </div>
    )
  }

  const { summary, campaigns, adsets, ads } = snapshot

  // Agrupar ads por adset
  const adsByAdset: Record<string, typeof ads> = {}
  ads.forEach(ad => {
    if (!adsByAdset[ad.adset_id]) adsByAdset[ad.adset_id] = []
    adsByAdset[ad.adset_id].push(ad)
  })

  // Enriquecer adsets con campaign name
  const campMap: Record<string, string> = {}
  campaigns.forEach(c => { campMap[c.id] = c.name })

  const activeAdsets = adsets
    .filter(s => s.status === 'ACTIVE' && (s.spend || 0) > 0)
    .sort((a, b) => (b.spend || 0) - (a.spend || 0))

  return (
    <div className="max-w-6xl mx-auto">

      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-xl font-semibold text-gray-900">Dashboard Meta Ads</h1>
          <p className="text-sm text-gray-500 mt-0.5">
            Datos {snapshot.snapshot_date} · última sync {new Date(snapshot.created_at).toLocaleTimeString('es-AR', { hour: '2-digit', minute: '2-digit' })}
          </p>
        </div>
        <div className="flex items-center gap-3">
          {/* Selector de fecha */}
          <select
            value={selectedDate}
            onChange={e => setSelectedDate(e.target.value)}
            className="text-sm border border-gray-200 rounded-lg px-3 py-1.5 bg-white text-gray-700 focus:outline-none"
          >
            {availableDates.map(d => (
              <option key={d} value={d}>{d}</option>
            ))}
          </select>
          {/* Badge HOT SALE countdown */}
          {(() => {
            const hotSaleEnd = new Date('2026-05-31')
            const today = new Date()
            const diff = Math.ceil((hotSaleEnd.getTime() - today.getTime()) / (1000 * 60 * 60 * 24))
            if (diff > 0 && diff <= 10) {
              return (
                <span className="bg-red-100 text-red-700 text-xs font-medium px-2.5 py-1 rounded-full">
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
        <h2 className="text-sm font-semibold text-gray-700 uppercase tracking-wide mb-3">
          Ad sets activos
        </h2>
        <AdsetTable
          adsets={activeAdsets}
          campaignMap={campMap}
          breakeven={BREAKEVEN_CPA}
        />
      </div>

      {/* Ranking de creativos */}
      <div className="mt-6">
        <h2 className="text-sm font-semibold text-gray-700 uppercase tracking-wide mb-3">
          Competencia de creativos por ad set
        </h2>
        <CreativeRanking
          adsets={activeAdsets.slice(0, 6)}
          adsByAdset={adsByAdset}
          campaignMap={campMap}
          breakeven={BREAKEVEN_CPA}
        />
      </div>

    </div>
  )
}
