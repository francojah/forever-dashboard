'use client'

import { useState, useCallback } from 'react'
import { useRouter } from 'next/navigation'
import type { Snapshot, PeriodMetrics, TNSnapshot } from '@/lib/supabase'
import { InfoTooltip } from '@/components/ui/InfoTooltip'

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
  today: 'hoy', yesterday: 'ayer', last_7d: '7d', last_30d: '30d', custom: 'custom',
}

interface Props {
  snapshot:     Snapshot | null
  tnSnapshot:   TNSnapshot | null
  prevSnapshot?: Snapshot | null
}

// ── KPI card genérico ────────────────────────────────────────────
function KpiCard({
  label, value, sub, status = 'neutral', delta, invertDelta, tooltip, accent,
}: {
  label: string; value: string; sub?: string
  status?: 'ok' | 'warn' | 'bad' | 'neutral'
  delta?: number | null; invertDelta?: boolean
  tooltip?: string; accent?: string
}) {
  const valueColor = {
    ok:      'text-emerald-500 dark:text-emerald-400',
    warn:    'text-amber-500 dark:text-amber-400',
    bad:     'text-red-500 dark:text-red-400',
    neutral: 'text-gray-900 dark:text-white',
  }[status]

  const pctColor = delta == null ? '' : Math.abs(delta) < 2 ? 'text-gray-400'
    : (invertDelta ? delta < 0 : delta > 0) ? 'text-emerald-500' : 'text-red-500'

  return (
    <div className="bg-white dark:bg-zinc-900 rounded-xl border border-gray-100 dark:border-zinc-800 p-4 shadow-sm hover:shadow-md transition-shadow">
      {accent && <div className={`w-6 h-0.5 rounded-full mb-2.5 ${accent}`} />}
      <div className="flex items-center gap-1 mb-1.5">
        <p className="text-[11px] font-semibold text-gray-400 dark:text-zinc-500 uppercase tracking-wider">{label}</p>
        {tooltip && <InfoTooltip text={tooltip} />}
      </div>
      <p className={`text-2xl font-bold tabular-nums ${valueColor}`}>{value}</p>
      <div className="flex items-center gap-2 mt-1.5 min-h-[18px]">
        {sub && <p className="text-xs text-gray-400 dark:text-zinc-600">{sub}</p>}
        {delta != null && (
          <span className={`text-xs font-semibold ${pctColor}`}>
            {delta > 0 ? '+' : ''}{delta}%{Math.abs(delta) >= 2 ? (delta > 0 ? ' ↑' : ' ↓') : ''}
          </span>
        )}
      </div>
    </div>
  )
}

// ── Section label ────────────────────────────────────────────────
function SectionLabel({ icon, title, sub, color }: { icon: React.ReactNode; title: string; sub?: string; color: string }) {
  return (
    <div className="flex items-center gap-3 mb-3">
      <div className={`w-8 h-8 rounded-lg flex items-center justify-center ${color}`}>
        {icon}
      </div>
      <div>
        <p className="text-sm font-semibold text-gray-800 dark:text-zinc-200">{title}</p>
        {sub && <p className="text-xs text-gray-400 dark:text-zinc-600">{sub}</p>}
      </div>
    </div>
  )
}

// ── Delta helper ─────────────────────────────────────────────────
function calcDelta(curr: number | null | undefined, prev: number | null | undefined): number | null {
  if (curr == null || prev == null || prev === 0) return null
  return parseFloat(((curr - prev) / Math.abs(prev) * 100).toFixed(1))
}

export default function DashboardClient({ snapshot, tnSnapshot, prevSnapshot }: Props) {
  const [period, setPeriod]           = useState<Period>('last_7d')
  const [syncing, setSyncing]         = useState(false)
  const [lastSynced, setLastSynced]   = useState<string | null>(null)
  const [syncError, setSyncError]     = useState<string | null>(null)
  const router = useRouter()

  const today = new Date().toISOString().split('T')[0]
  const [customFrom, setCustomFrom]           = useState(today)
  const [customTo, setCustomTo]               = useState(today)
  const [customData, setCustomData]           = useState<PeriodMetrics | null>(null)
  const [customTnRevenue, setCustomTnRevenue] = useState<number | null>(null)
  const [customLoading, setCustomLoading]     = useState(false)
  const [customError, setCustomError]         = useState<string | null>(null)

  const triggerSync = useCallback(async () => {
    setSyncing(true); setSyncError(null)
    try {
      const [metaRes, tnRes] = await Promise.all([
        fetch('/api/sync', { method: 'POST' }),
        fetch('/api/sync-tiendanube', { method: 'POST' }),
      ])
      const [md, td] = await Promise.all([metaRes.json(), tnRes.json()])
      if (md.error) throw new Error('Meta: ' + md.error)
      if (td.error) throw new Error('TN: ' + td.error)
      setLastSynced(new Date().toLocaleTimeString('es-AR', { hour: '2-digit', minute: '2-digit' }))
      router.refresh()
    } catch (e) { setSyncError(e instanceof Error ? e.message : 'Error') }
    finally { setSyncing(false) }
  }, [router])

  const fetchCustom = useCallback(async () => {
    setCustomLoading(true); setCustomError(null)
    try {
      const res = await fetch('/api/sync-custom?from=' + customFrom + '&to=' + customTo)
      const data = await res.json()
      if (data.error) throw new Error(data.error)
      setCustomData(data.meta)
      setCustomTnRevenue(data.tn_revenue ?? null)
    } catch (e) { setCustomError(e instanceof Error ? e.message : 'Error') }
    finally { setCustomLoading(false) }
  }, [customFrom, customTo])

  if (!snapshot) {
    return (
      <div className="flex flex-col items-center justify-center h-[60vh] text-center">
        <div className="text-5xl mb-4">📭</div>
        <h2 className="text-lg font-semibold text-gray-800 dark:text-zinc-200 mb-2">Sin datos todavia</h2>
        <p className="text-sm text-gray-500 dark:text-zinc-500 max-w-xs mb-6">El primer sync se ejecuta automáticamente a las 7am.</p>
        <button onClick={triggerSync} disabled={syncing}
          className="flex items-center gap-2 px-5 py-2.5 bg-emerald-400 hover:bg-emerald-300 disabled:opacity-60 text-black font-semibold text-sm rounded-xl shadow-lg transition-all">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" className={'w-4 h-4 ' + (syncing ? 'animate-spin' : '')}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M16.023 9.348h4.992v-.001M2.985 19.644v-4.992m0 0h4.992m-4.993 0l3.181 3.183a8.25 8.25 0 0013.803-3.7M4.031 9.865a8.25 8.25 0 0113.803-3.7l3.181 3.182m0-4.991v4.99" />
          </svg>
          {syncing ? 'Actualizando...' : 'Actualizar datos'}
        </button>
      </div>
    )
  }

  // ── Period data ──────────────────────────────────────────────
  const periodData: PeriodMetrics =
    period === 'custom'  ? (customData ?? { campaigns: snapshot.campaigns, adsets: snapshot.adsets, ads: snapshot.ads, summary: snapshot.summary }) :
    period === 'last_7d' ? { campaigns: snapshot.campaigns, adsets: snapshot.adsets, ads: snapshot.ads, summary: snapshot.summary } :
    (snapshot.periods?.[period] ?? { campaigns: snapshot.campaigns, adsets: snapshot.adsets, ads: snapshot.ads, summary: snapshot.summary })

  const { summary, adsets } = periodData
  const hasPeriodData = period === 'last_7d' || period === 'custom' ? true : snapshot.periods?.[period] != null

  // ── TN data for period ───────────────────────────────────────
  const tnData =
    period === 'custom'    ? null :
    period === 'today'     ? tnSnapshot?.summary_today :
    period === 'yesterday' ? tnSnapshot?.summary_yesterday :
    period === 'last_7d'   ? tnSnapshot?.summary_7d :
    period === 'last_30d'  ? tnSnapshot?.summary_30d : null

  const tnRevenue   = period === 'custom' ? customTnRevenue : (tnData?.total_revenue ?? null)
  const metaSpend   = summary.total_spend_7d || 0
  const realRoas    = tnRevenue != null && metaSpend > 0 ? parseFloat((tnRevenue / metaSpend).toFixed(2)) : null

  // ── WoW ─────────────────────────────────────────────────────
  const prevSummary = prevSnapshot
    ? (period === 'last_7d' ? prevSnapshot.summary
       : (prevSnapshot.periods?.[period as 'today' | 'yesterday' | 'last_30d']?.summary ?? null))
    : null

  // ── Ad quality metrics (blended across all active adsets) ────
  const activeAdsets = adsets.filter(a => (a.spend || 0) > 0)
  const totalImpressions = activeAdsets.reduce((s, a) => s + (a.impressions || 0), 0)
  const totalClicks      = activeAdsets.reduce((s, a) => s + (a.clicks || 0), 0)
  const avgCtr    = totalImpressions > 0 ? (totalClicks / totalImpressions) * 100 : null
  const avgCpc    = totalClicks > 0 && metaSpend > 0 ? metaSpend / totalClicks : null
  const avgFreq   = activeAdsets.length > 0
    ? activeAdsets.reduce((s, a) => s + ((a.frequency || 0) * (a.impressions || 0)), 0) / Math.max(totalImpressions, 1)
    : null

  // ── Best ad set (highest ROAS, conversion) ───────────────────
  const bestAdset = [...activeAdsets]
    .filter(a => a.roas != null && a.roas > 0)
    .sort((a, b) => (b.roas || 0) - (a.roas || 0))[0] ?? null

  // ── Top product & province from TN ──────────────────────────
  const topProduct  = tnData?.top_products?.[0] ?? null
  const topProvince = tnData?.top_provinces?.[0] ?? null

  // ── Helpers ──────────────────────────────────────────────────
  const syncTime = lastSynced ?? new Date(snapshot.created_at).toLocaleTimeString('es-AR', { hour: '2-digit', minute: '2-digit' })
  const pLabel = period === 'last_7d' ? '7d' : period === 'last_30d' ? '30d' : period === 'today' ? 'hoy' : period === 'yesterday' ? 'ayer' : 'rango'
  function fmtM(n: number | null | undefined) { if (n == null) return '—'; if (n >= 1_000_000) return '$' + (n/1_000_000).toFixed(1) + 'M'; if (n >= 1_000) return '$' + Math.round(n/1000) + 'K'; return '$' + Math.round(n) }

  const roasStatus = !realRoas ? 'neutral' : realRoas >= 5 ? 'ok' : realRoas >= 3 ? 'warn' : 'bad'
  const cpaStatus  = !summary.blended_cpa ? 'neutral' : summary.blended_cpa <= BREAKEVEN_CPA ? 'ok' : summary.blended_cpa <= BREAKEVEN_CPA * 1.3 ? 'warn' : 'bad'
  const freqStatus = !avgFreq ? 'neutral' : avgFreq >= 4 ? 'bad' : avgFreq >= 2.5 ? 'warn' : 'ok'
  const ctrStatus  = !avgCtr ? 'neutral' : avgCtr >= 1.2 ? 'ok' : avgCtr >= 0.6 ? 'warn' : 'bad'

  return (
    <div className="max-w-7xl mx-auto space-y-8">

      {/* ── Header ────────────────────────────────────────── */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
        <div>
          <h1 className="text-xl font-bold text-gray-900 dark:text-zinc-100">Dashboard</h1>
          <p className="text-sm mt-0.5">
            {syncError
              ? <span className="text-red-500">Error: {syncError}</span>
              : <span className="text-gray-400 dark:text-zinc-500">
                  Sync {snapshot.snapshot_date} — {syncTime}
                  {!hasPeriodData && period !== 'custom' &&
                    <span className="ml-2 text-amber-500"> · sin datos para {PERIOD_LABELS[period]}</span>}
                </span>
            }
          </p>
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          <button onClick={triggerSync} disabled={syncing}
            className="flex items-center gap-1.5 px-4 py-2 bg-emerald-400 hover:bg-emerald-300 active:bg-emerald-500 disabled:opacity-50 text-black font-bold text-sm rounded-xl shadow-md transition-all">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"
              className={'w-4 h-4 ' + (syncing ? 'animate-spin' : '')}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M16.023 9.348h4.992v-.001M2.985 19.644v-4.992m0 0h4.992m-4.993 0l3.181 3.183a8.25 8.25 0 0013.803-3.7M4.031 9.865a8.25 8.25 0 0113.803-3.7l3.181 3.182m0-4.991v4.99" />
            </svg>
            {syncing ? 'Actualizando...' : 'Actualizar'}
          </button>
          <div className="flex bg-gray-100 dark:bg-zinc-800 rounded-xl p-0.5 gap-0.5">
            {(Object.keys(PERIOD_LABELS) as Period[]).map(p => (
              <button key={p} onClick={() => setPeriod(p)}
                className={'px-3 py-1.5 text-xs font-semibold rounded-lg transition-all ' + (
                  period === p
                    ? 'bg-white dark:bg-zinc-700 text-gray-900 dark:text-zinc-100 shadow-sm'
                    : 'text-gray-500 dark:text-zinc-400 hover:text-gray-700 dark:hover:text-zinc-200'
                )}>
                {PERIOD_LABELS[p]}
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* Custom date picker */}
      {period === 'custom' && (
        <div className="flex flex-wrap items-end gap-3 bg-white dark:bg-zinc-900 border border-gray-200 dark:border-zinc-800 rounded-xl px-4 py-3 shadow-sm">
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
            className="px-4 py-1.5 text-xs font-semibold bg-indigo-600 hover:bg-indigo-700 disabled:opacity-50 text-white rounded-lg transition-all">
            {customLoading ? 'Consultando...' : 'Consultar'}
          </button>
          {customError && <p className="text-xs text-red-500">{customError}</p>}
        </div>
      )}

      {/* Attribution note */}
      {(period === 'today' || period === 'yesterday') && hasPeriodData && (
        <div className="flex items-start gap-2 bg-amber-50 dark:bg-amber-950/30 border border-amber-200 dark:border-amber-900/50 rounded-xl px-4 py-2.5">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="w-4 h-4 text-amber-500 shrink-0 mt-0.5">
            <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v3.75m-9.303 3.376c-.866 1.5.217 3.374 1.948 3.374h14.71c1.73 0 2.813-1.874 1.948-3.374L13.949 3.378c-.866-1.5-3.032-1.5-3.898 0L2.697 16.126zM12 15.75h.007v.008H12v-.008z" />
          </svg>
          <p className="text-xs text-amber-700 dark:text-amber-400">
            {period === 'today'
              ? <>ROAS real hoy: <strong>{realRoas?.toFixed(2) ?? '—'}x</strong> (ventas TN / gasto Meta) vs <strong>{summary.blended_roas?.toFixed(2) ?? '—'}x</strong> reportado por Meta (ventana 7d).</>
              : 'El ROAS de ayer puede incluir conversiones de días anteriores por la ventana de atribución de Meta.'}
          </p>
        </div>
      )}

      {/* ════════════════════════════════════════════════════════
          SECCIÓN 1 — TIENDANUBE
      ════════════════════════════════════════════════════════ */}
      <div>
        <SectionLabel
          title={`Tiendanube · ${PERIOD_LABELS[period]}`}
          sub="Ventas reales de la tienda — todas las fuentes de tráfico"
          color="bg-violet-100 dark:bg-violet-900/30 text-violet-600 dark:text-violet-400"
          icon={
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" className="w-4 h-4">
              <path d="M6 2L3 6v14a2 2 0 002 2h14a2 2 0 002-2V6l-3-4z"/><line x1="3" y1="6" x2="21" y2="6"/><path d="M16 10a4 4 0 01-8 0"/>
            </svg>
          }
        />
        <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-5 gap-3">
          <KpiCard label="Ventas totales" value={fmtM(tnRevenue)}
            sub={tnData ? `${fmtM(tnRevenue && tnData.total_orders ? tnRevenue / (parseInt(String(period).replace('last_','').replace('d','')) || 7) : null)}/día` : undefined}
            accent="bg-violet-400" tooltip="Total facturado en Tiendanube en el período. Incluye todas las fuentes de tráfico." />
          <KpiCard label="Órdenes" value={tnData?.total_orders != null ? String(tnData.total_orders) : '—'}
            sub={tnData?.total_orders ? `~${(tnData.total_orders / (period === 'last_30d' ? 30 : period === 'last_7d' ? 7 : 1)).toFixed(1)}/día` : undefined}
            accent="bg-violet-400" tooltip="Cantidad de órdenes pagadas en el período." />
          <KpiCard label="Ticket promedio" value={fmtM(tnData?.aov)}
            sub="por orden" accent="bg-violet-400"
            tooltip="Valor promedio por orden (AOV). Subir el AOV mejora el ROAS sin aumentar el gasto." />
          <KpiCard label="Clientes únicos" value={tnData?.unique_customers != null ? String(tnData.unique_customers) : '—'}
            sub="compradores" accent="bg-violet-400"
            tooltip="Clientes con al menos una compra. Un cliente que compra dos veces cuenta una sola vez." />
          <KpiCard label="Unidades vendidas" value={tnData?.total_units_sold != null ? String(tnData.total_units_sold) : '—'}
            sub="artículos" accent="bg-violet-400"
            tooltip="Total de artículos vendidos sumando las cantidades de todos los productos de las órdenes." />
        </div>
      </div>

      {/* ════════════════════════════════════════════════════════
          SECCIÓN 2 — META ADS
      ════════════════════════════════════════════════════════ */}
      <div>
        <SectionLabel
          title={`Meta Ads · ${PERIOD_LABELS[period]}`}
          sub="Performance de las campañas de publicidad pagada"
          color="bg-blue-100 dark:bg-blue-900/30 text-blue-600 dark:text-blue-400"
          icon={
            <svg viewBox="0 0 24 24" fill="currentColor" className="w-4 h-4">
              <path d="M12 2.04C6.5 2.04 2 6.53 2 12.06C2 17.06 5.66 21.21 10.44 21.96V14.96H7.9V12.06H10.44V9.85C10.44 7.34 11.93 5.96 14.22 5.96C15.31 5.96 16.45 6.15 16.45 6.15V8.62H15.19C13.95 8.62 13.56 9.39 13.56 10.18V12.06H16.34L15.89 14.96H13.56V21.96C18.34 21.21 22 17.06 22 12.06C22 6.53 17.5 2.04 12 2.04Z"/>
            </svg>
          }
        />
        <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-3">
          <KpiCard label={`Gasto ${pLabel}`} value={fmtM(metaSpend)}
            sub="ARS invertido" accent="bg-blue-400"
            delta={calcDelta(metaSpend, prevSummary?.total_spend_7d)}
            tooltip="Total invertido en Meta Ads en el período." />
          <KpiCard label="Budget/día" value={fmtM(summary.daily_budget_active)}
            sub="ARS activo" accent="bg-blue-400"
            tooltip="Presupuesto diario total de todos los ad sets ACTIVE en este momento." />
          <KpiCard label={`Compras ${pLabel}`} value={String(summary.total_purchases_7d || 0)}
            sub={summary.total_purchases_7d ? `~${(summary.total_purchases_7d / (period === 'last_30d' ? 30 : 7)).toFixed(1)}/día` : undefined}
            accent="bg-blue-400"
            delta={calcDelta(summary.total_purchases_7d, prevSummary?.total_purchases_7d)}
            tooltip="Compras atribuidas por el pixel de Meta (ventana 7d click / 1d view)." />
          <KpiCard label="ROAS real" value={realRoas ? realRoas.toFixed(2) + 'x' : '—'}
            sub="ventas TN / gasto" status={roasStatus} accent="bg-blue-400"
            delta={calcDelta(realRoas, prevSummary && metaSpend ? null : null)}
            tooltip="ROAS real = ventas totales de Tiendanube ÷ gasto Meta. Más conservador que el ROAS reportado por Meta." />
          <KpiCard label="CPA blend." value={summary.blended_cpa ? fmtM(summary.blended_cpa) : '—'}
            sub={`bk ${fmtM(BREAKEVEN_CPA)}`} status={cpaStatus} invertDelta accent="bg-blue-400"
            delta={calcDelta(summary.blended_cpa, prevSummary?.blended_cpa)}
            tooltip={`Costo por compra atribuida. Verde = por debajo del breakeven (${fmtM(BREAKEVEN_CPA)}).`} />
          <KpiCard label="Ad sets activos" value={String(summary.active_adsets || 0)}
            sub="corriendo" accent="bg-blue-400"
            tooltip="Ad sets con estado ACTIVE en este momento." />
        </div>
      </div>

      {/* ════════════════════════════════════════════════════════
          SECCIÓN 3 — CALIDAD PUBLICITARIA
      ════════════════════════════════════════════════════════ */}
      <div>
        <SectionLabel
          title="Calidad publicitaria"
          sub="Métricas de alcance, engagement y eficiencia de los anuncios"
          color="bg-indigo-100 dark:bg-indigo-900/30 text-indigo-600 dark:text-indigo-400"
          icon={
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" className="w-4 h-4">
              <polyline points="22 12 18 12 15 21 9 3 6 12 2 12"/>
            </svg>
          }
        />
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          <KpiCard label="Impresiones" value={totalImpressions > 0 ? (totalImpressions >= 1_000_000 ? (totalImpressions/1_000_000).toFixed(1) + 'M' : Math.round(totalImpressions/1000) + 'K') : '—'}
            sub="vistas totales" accent="bg-indigo-400"
            tooltip="Total de veces que se mostraron los anuncios en el período." />
          <KpiCard label="CTR promedio" value={avgCtr ? avgCtr.toFixed(2) + '%' : '—'}
            sub="clicks / impresiones" status={ctrStatus} accent="bg-indigo-400"
            tooltip="Click-through rate promedio de todos los ad sets. Bueno: >1.2%, aceptable: >0.6%, bajo: <0.6%." />
          <KpiCard label="Frecuencia prom." value={avgFreq ? avgFreq.toFixed(1) + 'x' : '—'}
            sub="veces por persona" status={freqStatus} invertDelta accent="bg-indigo-400"
            tooltip="Veces promedio que cada usuario vio los anuncios. >3x puede causar fatiga; >4x es señal de saturación de audiencia." />
          <KpiCard label="CPC promedio" value={avgCpc ? fmtM(avgCpc) : '—'}
            sub="por click" accent="bg-indigo-400"
            tooltip="Costo promedio por click en los anuncios. Gasto total ÷ total de clicks en el período." />
        </div>
      </div>

      {/* ════════════════════════════════════════════════════════
          SECCIÓN 4 — HIGHLIGHTS
      ════════════════════════════════════════════════════════ */}
      {(topProduct || bestAdset || topProvince || (summary.alerts && summary.alerts.length > 0)) && (
        <div>
          <SectionLabel
            title="Highlights del período"
            sub="Lo más relevante de un vistazo"
            color="bg-emerald-100 dark:bg-emerald-900/30 text-emerald-600 dark:text-emerald-400"
            icon={
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" className="w-4 h-4">
                <polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2"/>
              </svg>
            }
          />
          <div className="grid grid-cols-1 md:grid-cols-3 gap-3">

            {/* Top producto */}
            <div className="bg-white dark:bg-zinc-900 rounded-xl border border-gray-100 dark:border-zinc-800 p-4 shadow-sm">
              <div className="flex items-center gap-2 mb-3">
                <div className="w-6 h-6 rounded-lg bg-violet-100 dark:bg-violet-900/30 flex items-center justify-center">
                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" className="w-3.5 h-3.5 text-violet-600 dark:text-violet-400" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M6 2L3 6v14a2 2 0 002 2h14a2 2 0 002-2V6l-3-4z"/><line x1="3" y1="6" x2="21" y2="6"/><path d="M16 10a4 4 0 01-8 0"/>
                  </svg>
                </div>
                <p className="text-xs font-semibold text-gray-400 dark:text-zinc-500 uppercase tracking-wider">Top producto TN</p>
              </div>
              {topProduct ? (
                <>
                  <p className="text-sm font-semibold text-gray-800 dark:text-zinc-200 leading-snug mb-1">{topProduct.name}</p>
                  <div className="flex items-center gap-3 mt-2">
                    <span className="text-lg font-bold text-violet-600 dark:text-violet-400">{fmtM(topProduct.revenue)}</span>
                    <span className="text-xs text-gray-400 dark:text-zinc-500">{topProduct.quantity} unidades</span>
                  </div>
                </>
              ) : (
                <p className="text-sm text-gray-400 dark:text-zinc-600">Sin datos de TN para este período</p>
              )}
            </div>

            {/* Mejor ad set */}
            <div className="bg-white dark:bg-zinc-900 rounded-xl border border-gray-100 dark:border-zinc-800 p-4 shadow-sm">
              <div className="flex items-center gap-2 mb-3">
                <div className="w-6 h-6 rounded-lg bg-blue-100 dark:bg-blue-900/30 flex items-center justify-center">
                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" className="w-3.5 h-3.5 text-blue-600 dark:text-blue-400" strokeLinecap="round" strokeLinejoin="round">
                    <polyline points="22 12 18 12 15 21 9 3 6 12 2 12"/>
                  </svg>
                </div>
                <p className="text-xs font-semibold text-gray-400 dark:text-zinc-500 uppercase tracking-wider">Mejor ad set</p>
              </div>
              {bestAdset ? (
                <>
                  <p className="text-sm font-semibold text-gray-800 dark:text-zinc-200 leading-snug mb-1 truncate" title={bestAdset.name}>{bestAdset.name}</p>
                  <div className="flex items-center gap-3 mt-2">
                    <span className={`text-lg font-bold ${(bestAdset.roas || 0) >= 5 ? 'text-emerald-500' : (bestAdset.roas || 0) >= 3 ? 'text-blue-500' : 'text-amber-500'}`}>
                      {bestAdset.roas?.toFixed(2)}x ROAS
                    </span>
                    <span className="text-xs text-gray-400 dark:text-zinc-500">{fmtM(bestAdset.spend)} gasto</span>
                  </div>
                </>
              ) : (
                <p className="text-sm text-gray-400 dark:text-zinc-600">Sin ad sets con ROAS calculado</p>
              )}
            </div>

            {/* Top provincia */}
            <div className="bg-white dark:bg-zinc-900 rounded-xl border border-gray-100 dark:border-zinc-800 p-4 shadow-sm">
              <div className="flex items-center gap-2 mb-3">
                <div className="w-6 h-6 rounded-lg bg-emerald-100 dark:bg-emerald-900/30 flex items-center justify-center">
                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" className="w-3.5 h-3.5 text-emerald-600 dark:text-emerald-400" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z"/><circle cx="12" cy="10" r="3"/>
                  </svg>
                </div>
                <p className="text-xs font-semibold text-gray-400 dark:text-zinc-500 uppercase tracking-wider">Top provincia TN</p>
              </div>
              {topProvince && tnData ? (
                <>
                  <p className="text-sm font-semibold text-gray-800 dark:text-zinc-200 leading-snug mb-1">{topProvince.name}</p>
                  <div className="flex items-center gap-3 mt-2">
                    <span className="text-lg font-bold text-emerald-600 dark:text-emerald-400">{topProvince.count} órdenes</span>
                    <span className="text-xs text-gray-400 dark:text-zinc-500">
                      {tnData.total_orders > 0 ? Math.round((topProvince.count / tnData.total_orders) * 100) : 0}% del total
                    </span>
                  </div>
                  {/* Mini bar for top 3 provinces */}
                  {tnData.top_provinces && tnData.top_provinces.length > 1 && (
                    <div className="mt-3 space-y-1.5">
                      {tnData.top_provinces.slice(0, 3).map((p: { name: string; count: number }) => {
                        const pct = tnData.total_orders > 0 ? (p.count / tnData.total_orders) * 100 : 0
                        return (
                          <div key={p.name} className="flex items-center gap-2">
                            <span className="text-[10px] text-gray-400 dark:text-zinc-600 w-20 truncate">{p.name}</span>
                            <div className="flex-1 bg-gray-100 dark:bg-zinc-800 rounded-full h-1">
                              <div className="h-1 rounded-full bg-emerald-400" style={{ width: `${Math.min(pct, 100)}%` }} />
                            </div>
                            <span className="text-[10px] text-gray-400 dark:text-zinc-600 w-6 text-right">{Math.round(pct)}%</span>
                          </div>
                        )
                      })}
                    </div>
                  )}
                </>
              ) : (
                <p className="text-sm text-gray-400 dark:text-zinc-600">Sin datos de TN para este período</p>
              )}
            </div>
          </div>
        </div>
      )}

      {/* ── Alertas ────────────────────────────────────────── */}
      {summary.alerts && summary.alerts.length > 0 && (
        <div>
          <SectionLabel
            title="Alertas activas"
            sub="Ad sets que requieren atención"
            color="bg-amber-100 dark:bg-amber-900/30 text-amber-600 dark:text-amber-400"
            icon={
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" className="w-4 h-4">
                <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v3.75m-9.303 3.376c-.866 1.5.217 3.374 1.948 3.374h14.71c1.73 0 2.813-1.874 1.948-3.374L13.949 3.378c-.866-1.5-3.032-1.5-3.898 0L2.697 16.126zM12 15.75h.007v.008H12v-.008z" />
              </svg>
            }
          />
          <div className="space-y-2">
            {summary.alerts.slice(0, 5).map((alert, i) => (
              <div key={i} className={`flex items-start gap-3 px-4 py-3 rounded-xl border text-sm ${
                alert.severity === 'danger'  ? 'bg-red-50 dark:bg-red-950/20 border-red-200 dark:border-red-900/50' :
                alert.severity === 'warning' ? 'bg-amber-50 dark:bg-amber-950/20 border-amber-200 dark:border-amber-900/50' :
                                               'bg-blue-50 dark:bg-blue-950/20 border-blue-200 dark:border-blue-900/50'
              }`}>
                <span className={`mt-0.5 text-base ${alert.severity === 'danger' ? 'text-red-500' : alert.severity === 'warning' ? 'text-amber-500' : 'text-blue-500'}`}>
                  {alert.severity === 'danger' ? '🔴' : alert.severity === 'warning' ? '🟡' : 'ℹ️'}
                </span>
                <div>
                  <p className={`font-semibold ${alert.severity === 'danger' ? 'text-red-800 dark:text-red-300' : alert.severity === 'warning' ? 'text-amber-800 dark:text-amber-300' : 'text-blue-800 dark:text-blue-300'}`}>
                    {alert.entity_name}
                  </p>
                  <p className="text-xs text-gray-500 dark:text-zinc-400 mt-0.5">{alert.message}</p>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* ── CTA Campañas ─────────────────────────────────── */}
      <div className="flex items-center justify-between pt-2 border-t border-gray-100 dark:border-zinc-800">
        <p className="text-xs text-gray-400 dark:text-zinc-600">
          Para gestionar ad sets, creativos y presupuesto entrá a <strong className="text-gray-600 dark:text-zinc-400">Campañas</strong>.
        </p>
        <a href="/campanias" className="text-xs font-semibold text-indigo-600 dark:text-indigo-400 hover:underline flex items-center gap-1">
          Ver Campañas →
        </a>
      </div>

    </div>
  )
}
