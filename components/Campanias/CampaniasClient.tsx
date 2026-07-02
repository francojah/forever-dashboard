'use client'

import { useState } from 'react'
import type { Snapshot, PeriodMetrics, Adset } from '@/lib/supabase'
import AdsetTable from '@/components/Dashboard/AdsetTable'
import PresupuestoClient from '@/components/Presupuesto/PresupuestoClient'
import { ExportButton } from '@/components/ui/ExportButton'
import Funnel from '@/components/Dashboard/Funnel'

// BREAKEVEN real Forever Basics: merch $19.5K + envío $5.75K + TN 2.5% $1.44K + packaging $350 ≈ $27K/orden
// AOV $57.5K → margen 53% → BE_CPA = $57.5K − $27K = $30.5K
const BREAKEVEN_CPA = 30462
const ROAS_MIN      = 1.77

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

// ── Helpers ───────────────────────────────────────────────────────
const TRAFFIC_GOALS = ['LINK_CLICKS', 'LANDING_PAGE_VIEWS', 'REACH', 'BRAND_AWARENESS', 'POST_ENGAGEMENT']
function isTraffic(a: Adset, campMap: Record<string, string>) {
  if (TRAFFIC_GOALS.includes(a.optimization_goal || '')) return true
  const n = (campMap[a.campaign_id] || '').toLowerCase()
  return n.includes('trafico') || n.includes('tráfico') || n.includes('traffic')
}

// ── Mini budget bar ───────────────────────────────────────────────
function BudgetBar({ label, spend, budget, color, fraction }: {
  label: string; spend: number; budget: number; color: string; fraction: number
}) {
  const pct = Math.round(fraction * 100)
  return (
    <div className="flex items-center gap-3">
      <div className="w-24 shrink-0 text-xs text-gray-500 dark:text-zinc-400 truncate">{label}</div>
      <div className="flex-1 h-2 bg-gray-100 dark:bg-zinc-800 rounded-full overflow-hidden">
        <div className={`h-full rounded-full ${color} transition-all`} style={{ width: pct + '%' }} />
      </div>
      <div className="text-xs tabular-nums text-right w-24 shrink-0">
        <span className="text-gray-700 dark:text-zinc-200 font-medium">${Math.round(spend / 1000)}K</span>
        {budget > 0 && <span className="text-gray-400 dark:text-zinc-600 ml-1">/ ${Math.round(budget / 1000)}K</span>}
      </div>
      <div className="text-xs text-gray-400 dark:text-zinc-500 w-8 text-right shrink-0">{pct}%</div>
    </div>
  )
}

// ── Campaign Overview section ─────────────────────────────────────
function CampaignOverview({ adsets, campMap, period }: {
  adsets: Adset[]; campMap: Record<string, string>; period: Period
}) {
  if (adsets.length === 0) return null

  const totalSpend   = adsets.reduce((s, a) => s + (a.spend || 0), 0)
  const totalBudget  = adsets.filter(a => a.status === 'ACTIVE').reduce((s, a) => s + (a.daily_budget || 0), 0)
  const activeCount  = adsets.filter(a => a.status === 'ACTIVE').length
  const pausedCount  = adsets.filter(a => a.status === 'PAUSED').length

  const convAdsets    = adsets.filter(a => !isTraffic(a, campMap))
  const trafficAdsets = adsets.filter(a =>  isTraffic(a, campMap))

  const convSpend    = convAdsets.reduce((s, a) => s + (a.spend || 0), 0)
  const convBudget   = convAdsets.filter(a => a.status === 'ACTIVE').reduce((s, a) => s + (a.daily_budget || 0), 0)
  const convPurch    = convAdsets.reduce((s, a) => s + (a.results || 0), 0)
  const trafficSpend = trafficAdsets.reduce((s, a) => s + (a.spend || 0), 0)
  const trafficBudg  = trafficAdsets.filter(a => a.status === 'ACTIVE').reduce((s, a) => s + (a.daily_budget || 0), 0)

  // Blended ROAS and CPA (weighted)
  const roasAdsets   = convAdsets.filter(a => a.roas && a.spend)
  const blendedRoas  = roasAdsets.length > 0
    ? roasAdsets.reduce((s, a) => s + (a.roas! * (a.spend || 0)), 0) / roasAdsets.reduce((s, a) => s + (a.spend || 0), 0)
    : null
  const blendedCPA   = convPurch > 0 ? convSpend / convPurch : null

  // Health counts
  const greenCount  = adsets.filter(a => {
    if (a.status !== 'ACTIVE' || !a.spend || a.spend < 500) return false
    const cpa = a.cost_per_result; const roas = a.roas; const freq = a.frequency
    if (freq && freq >= 2.5) return false
    if (cpa && cpa > BREAKEVEN_CPA) return false
    if (roas && roas < ROAS_MIN && a.spend > 2000) return false
    return true
  }).length
  const redCount = adsets.filter(a => {
    if (a.status !== 'ACTIVE' || !a.spend || a.spend < 500) return false
    const cpa = a.cost_per_result; const freq = a.frequency
    return (freq && freq >= 4) || (cpa && cpa > BREAKEVEN_CPA * 1.3)
  }).length
  const warnCount = activeCount - greenCount - redCount

  const periodLabel = PERIOD_LABELS[period]

  return (
    <div className="bg-white dark:bg-zinc-900 rounded-2xl border border-gray-200 dark:border-zinc-800 shadow-sm p-5 mb-6">
      <div className="flex items-center justify-between mb-5 flex-wrap gap-2">
        <h2 className="text-sm font-semibold text-gray-700 dark:text-zinc-300 uppercase tracking-wide">
          Resumen de campaña — {periodLabel}
        </h2>
        <div className="flex items-center gap-3 text-xs">
          <span className="flex items-center gap-1.5"><span className="w-2 h-2 rounded-full bg-emerald-400 inline-block" /><span className="text-gray-500 dark:text-zinc-400">Saludable: {greenCount}</span></span>
          <span className="flex items-center gap-1.5"><span className="w-2 h-2 rounded-full bg-amber-400 inline-block" /><span className="text-gray-500 dark:text-zinc-400">Atención: {warnCount}</span></span>
          <span className="flex items-center gap-1.5"><span className="w-2 h-2 rounded-full bg-red-400 inline-block" /><span className="text-gray-500 dark:text-zinc-400">Crítico: {redCount}</span></span>
        </div>
      </div>

      {/* Top KPI row */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 mb-5">
        <div>
          <p className="text-[11px] text-gray-400 dark:text-zinc-500 uppercase tracking-wide mb-1">Gasto total</p>
          <p className="text-xl font-semibold text-gray-900 dark:text-zinc-100">${Math.round(totalSpend / 1000)}K</p>
          {totalBudget > 0 && <p className="text-xs text-gray-400 dark:text-zinc-500 mt-0.5">Budget: ${Math.round(totalBudget / 1000)}K/día</p>}
        </div>
        <div>
          <p className="text-[11px] text-gray-400 dark:text-zinc-500 uppercase tracking-wide mb-1">ROAS blend</p>
          <p className={`text-xl font-semibold ${period === 'today' ? 'text-gray-400 dark:text-zinc-600' : blendedRoas ? (blendedRoas >= ROAS_MIN ? 'text-emerald-600 dark:text-emerald-400' : 'text-red-500') : 'text-gray-400 dark:text-zinc-600'}`}>
            {period === 'today' ? '—' : blendedRoas ? blendedRoas.toFixed(2) + 'x' : '—'}
          </p>
          <p className="text-xs text-gray-400 dark:text-zinc-500 mt-0.5">
            {period === 'today' ? 'No disp. intraday (atrib. 7d)' : `mín ${ROAS_MIN}x`}
          </p>
        </div>
        <div>
          <p className="text-[11px] text-gray-400 dark:text-zinc-500 uppercase tracking-wide mb-1">CPA blend</p>
          <p className={`text-xl font-semibold ${blendedCPA ? (blendedCPA <= BREAKEVEN_CPA ? 'text-emerald-600 dark:text-emerald-400' : 'text-red-500') : 'text-gray-400 dark:text-zinc-600'}`}>
            {blendedCPA ? '$' + Math.round(blendedCPA / 1000) + 'K' : '—'}
          </p>
          <p className="text-xs text-gray-400 dark:text-zinc-500 mt-0.5">BE ${Math.round(BREAKEVEN_CPA / 1000)}K</p>
        </div>
        <div>
          <p className="text-[11px] text-gray-400 dark:text-zinc-500 uppercase tracking-wide mb-1">Ad sets</p>
          <p className="text-xl font-semibold text-gray-900 dark:text-zinc-100">{activeCount}</p>
          <p className="text-xs text-gray-400 dark:text-zinc-500 mt-0.5">{pausedCount > 0 ? `+${pausedCount} pausados` : 'activos'}</p>
        </div>
      </div>

      {/* Budget distribution bars */}
      {totalSpend > 0 && (
        <div>
          <p className="text-[11px] text-gray-400 dark:text-zinc-500 uppercase tracking-wide mb-3">Distribución de inversión</p>
          <div className="space-y-2.5">
            {convSpend > 0 && (
              <BudgetBar
                label="Conversión"
                spend={convSpend}
                budget={convBudget}
                color="bg-blue-500 dark:bg-blue-400"
                fraction={totalSpend > 0 ? convSpend / totalSpend : 0}
              />
            )}
            {trafficSpend > 0 && (
              <BudgetBar
                label="Tráfico web"
                spend={trafficSpend}
                budget={trafficBudg}
                color="bg-violet-400 dark:bg-violet-500"
                fraction={totalSpend > 0 ? trafficSpend / totalSpend : 0}
              />
            )}
          </div>
          {convSpend > 0 && trafficSpend > 0 && (
            <p className="text-xs text-gray-400 dark:text-zinc-500 mt-2.5">
              {Math.round(convSpend / totalSpend * 100)}% en conversión · {Math.round(trafficSpend / totalSpend * 100)}% en tráfico
            </p>
          )}
        </div>
      )}
    </div>
  )
}

// ── Main component ────────────────────────────────────────────────
export default function CampaniasClient({ snapshot }: Props) {
  const [tab, setTab]       = useState<Tab>('adsets')
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

        {/* Period selector + export — only for Ad Sets tab */}
        {tab === 'adsets' && (
          <div className="flex items-center gap-2">
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
            <ExportButton
              rows={adsets as unknown as Record<string, unknown>[]}
              filename={`campanias_${PERIOD_SHORT[period]}`}
              columns={[
                { key: 'name', label: 'Ad set' },
                { key: 'status', label: 'Estado' },
                { key: 'spend', label: 'Gasto' },
                { key: 'results', label: 'Compras' },
                { key: 'cost_per_result', label: 'CPA' },
                { key: 'roas', label: 'ROAS' },
                { key: 'ctr', label: 'CTR' },
                { key: 'frequency', label: 'Frecuencia' },
                { key: 'daily_budget', label: 'Budget diario' },
              ]}
            />
          </div>
        )}
      </div>

      {/* Tab nav */}
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
        <>
          <CampaignOverview adsets={adsets} campMap={campMap} period={period} />
          <div className="mb-6">
            <Funnel
              impressions={adsets.reduce((s, a) => s + (a.impressions || 0), 0)}
              clicks={adsets.reduce((s, a) => s + (a.clicks || 0), 0)}
              purchases={adsets.reduce((s, a) => s + (a.results || 0), 0)}
              spend={adsets.reduce((s, a) => s + (a.spend || 0), 0)}
            />
          </div>
          <AdsetTable
            adsets={activeAdsets}
            ads={activeAds}
            campaignMap={campMap}
            breakeven={BREAKEVEN_CPA}
            period={PERIOD_SHORT[period]}
          />
        </>
      )}

      {tab === 'presupuesto' && (
        <PresupuestoClient snapshot={snapshot} />
      )}

    </div>
  )
}
