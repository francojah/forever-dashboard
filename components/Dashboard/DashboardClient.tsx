'use client'

import { useState, useCallback } from 'react'
import { useRouter } from 'next/navigation'
import type { Snapshot, PeriodMetrics, TNSnapshot } from '@/lib/supabase'
import KpiGrid from './KpiGrid'
import AdsetTable from './AdsetTable'
import AlertsPanel from './AlertsPanel'

const BREAKEVEN_CPA = 17500

type Period = 'today' | 'yesterday' | 'last_7d' | 'last_30d' | 'custom'

const PERIOD_LABELS: Record<Period, string> = {
  today:     'Hoy',
  yesterday: 'Ayer',
  last_7d:   'Ultimos 7d',
  last_30d:  'Ultimos 30d',
  custom:    'Personalizado',
}

const PERIOD_SHORT: Record<Period, string> = {
  today:     'hoy',
  yesterday: 'ayer',
  last_7d:   '7d',
  last_30d:  '30d',
  custom:    'custom',
}

interface Props {
  snapshot: Snapshot | null
  tnSnapshot: TNSnapshot | null
}

export default function DashboardClient({ snapshot, tnSnapshot }: Props) {
  const [period, setPeriod] = useState<Period>('last_7d')
  const [syncing, setSyncing] = useState(false)
  const [lastSynced, setLastSynced] = useState<string | null>(null)
  const [syncError, setSyncError] = useState<string | null>(null)
  const router = useRouter()

  // Custom period state
  const today = new Date().toISOString().split('T')[0]
  const [customFrom, setCustomFrom] = useState(today)
  const [customTo, setCustomTo] = useState(today)
  const [customData, setCustomData] = useState<PeriodMetrics | null>(null)
  const [customTnRevenue, setCustomTnRevenue] = useState<number | null>(null)
  const [customLoading, setCustomLoading] = useState(false)
  const [customError, setCustomError] = useState<string | null>(null)

  const triggerSync = useCallback(async () => {
    setSyncing(true)
    setSyncError(null)
    try {
      const [metaRes, tnRes] = await Promise.all([
        fetch('/api/sync', { method: 'POST' }),
        fetch('/api/sync-tiendanube', { method: 'POST' }),
      ])
      const metaData = await metaRes.json()
      const tnData = await tnRes.json()
      if (metaData.error) throw new Error('Meta: ' + metaData.error)
      if (tnData.error) throw new Error('TN: ' + tnData.error)
      const now = new Date().toLocaleTimeString('es-AR', { hour: '2-digit', minute: '2-digit' })
      setLastSynced(now)
      router.refresh()
    } catch (e) {
      setSyncError(e instanceof Error ? e.message : 'Error al sincronizar')
    } finally {
      setSyncing(false)
    }
  }, [router])

  const fetchCustom = useCallback(async () => {
    setCustomLoading(true)
    setCustomError(null)
    try {
      const res = await fetch('/api/sync-custom?from=' + customFrom + '&to=' + customTo)
      const data = await res.json()
      if (data.error) throw new Error(data.error)
      setCustomData(data.meta)
      setCustomTnRevenue(data.tn_revenue ?? null)
    } catch (e) {
      setCustomError(e instanceof Error ? e.message : 'Error')
    } finally {
      setCustomLoading(false)
    }
  }, [customFrom, customTo])

  if (!snapshot) {
    return (
      <div className="flex flex-col items-center justify-center h-[60vh] text-center">
        <div className="text-5xl mb-4">📭</div>
        <h2 className="text-lg font-semibold text-gray-800 dark:text-zinc-200 mb-2">Sin datos todavia</h2>
        <p className="text-sm text-gray-500 dark:text-zinc-500 max-w-xs">
          El primer sync se va a ejecutar automaticamente a las 7am.
          O podes correrlo manualmente con el boton Actualizar.
        </p>
      </div>
    )
  }

  // Period data selection
  const periodData: PeriodMetrics | null =
    period === 'custom'   ? customData :
    period === 'last_7d'  ? { campaigns: snapshot.campaigns, adsets: snapshot.adsets, ads: snapshot.ads, summary: snapshot.summary } :
    (snapshot.periods?.[period] ?? null)

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

  const syncTime = lastSynced
    ?? new Date(snapshot.created_at).toLocaleTimeString('es-AR', { hour: '2-digit', minute: '2-digit' })

  // TN revenue per period
  const tnRevenue: number | null =
    period === 'custom'    ? customTnRevenue :
    period === 'today'     ? (tnSnapshot?.summary_today?.total_revenue ?? null) :
    period === 'yesterday' ? (tnSnapshot?.summary_yesterday?.total_revenue ?? null) :
    period === 'last_7d'   ? (tnSnapshot?.summary_7d?.total_revenue ?? null) :
    period === 'last_30d'  ? (tnSnapshot?.summary_30d?.total_revenue ?? null) :
    null

  // Real ROAS = TN revenue / Meta spend for the same period
  const metaSpend = summary.total_spend_7d || 0
  const realRoas = tnRevenue != null && metaSpend > 0
    ? parseFloat((tnRevenue / metaSpend).toFixed(2))
    : null

  return (
    <div className="max-w-6xl mx-auto">

      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 mb-6">
        <div>
          <h1 className="text-xl font-semibold text-gray-900 dark:text-zinc-100">Dashboard Meta Ads</h1>
          <p className="text-sm mt-0.5">
            {syncError
              ? <span className="text-red-500">Error: {syncError}</span>
              : <span className="text-gray-500 dark:text-zinc-500">
                  {lastSynced ? 'Actualizado - ' : 'Sync '}{snapshot.snapshot_date} - {syncTime}
                </span>
            }
            {!hasPeriodData && period !== 'last_7d' && period !== 'custom' && (
              <span className="ml-2 text-xs text-amber-500">
                (sin datos para {PERIOD_LABELS[period]} - ejecuta un sync primero)
              </span>
            )}
          </p>
        </div>

        <div className="flex items-center gap-2">
          <button
            onClick={triggerSync}
            disabled={syncing}
            title="Actualizar Meta + Tiendanube"
            className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium border border-gray-200 dark:border-zinc-700 rounded-lg text-gray-600 dark:text-zinc-400 hover:bg-gray-100 dark:hover:bg-zinc-800 disabled:opacity-50 transition-all"
          >
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"
              className={'w-3.5 h-3.5 ' + (syncing ? 'animate-spin' : '')}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M16.023 9.348h4.992v-.001M2.985 19.644v-4.992m0 0h4.992m-4.993 0l3.181 3.183a8.25 8.25 0 0013.803-3.7M4.031 9.865a8.25 8.25 0 0113.803-3.7l3.181 3.182m0-4.991v4.99" />
            </svg>
            {syncing ? 'Actualizando...' : 'Actualizar'}
          </button>

          <div className="flex bg-gray-100 dark:bg-zinc-800 rounded-lg p-0.5 gap-0.5">
            {(Object.keys(PERIOD_LABELS) as Period[]).map(p => (
              <button
                key={p}
                onClick={() => setPeriod(p)}
                className={'px-3 py-1.5 text-xs font-medium rounded-md transition-all ' + (
                  period === p
                    ? 'bg-white dark:bg-zinc-700 text-gray-900 dark:text-zinc-100 shadow-sm'
                    : 'text-gray-500 dark:text-zinc-400 hover:text-gray-700 dark:hover:text-zinc-200'
                )}
              >
                {PERIOD_LABELS[p]}
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* Custom date picker */}
      {period === 'custom' && (
        <div className="mb-4 flex flex-wrap items-end gap-3 bg-white dark:bg-zinc-900 border border-gray-200 dark:border-zinc-800 rounded-xl px-4 py-3 shadow-sm">
          <div>
            <label className="block text-xs text-gray-500 dark:text-zinc-400 mb-1">Desde</label>
            <input type="date" value={customFrom} onChange={e => setCustomFrom(e.target.value)}
              className="text-sm bg-gray-50 dark:bg-zinc-800 border border-gray-200 dark:border-zinc-700 rounded-lg px-3 py-1.5 text-gray-900 dark:text-zinc-100 focus:outline-none focus:ring-2 focus:ring-indigo-400" />
          </div>
          <div>
            <label className="block text-xs text-gray-500 dark:text-zinc-400 mb-1">Hasta</label>
            <input type="date" value={customTo} onChange={e => setCustomTo(e.target.value)}
              className="text-sm bg-gray-50 dark:bg-zinc-800 border border-gray-200 dark:border-zinc-700 rounded-lg px-3 py-1.5 text-gray-900 dark:text-zinc-100 focus:outline-none focus:ring-2 focus:ring-indigo-400" />
          </div>
          <button onClick={fetchCustom} disabled={customLoading}
            className="px-4 py-1.5 text-xs font-medium bg-indigo-600 hover:bg-indigo-700 disabled:opacity-50 text-white rounded-lg transition-all">
            {customLoading ? 'Consultando...' : 'Consultar'}
          </button>
          {customError && <p className="text-xs text-red-500">{customError}</p>}
          {!customData && !customLoading && !customError && (
            <p className="text-xs text-gray-400 dark:text-zinc-600">Selecciona un rango y presiona Consultar</p>
          )}
        </div>
      )}

      {/* Attribution note for Hoy */}
      {period === 'today' && hasPeriodData && (
        <div className="mb-4 flex items-start gap-2 bg-amber-50 dark:bg-amber-950/30 border border-amber-200 dark:border-amber-900/50 rounded-xl px-4 py-2.5">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="w-4 h-4 text-amber-500 shrink-0 mt-0.5">
            <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v3.75m-9.303 3.376c-.866 1.5.217 3.374 1.948 3.374h14.71c1.73 0 2.813-1.874 1.948-3.374L13.949 3.378c-.866-1.5-3.032-1.5-3.898 0L2.697 16.126zM12 15.75h.007v.008H12v-.008z" />
          </svg>
          <p className="text-xs text-amber-700 dark:text-amber-400">
            <strong>ROAS real vs reportado:</strong> El ROAS reportado por Meta incluye conversiones de los ultimos 7d (ventana de atribucion). El ROAS real = Ventas TN del dia / Gasto Meta del dia.
            {realRoas != null ? ' Hoy: ' + realRoas.toFixed(2) + 'x real vs ' + (summary.blended_roas?.toFixed(2) ?? '--') + 'x reportado.' : ''}
          </p>
        </div>
      )}

      {period === 'yesterday' && hasPeriodData && (
        <div className="mb-4 flex items-start gap-2 bg-amber-50 dark:bg-amber-950/30 border border-amber-200 dark:border-amber-900/50 rounded-xl px-4 py-2.5">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="w-4 h-4 text-amber-500 shrink-0 mt-0.5">
            <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v3.75m-9.303 3.376c-.866 1.5.217 3.374 1.948 3.374h14.71c1.73 0 2.813-1.874 1.948-3.374L13.949 3.378c-.866-1.5-3.032-1.5-3.898 0L2.697 16.126zM12 15.75h.007v.008H12v-.008z" />
          </svg>
          <p className="text-xs text-amber-700 dark:text-amber-400">
            <strong>Ventana de atribucion:</strong> El ROAS de ayer puede incluir conversiones de dias anteriores atribuidas por Meta.
          </p>
        </div>
      )}

      {/* KPIs */}
      {(period !== 'custom' || customData) && (
        <KpiGrid
          summary={summary}
          breakeven={BREAKEVEN_CPA}
          period={PERIOD_SHORT[period]}
          tnRevenue={tnRevenue}
          realRoas={realRoas}
        />
      )}

      {summary.alerts && summary.alerts.length > 0 && (
        <AlertsPanel alerts={summary.alerts} />
      )}

      <div className="mt-6">
        <AdsetTable
          adsets={activeAdsets}
          campaignMap={campMap}
          breakeven={BREAKEVEN_CPA}
          period={PERIOD_SHORT[period]}
        />
      </div>

    </div>
  )
}
