'use client'

import { useState, useCallback } from 'react'
import { useRouter } from 'next/navigation'
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

// Short label for KPI subtitles (e.g. "hoy", "7d", "30d")
const PERIOD_SHORT: Record<Period, string> = {
  today:     'hoy',
  yesterday: 'ayer',
  last_7d:   '7d',
  last_30d:  '30d',
}

interface Props {
  snapshot: Snapshot | null
}

export default function DashboardClient({ snapshot }: Props) {
  const [period, setPeriod] = useState<Period>('last_7d')
  const [syncing, setSyncing] = useState(false)
  const [lastSynced, setLastSynced] = useState<string | null>(null)
  const [syncError, setSyncError] = useState<string | null>(null)
  const router = useRouter()

  const triggerSync = useCallback(async () => {
    setSyncing(true)
    setSyncError(null)
    try {
      const res = await fetch('/api/sync', { method: 'POST' })
      const data = await res.json()
      if (data.error) throw new Error(data.error)
      const now = new Date().toLocaleTimeString('es-AR', { hour: '2-digit', minute: '2-digit' })
      setLastSynced(now)
      router.refresh()
    } catch (e) {
      setSyncError(e instanceof Error ? e.message : 'Error al sincronizar')
    } finally {
      setSyncing(false)
    }
  }, [router])

  if (!snapshot) {
    return (
      <div className="flex flex-col items-center justify-center h-[60vh] text-center">
        <div className="text-5xl mb-4">📭</div>
        <h2 className="text-lg font-semibold text-gray-800 dark:text-zinc-200 mb-2">Sin datos todavía</h2>
        <p className="text-sm text-gray-500 dark:text-zinc-500 max-w-xs">
          El primer sync se va a ejecutar automáticamente a las 7am.
          O podés correrlo manualmente con el botón Actualizar.
        </p>
      </div>
    )
  }

  // Resolve which data set to show based on selected period
  const periodData: PeriodMetrics | null =
    period === 'last_7d'
      ? { campaigns: snapshot.campaigns, adsets: snapshot.adsets, ads: snapshot.ads, summary: snapshot.summary }
      : (snapshot.periods?.[period] ?? null)

  const hasPeriodData = periodData !== null
  const { summary, campaigns, adsets, ads } = periodData ?? {
    summary: snapshot.summary,
    campaigns: snapshot.campaigns,
    adsets: snapshot.adsets,
    ads: snapshot.ads,
  }

  const campMap: Record<string, string> = {}
  campaigns.forEach(c => { campMap[c.id] = c.name })

  const activeAdsets = adsets
    .filter(s => s.status === 'ACTIVE' && (s.spend || 0) > 0)
    .sort((a, b) => (b.spend || 0) - (a.spend || 0))

  // Sync timestamp: prefer client-tracked time (freshest), fall back to snapshot
  const syncTime = lastSynced
    ?? new Date(snapshot.created_at).toLocaleTimeString('es-AR', { hour: '2-digit', minute: '2-digit' })

  const isShortPeriod = period === 'today' || period === 'yesterday'

  return (
    <div className="max-w-6xl mx-auto">

      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 mb-6">
        <div>
          <h1 className="text-xl font-semibold text-gray-900 dark:text-zinc-100">Dashboard Meta Ads</h1>
          <p className="text-sm mt-0.5">
            {syncError
              ? <span className="text-red-500">✗ {syncError}</span>
              : <span className="text-gray-500 dark:text-zinc-500">
                  {lastSynced ? '✓ Actualizado · ' : 'Sync '}{snapshot.snapshot_date} · {syncTime}
                </span>
            }
            {!hasPeriodData && period !== 'last_7d' && (
              <span className="ml-2 text-xs text-amber-500">
                (sin datos para {PERIOD_LABELS[period]} — ejecutá un sync primero)
              </span>
            )}
          </p>
        </div>

        <div className="flex items-center gap-2">
          {/* Sync button */}
          <button
            onClick={triggerSync}
            disabled={syncing}
            title="Actualizar datos ahora"
            className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium border border-gray-200 dark:border-zinc-700 rounded-lg text-gray-600 dark:text-zinc-400 hover:bg-gray-100 dark:hover:bg-zinc-800 disabled:opacity-50 transition-all"
          >
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"
              className={`w-3.5 h-3.5 ${syncing ? 'animate-spin' : ''}`}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M16.023 9.348h4.992v-.001M2.985 19.644v-4.992m0 0h4.992m-4.993 0l3.181 3.183a8.25 8.25 0 0013.803-3.7M4.031 9.865a8.25 8.25 0 0113.803-3.7l3.181 3.182m0-4.991v4.99" />
            </svg>
            {syncing ? 'Actualizando…' : 'Actualizar'}
          </button>

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

      {/* Attribution note for short periods */}
      {isShortPeriod && hasPeriodData && (
        <div className="mb-4 flex items-start gap-2 bg-amber-50 dark:bg-amber-950/30 border border-amber-200 dark:border-amber-900/50 rounded-xl px-4 py-2.5">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="w-4 h-4 text-amber-500 shrink-0 mt-0.5">
            <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v3.75m-9.303 3.376c-.866 1.5.217 3.374 1.948 3.374h14.71c1.73 0 2.813-1.874 1.948-3.374L13.949 3.378c-.866-1.5-3.032-1.5-3.898 0L2.697 16.126zM12 15.75h.007v.008H12v-.008z" />
          </svg>
          <p className="text-xs text-amber-700 dark:text-amber-400">
            <strong>Ventana de atribución:</strong> El ROAS y las compras de hoy/ayer pueden incluir conversiones de los últimos 7 días atribuidas a esos anuncios por Meta. Son datos reales de Meta, pero reflejan la ventana de atribución, no solo las ventas del día.
          </p>
        </div>
      )}

      {/* KPIs */}
      <KpiGrid summary={summary} breakeven={BREAKEVEN_CPA} aov={AOV} period={PERIOD_SHORT[period]} />

      {/* Alertas */}
      {summary.alerts && summary.alerts.length > 0 && (
        <AlertsPanel alerts={summary.alerts} />
      )}

      {/* Ad sets */}
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
