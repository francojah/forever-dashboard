'use client'

import { useState, useCallback, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import type { Snapshot, PeriodMetrics, TNSnapshot } from '@/lib/supabase'
import { createClientBrowser } from '@/lib/supabase'
import { InfoTooltip } from '@/components/ui/InfoTooltip'
import { ResponsiveContainer, AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip as RechartTooltip, Legend, ReferenceLine } from 'recharts'

// Estructura de costos Forever Basics (actualizada Jun 2026)
// Desglose por orden con ticket promedio $57.500 (3 unidades):
//   Mercadería:  3 un × $6.500            = $19.500
//   Envío:       10% × $57.500            =  $5.750
//   Plataforma:  2.5% × $57.500 (TN fee)  =  $1.438
//   Packaging:   fijo                     =    $350
//   ─────────────────────────────────────────────────
//   TOTAL costo/orden                     = $27.038
//
// Margen real:     ($57.500 − $27.038) / $57.500 ≈ 53%
// BREAKEVEN_CPA:   $57.500 − $27.038             ≈ $30.462
const AOV_DEFAULT    = 57500   // ARS — ticket promedio estimado
const UNIT_COST      = 6500    // ARS — costo mercadería por unidad
const UNITS_PER_ORDER= 3       // unidades promedio por orden
const SHIPPING_PCT   = 0.10    // envío = 10% del ticket
const PLATFORM_PCT   = 0.025   // comisión TN = 2.5% del ticket
const PACKAGING      = 350     // ARS — packaging por orden
const COST_PER_ORDER = Math.round(
  UNITS_PER_ORDER * UNIT_COST +
  (SHIPPING_PCT + PLATFORM_PCT) * AOV_DEFAULT +
  PACKAGING
) // ≈ 27.038
const MARGIN         = parseFloat(((AOV_DEFAULT - COST_PER_ORDER) / AOV_DEFAULT).toFixed(4)) // ≈ 0.5299 (53%)
const BREAKEVEN_CPA  = AOV_DEFAULT - COST_PER_ORDER // ≈ 30.462
const AUTO_REFRESH_SECS = 180
const TRAFFIC_GOALS = ['LINK_CLICKS', 'LANDING_PAGE_VIEWS', 'REACH', 'BRAND_AWARENESS', 'POST_ENGAGEMENT']

type Period = 'today' | 'yesterday' | 'last_7d' | 'last_30d' | 'custom'
const PERIOD_LABELS: Record<Period, string> = {
  today: 'Hoy', yesterday: 'Ayer', last_7d: 'Ultimos 7d', last_30d: 'Ultimos 30d', custom: 'Personalizado',
}
const PERIOD_SHORT: Record<Period, string> = {
  today: 'hoy', yesterday: 'ayer', last_7d: '7d', last_30d: '30d', custom: 'custom',
}

interface Props {
  snapshot:             Snapshot | null
  tnSnapshot:           TNSnapshot | null
  prevSnapshot?:        Snapshot | null
  historicalSnapshots?: { snapshot_date: string; summary: { total_spend_7d: number | null; blended_roas: number | null; total_purchases_7d: number | null } }[]
}

function fmtM(n: number | null | undefined): string {
  if (n == null) return '—'
  if (n >= 1_000_000) return '$' + (n / 1_000_000).toFixed(1) + 'M'
  if (n >= 1_000)     return '$' + Math.round(n / 1000) + 'K'
  return '$' + Math.round(n)
}
function fmtImpr(n: number): string {
  if (n >= 1_000_000) return (n / 1_000_000).toFixed(1) + 'M'
  return Math.round(n / 1000) + 'K'
}
function calcDelta(curr: number | null | undefined, prev: number | null | undefined): number | null {
  if (curr == null || prev == null || prev === 0) return null
  return parseFloat(((curr - prev) / Math.abs(prev) * 100).toFixed(1))
}
function fmtCountdown(secs: number): string {
  return Math.floor(secs / 60) + ':' + String(secs % 60).padStart(2, '0')
}

function KpiCard({ label, value, sub, status = 'neutral', delta, invertDelta, tooltip, accent, anomaly }: {
  label: string; value: string; sub?: string
  status?: 'ok' | 'warn' | 'bad' | 'neutral'
  delta?: number | null; invertDelta?: boolean; tooltip?: string; accent?: string
  anomaly?: { label: string; color: string } | null
}) {
  const borderL = {
    ok:      'border-l-emerald-400 dark:border-l-emerald-500',
    warn:    'border-l-amber-400 dark:border-l-amber-500',
    bad:     'border-l-red-400 dark:border-l-red-500',
    neutral: 'border-l-gray-100 dark:border-l-zinc-800',
  }[status]
  const bgGrad = {
    ok:      'bg-gradient-to-br from-emerald-50/60 to-white dark:from-emerald-950/20 dark:to-zinc-900',
    warn:    'bg-gradient-to-br from-amber-50/60 to-white dark:from-amber-950/20 dark:to-zinc-900',
    bad:     'bg-gradient-to-br from-red-50/60 to-white dark:from-red-950/20 dark:to-zinc-900',
    neutral: 'bg-white dark:bg-zinc-900',
  }[status]
  const valueColor = { ok: 'text-emerald-600 dark:text-emerald-400', warn: 'text-amber-600 dark:text-amber-400', bad: 'text-red-600 dark:text-red-400', neutral: 'text-gray-900 dark:text-white' }[status]
  const isPosDelta = delta != null && delta > 0
  const isGoodDelta = delta == null ? null : (invertDelta ? delta < 0 : delta > 0)
  const deltaCls = delta == null ? '' : Math.abs(delta) < 2
    ? 'bg-gray-100 dark:bg-zinc-800 text-gray-500 dark:text-zinc-400'
    : isGoodDelta
    ? 'bg-emerald-100 dark:bg-emerald-950/60 text-emerald-700 dark:text-emerald-400'
    : 'bg-red-100 dark:bg-red-950/60 text-red-700 dark:text-red-400'
  return (
    <div className={`rounded-xl border border-gray-100 dark:border-zinc-800 border-l-[3px] ${borderL} ${bgGrad} p-4 shadow-sm hover:shadow-md transition-shadow relative overflow-hidden`}>
      {anomaly && (
        <span className={`absolute top-2 right-2 text-[9px] font-bold px-1.5 py-0.5 rounded-full ${anomaly.color}`}>{anomaly.label}</span>
      )}
      <div className="flex items-center gap-1 mb-1.5">
        <p className="text-[11px] font-semibold text-gray-400 dark:text-zinc-500 uppercase tracking-wider">{label}</p>
        {tooltip && <InfoTooltip text={tooltip} />}
      </div>
      <p className={`text-3xl font-bold tabular-nums leading-none ${valueColor}`}>{value}</p>
      <div className="flex items-center gap-2 mt-2 min-h-[20px] flex-wrap">
        {sub && <p className="text-xs text-gray-400 dark:text-zinc-600">{sub}</p>}
        {delta != null && (
          <span className={`text-[11px] font-semibold px-1.5 py-0.5 rounded-full ${deltaCls}`}>
            {isPosDelta ? '+' : ''}{delta}%
          </span>
        )}
      </div>
    </div>
  )
}

function HeroKpi({ label, value, sub, status = 'neutral', delta, invertDelta, accent, loading }: {
  label: string; value: string; sub?: string
  status?: 'ok' | 'warn' | 'bad' | 'neutral'
  delta?: number | null; invertDelta?: boolean; accent: string; loading?: boolean
}) {
  const glowBg: Record<string, string> = {
    ok:      'linear-gradient(135deg, rgba(16,185,129,0.10) 0%, transparent 55%)',
    warn:    'linear-gradient(135deg, rgba(245,158,11,0.10) 0%, transparent 55%)',
    bad:     'linear-gradient(135deg, rgba(239,68,68,0.10) 0%, transparent 55%)',
    neutral: 'none',
  }
  const glowBorder: Record<string, string> = {
    ok:      'rgba(16,185,129,0.28)',
    warn:    'rgba(245,158,11,0.28)',
    bad:     'rgba(239,68,68,0.28)',
    neutral: '#27272a',
  }
  const valueColor = { ok: 'text-emerald-400', warn: 'text-amber-400', bad: 'text-red-400', neutral: 'text-white' }[status]
  const pctColor = delta == null ? '' : Math.abs(delta) < 2 ? 'text-zinc-500' : (invertDelta ? delta < 0 : delta > 0) ? 'text-emerald-400' : 'text-red-400'
  return (
    <div className="flex-1 min-w-[130px] rounded-xl border px-4 py-4"
         style={{ background: `${glowBg[status]}, #18181b`, borderColor: glowBorder[status] }}>
      <div className={`w-5 h-0.5 rounded-full mb-3 ${accent}`} />
      <p className="text-[10px] font-semibold text-zinc-500 uppercase tracking-widest mb-2">{label}</p>
      {loading ? (
        <div className="h-9 w-20 bg-zinc-800 rounded-lg animate-pulse" />
      ) : (
        <p className={`text-3xl font-bold tabular-nums leading-none ${valueColor}`}>{value}</p>
      )}
      <div className="flex items-center gap-2 mt-2 min-h-[16px]">
        {sub && <p className="text-[11px] text-zinc-600">{sub}</p>}
        {delta != null && (
          <span className={`text-[11px] font-semibold ${pctColor}`}>
            {delta > 0 ? '+' : ''}{delta}%
          </span>
        )}
      </div>
    </div>
  )
}

function SectionLabel({ icon, title, sub, color }: { icon: React.ReactNode; title: string; sub?: string; color: string }) {
  return (
    <div className="flex items-center gap-3 mb-3">
      <div className={`w-8 h-8 rounded-lg flex items-center justify-center shrink-0 ${color}`}>{icon}</div>
      <div>
        <p className="text-sm font-semibold text-gray-800 dark:text-zinc-200">{title}</p>
        {sub && <p className="text-xs text-gray-400 dark:text-zinc-600">{sub}</p>}
      </div>
    </div>
  )
}

// Sparkline mini chart
function Sparkline({ data, color = '#10b981' }: { data: (number | null)[]; color?: string }) {
  const valid = data.filter((v): v is number => v != null)
  if (valid.length < 2) return null
  const min = Math.min(...valid), max = Math.max(...valid)
  const range = max - min || 1
  const w = 60, h = 24
  const pts = data
    .map((v, i) => v == null ? null : [
      (i / (data.length - 1)) * w,
      h - ((v - min) / range) * (h - 4) - 2,
    ])
    .filter((p): p is [number, number] => p != null)
  if (pts.length < 2) return null
  const d = pts.map((p, i) => `${i === 0 ? 'M' : 'L'}${p[0].toFixed(1)},${p[1].toFixed(1)}`).join(' ')
  return (
    <svg width={w} height={h} className="shrink-0 opacity-70">
      <path d={d} fill="none" stroke={color} strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  )
}

// Animated SVG trapezoid funnel
function FunnelSteps({ steps }: {
  steps: { label: string; value: number; color: string }[]
}) {
  if (!steps[0]?.value) return <p className="text-xs text-gray-400 dark:text-zinc-600 text-center py-6">Sin datos para este período</p>

  const base = steps[0].value
  const fmtVal = (v: number) => (
    v >= 1_000_000
      ? (v / 1_000_000).toFixed(1) + 'M'
      : v >= 1000 ? (v / 1000).toFixed(0) + 'K'
      : v.toLocaleString('es-AR')
  )

  return (
    <div className="space-y-1.5">
      {steps.map((step, i) => {
        const pct  = base > 0 ? Math.round(step.value / base * 100) : 0
        const conv = i > 0 && steps[i - 1].value > 0
          ? ((step.value / steps[i - 1].value) * 100).toFixed(1) + '%'
          : null
        return (
          <div key={step.label}>
            {conv && (
              <div className="flex items-center gap-1.5 py-0.5 px-1">
                <div className="flex-1 h-px bg-gray-100 dark:bg-zinc-800" />
                <span className="text-[9px] font-medium text-gray-400 dark:text-zinc-500 tabular-nums shrink-0">↓ {conv}</span>
                <div className="flex-1 h-px bg-gray-100 dark:bg-zinc-800" />
              </div>
            )}
            <div className="flex items-center gap-2.5">
              <div className="w-2 h-2 rounded-full shrink-0" style={{ background: step.color }} />
              <div className="flex-1 min-w-0">
                <div className="flex items-center justify-between mb-0.5">
                  <span className="text-[11px] font-medium text-gray-600 dark:text-zinc-400 truncate">{step.label}</span>
                  <span className="text-[11px] font-bold text-gray-800 dark:text-zinc-200 tabular-nums ml-2 shrink-0">{fmtVal(step.value)}</span>
                </div>
                <div className="h-1.5 bg-gray-100 dark:bg-zinc-800 rounded-full overflow-hidden">
                  <div
                    className="h-full rounded-full"
                    style={{ width: pct + '%', background: step.color, opacity: 0.7 }}
                  />
                </div>
              </div>
              <span className="text-[10px] text-gray-400 dark:text-zinc-600 tabular-nums w-7 text-right shrink-0">{pct}%</span>
            </div>
          </div>
        )
      })}
    </svg>
  )
}

export default function DashboardClient({ snapshot, tnSnapshot, prevSnapshot, historicalSnapshots = [] }: Props) {
  const [period, setPeriod]           = useState<Period>('last_7d')
  const [syncing, setSyncing]         = useState(false)
  const [lastSynced, setLastSynced]   = useState<string | null>(null)
  const [syncError, setSyncError]     = useState<string | null>(null)
  const router = useRouter()

  // Live dashboard state
  const [isLive, setIsLive]               = useState(false)
  const [countdown, setCountdown]         = useState(AUTO_REFRESH_SECS)
  const [showToast, setShowToast]         = useState(false)
  const [notifEnabled, setNotifEnabled]   = useState(false)

  // AI Summary state
  const [aiSummary, setAiSummary]         = useState<string | null>(null)
  const [aiLoading, setAiLoading]         = useState(false)
  const [aiExpanded, setAiExpanded]       = useState(true)

  // Intraday Meta data
  const [todayMeta, setTodayMeta]         = useState<{ spend: number; purchases: number } | null>(null)
  const [todayLoading, setTodayLoading]   = useState(false)

  // Custom period
  const today = new Date().toISOString().split('T')[0]
  const [customFrom, setCustomFrom]       = useState(today)
  const [customTo, setCustomTo]           = useState(today)
  const [customData, setCustomData]       = useState<PeriodMetrics | null>(null)
  const [customTnRevenue, setCustomTnRevenue] = useState<number | null>(null)
  const [customLoading, setCustomLoading] = useState(false)
  const [customError, setCustomError]     = useState<string | null>(null)

  // ── Auto-polling every 3 min ──────────────────────────────────────
  useEffect(() => {
    let secs = AUTO_REFRESH_SECS
    setCountdown(secs)
    const tick = setInterval(() => {
      secs--
      setCountdown(secs)
      if (secs <= 0) {
        router.refresh()
        setShowToast(true)
        setTimeout(() => setShowToast(false), 3000)
        secs = AUTO_REFRESH_SECS
        setCountdown(secs)
      }
    }, 1000)
    return () => clearInterval(tick)
  }, [router])

  // ── Supabase Realtime ─────────────────────────────────────────────
  useEffect(() => {
    const supabase = createClientBrowser()
    const ch = supabase
      .channel('dashboard-live')
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'meta_snapshots' }, () => {
        router.refresh()
        setCountdown(AUTO_REFRESH_SECS)
        setShowToast(true)
        setTimeout(() => setShowToast(false), 3000)
      })
      .subscribe(status => setIsLive(status === 'SUBSCRIBED'))
    return () => { void supabase.removeChannel(ch) }
  }, [router])

  // ── Intraday spend for "Hoy" ──────────────────────────────────────
  useEffect(() => {
    if (period !== 'today') { setTodayMeta(null); return }
    setTodayLoading(true)
    fetch('/api/meta-today')
      .then(r => r.json())
      .then(d => { if (!d.error) setTodayMeta(d) })
      .catch(() => {})
      .finally(() => setTodayLoading(false))
  }, [period, snapshot?.id])

  // ── Browser notifications ─────────────────────────────────────────
  useEffect(() => {
    if (typeof window === 'undefined') return
    const stored = localStorage.getItem('forever-notif')
    if (stored === 'granted' && Notification.permission === 'granted') setNotifEnabled(true)
  }, [])

  // ── Listen for CommandPalette events ─────────────────────────────
  useEffect(() => {
    const onPeriod = (e: Event) => {
      const detail = (e as CustomEvent<string>).detail as Period
      if (detail) setPeriod(detail)
    }
    const onSync = () => triggerSync()
    window.addEventListener('forever:period', onPeriod)
    window.addEventListener('forever:sync', onSync)
    return () => {
      window.removeEventListener('forever:period', onPeriod)
      window.removeEventListener('forever:sync', onSync)
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // ── triggerSync ───────────────────────────────────────────────────
  const triggerSync = useCallback(async () => {
    setSyncing(true); setSyncError(null)
    try {
      const [mr, tr] = await Promise.all([fetch('/api/sync', { method: 'POST' }), fetch('/api/sync-tiendanube', { method: 'POST' })])
      const [md, td] = await Promise.all([mr.json(), tr.json()])
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
      setCustomData(data.meta); setCustomTnRevenue(data.tn_revenue ?? null)
    } catch (e) { setCustomError(e instanceof Error ? e.message : 'Error') }
    finally { setCustomLoading(false) }
  }, [customFrom, customTo])

  const enableNotifications = useCallback(async () => {
    if (!('Notification' in window)) return
    const perm = await Notification.requestPermission()
    if (perm === 'granted') {
      setNotifEnabled(true)
      localStorage.setItem('forever-notif', 'granted')
    }
  }, [])

  // ── Empty state ───────────────────────────────────────────────────
  if (!snapshot) {
    return (
      <div className="flex flex-col items-center justify-center h-[60vh] text-center">
        <div className="text-5xl mb-4">\U0001f4ed</div>
        <h2 className="text-lg font-semibold text-gray-800 dark:text-zinc-200 mb-2">Sin datos todavia</h2>
        <p className="text-sm text-gray-500 dark:text-zinc-500 max-w-xs mb-6">El primer sync se ejecuta automaticamente a las 7am.</p>
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

  // ── Period data ───────────────────────────────────────────────────
  const periodData: PeriodMetrics =
    period === 'custom'  ? (customData ?? { campaigns: snapshot.campaigns, adsets: snapshot.adsets, ads: snapshot.ads, summary: snapshot.summary }) :
    period === 'last_7d' ? { campaigns: snapshot.campaigns, adsets: snapshot.adsets, ads: snapshot.ads, summary: snapshot.summary } :
    (snapshot.periods?.[period] ?? { campaigns: snapshot.campaigns, adsets: snapshot.adsets, ads: snapshot.ads, summary: snapshot.summary })

  const { summary, adsets, ads } = periodData
  const hasPeriodData = period === 'last_7d' || period === 'custom' ? true : snapshot.periods?.[period] != null

  const tnData =
    period === 'custom'    ? null :
    period === 'today'     ? tnSnapshot?.summary_today :
    period === 'yesterday' ? tnSnapshot?.summary_yesterday :
    period === 'last_7d'   ? tnSnapshot?.summary_7d :
    period === 'last_30d'  ? tnSnapshot?.summary_30d : null

  const tnRevenue    = period === 'custom' ? customTnRevenue : (tnData?.total_revenue ?? null)
  const metaSpend    = period === 'today' && todayMeta ? todayMeta.spend : (summary.total_spend_7d || 0)
  const realRoas     = tnRevenue != null && metaSpend > 0 ? parseFloat((tnRevenue / metaSpend).toFixed(2)) : null

  const prevSummary = prevSnapshot
    ? (period === 'last_7d' ? prevSnapshot.summary : (prevSnapshot.periods?.[period as 'today' | 'yesterday' | 'last_30d']?.summary ?? null))
    : null

  // ── Adset analysis ────────────────────────────────────────────────
  const activeAdsets = adsets.filter(a => (a.spend || 0) > 0)
  const isTraffic    = (a: typeof adsets[0]) => TRAFFIC_GOALS.includes(a.optimization_goal || '')
  const convAdsets   = activeAdsets.filter(a => !isTraffic(a))
  const trafAdsets   = activeAdsets.filter(a =>  isTraffic(a))

  function qMetrics(group: typeof activeAdsets, spend: number) {
    const impr   = group.reduce((s, a) => s + (a.impressions || 0), 0)
    const clicks = group.reduce((s, a) => s + (a.clicks || 0), 0)
    return {
      impressions: impr,
      ctr:  impr   > 0 ? (clicks / impr) * 100 : null,
      cpc:  clicks > 0 && spend > 0 ? spend / clicks : null,
      freq: impr   > 0 && group.length > 0
        ? group.reduce((s, a) => s + ((a.frequency || 0) * (a.impressions || 0)), 0) / impr
        : null,
    }
  }
  const convSpend = convAdsets.reduce((s, a) => s + (a.spend || 0), 0)
  const trafSpend = trafAdsets.reduce((s, a) => s + (a.spend || 0), 0)
  const convQ = qMetrics(convAdsets, convSpend)
  const trafQ = qMetrics(trafAdsets, trafSpend)

  const activeAds   = ads.filter(a => (a.spend || 0) > 0)
  const adsetType   = new Map(activeAdsets.map(a => [a.id, isTraffic(a) ? 'traf' : 'conv']))

  const bestConvAd = [...activeAds]
    .filter(a => adsetType.get(a.adset_id) === 'conv' && a.roas != null && a.roas > 0)
    .sort((a, b) => (b.roas || 0) - (a.roas || 0))[0] ?? null

  const bestTrafAd = [...activeAds]
    .filter(a => adsetType.get(a.adset_id) === 'traf' && (a.clicks || 0) > 0 && (a.spend || 0) > 0)
    .sort((a, b) => {
      const ca = a.spend && a.clicks ? a.spend / a.clicks : Infinity
      const cb = b.spend && b.clicks ? b.spend / b.clicks : Infinity
      return ca - cb
    })[0] ?? null

  const tnAOV         = tnData?.aov ?? 0
  const metaPurchases = period === 'today' && todayMeta ? todayMeta.purchases : (summary.total_purchases_7d ?? 0)
  const metaAttr      = metaPurchases > 0 && tnAOV > 0 ? Math.min(metaPurchases * tnAOV, tnRevenue ?? 0) : 0
  const organicRev    = Math.max(0, (tnRevenue ?? 0) - metaAttr)
  const metaPct       = tnRevenue && tnRevenue > 0 ? Math.round((metaAttr / tnRevenue) * 100) : 0
  const organicPct    = Math.max(0, 100 - metaPct)

  const topProvince = tnData?.top_provinces?.[0] ?? null

  // ── Budget pacing ─────────────────────────────────────────────────
  const dailyBudget  = summary.daily_budget_active || 0
  const spendToday   = period === 'today' ? (todayMeta?.spend ?? (snapshot.periods?.today?.summary.total_spend_7d ?? 0)) : null
  const hoursNow     = new Date().getHours() + new Date().getMinutes() / 60
  const pacePct      = spendToday != null && dailyBudget > 0 ? (spendToday / dailyBudget) * 100 : null
  const expectedPct  = (hoursNow / 24) * 100
  const pacingRatio  = pacePct != null && expectedPct > 0 ? pacePct / expectedPct : null
  const pacingLabel  = pacingRatio == null ? '' : pacingRatio > 1.2 ? 'Adelantado' : pacingRatio < 0.8 ? 'Atrasado' : 'En ritmo'
  const pacingStatus = (pacingRatio == null ? 'neutral' : pacingRatio > 1.2 ? 'bad' : pacingRatio < 0.8 ? 'warn' : 'ok') as 'ok'|'warn'|'bad'|'neutral'

  // ── Anomaly detection (vs prevSnapshot) ──────────────────────────
  function anomalyBadge(curr: number | null | undefined, prev: number | null | undefined, invertBad = false) {
    const delta = calcDelta(curr, prev)
    if (delta == null || Math.abs(delta) < 25) return null
    const isBad = invertBad ? delta > 0 : delta < 0
    return {
      label: (delta > 0 ? '+' : '') + delta + '%',
      color: isBad
        ? 'bg-red-100 dark:bg-red-950/40 text-red-600 dark:text-red-400'
        : 'bg-emerald-100 dark:bg-emerald-950/40 text-emerald-600 dark:text-emerald-400',
    }
  }
  const spendAnomaly    = anomalyBadge(metaSpend,           prevSummary?.total_spend_7d)
  const purchAnomaly    = anomalyBadge(metaPurchases,        prevSummary?.total_purchases_7d)
  const cpaAnomaly      = anomalyBadge(summary.blended_cpa,  prevSummary?.blended_cpa, true)

  // ── Financial insights ────────────────────────────────────────────
  const periodDays       = period === 'last_30d' ? 30 : period === 'last_7d' ? 7 : 1
  const grossProfit      = tnRevenue != null ? Math.round(tnRevenue * MARGIN - metaSpend) : null
  const contributionPct  = tnRevenue != null && tnRevenue > 0 ? Math.round((grossProfit ?? 0) / tnRevenue * 100) : null

  // Break-even tracker (purchases needed to reach breakeven daily spend)
  // beCurrentPurchases must be consistent with metaPurchases shown in the KPI
  const beTargetPurchases  = dailyBudget > 0 ? Math.ceil(dailyBudget / BREAKEVEN_CPA) : null
  const beCurrentPurchases = period === 'today' ? metaPurchases : null
  const beRemaining        = beTargetPurchases != null && beCurrentPurchases != null
    ? Math.max(0, beTargetPurchases - beCurrentPurchases)
    : null
  const bePct              = beTargetPurchases && beCurrentPurchases != null
    ? Math.min(100, Math.round((beCurrentPurchases / beTargetPurchases) * 100))
    : null

  // Month projection (based on 7d average daily pace — independent of selected period)
  // Uses 7d TN revenue and 7d Meta spend to estimate "si mantenés este ritmo el mes completo"
  const now               = new Date()
  const daysInMonth       = new Date(now.getFullYear(), now.getMonth() + 1, 0).getDate()
  const dayOfMonth        = now.getDate()
  const daysRemaining     = daysInMonth - dayOfMonth
  const tnRev7d           = tnSnapshot?.summary_7d?.total_revenue ?? 0
  const metaSpend7d       = snapshot.periods?.last_7d?.summary?.total_spend_7d ?? summary.total_spend_7d ?? 0
  const dailyRevAvg7d     = tnRev7d > 0 ? tnRev7d / 7 : 0
  const dailySpendAvg7d   = metaSpend7d > 0 ? metaSpend7d / 7 : 0
  // Projected full-month at 7d pace
  const projRevenueMonth  = dailyRevAvg7d > 0 ? Math.round(dailyRevAvg7d * daysInMonth) : null
  const projSpendMonth    = dailySpendAvg7d > 0 ? Math.round(dailySpendAvg7d * daysInMonth) : null
  const projProfitMonth   = projRevenueMonth != null && projSpendMonth != null
    ? Math.round(projRevenueMonth * MARGIN - projSpendMonth)
    : null

  // Fatigue predictor
  const convFreq = convQ.freq ?? 0
  const fatiguePct = Math.min(100, Math.round((convFreq / 5) * 100))
  const fatigueStatus = convFreq >= 4 ? 'bad' : convFreq >= 2.5 ? 'warn' : 'ok'
  const fatigueMsg = convFreq >= 4
    ? 'Audiencia saturada — rotá creativos urgente'
    : convFreq >= 2.5
    ? 'Frecuencia en zona de alerta — monitorá CTR'
    : 'Frecuencia saludable'

  // YoY (using ytd vs same period last year — approximate from snapshot)
  const tnYTD     = tnSnapshot?.summary_ytd
  const ytdRev    = tnYTD?.total_revenue ?? null
  const ytdOrders = tnYTD?.total_orders  ?? null

  // Sparkline data from historical
  const sparkRoas  = historicalSnapshots.slice(-7).map(s => s.summary.blended_roas)
  const sparkSpend = historicalSnapshots.slice(-7).map(s => s.summary.total_spend_7d)

  // ── AI Summary fetch ──────────────────────────────────────────────
  const fetchAiSummary = useCallback(async () => {
    if (!snapshot) return
    setAiLoading(true)
    try {
      const topAdset = convAdsets.sort((a, b) => (b.roas || 0) - (a.roas || 0))[0]?.name ?? null
      const res = await fetch('/api/ai-summary', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          spend: metaSpend, purchases: metaPurchases, roas: realRoas, cpa: summary.blended_cpa,
          tnRevenue, topAdset,
          alerts: summary.alerts?.slice(0, 3) ?? [],
          period: PERIOD_SHORT[period],
          breakeven: BREAKEVEN_CPA,
          dailyBudget,
          activeAdsets: summary.active_adsets ?? 0,
        }),
      })
      const data = await res.json()
      if (data.summary) setAiSummary(data.summary)
    } catch { /* silent */ }
    finally { setAiLoading(false) }
  }, [snapshot, convAdsets, metaSpend, metaPurchases, realRoas, summary, tnRevenue, period, dailyBudget])

  // ── Status vars ───────────────────────────────────────────────────
  const syncTime   = lastSynced ?? new Date(snapshot.created_at).toLocaleTimeString('es-AR', { hour: '2-digit', minute: '2-digit' })
  const pLabel     = PERIOD_SHORT[period] === 'custom' ? 'rango' : PERIOD_SHORT[period]
  const roasStatus = !realRoas ? 'neutral' : realRoas >= 5 ? 'ok' : realRoas >= 3 ? 'warn' : 'bad'
  const cpaStatus  = !summary.blended_cpa ? 'neutral' : summary.blended_cpa <= BREAKEVEN_CPA ? 'ok' : summary.blended_cpa <= BREAKEVEN_CPA * 1.3 ? 'warn' : 'bad'
  const freqConvSt = (!convQ.freq ? 'neutral' : convQ.freq >= 4 ? 'bad' : convQ.freq >= 2.5 ? 'warn' : 'ok') as 'ok'|'warn'|'bad'|'neutral'
  const freqTrafSt = (!trafQ.freq ? 'neutral' : trafQ.freq >= 4 ? 'bad' : trafQ.freq >= 2.5 ? 'warn' : 'ok') as 'ok'|'warn'|'bad'|'neutral'
  const ctrConvSt  = (!convQ.ctr ? 'neutral' : convQ.ctr >= 1.2 ? 'ok' : convQ.ctr >= 0.6 ? 'warn' : 'bad') as 'ok'|'warn'|'bad'|'neutral'
  const ctrTrafSt  = (!trafQ.ctr ? 'neutral' : trafQ.ctr >= 1.2 ? 'ok' : trafQ.ctr >= 0.6 ? 'warn' : 'bad') as 'ok'|'warn'|'bad'|'neutral'

  const syncIcon = <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" className={'w-4 h-4 ' + (syncing ? 'animate-spin' : '')}><path strokeLinecap="round" strokeLinejoin="round" d="M16.023 9.348h4.992v-.001M2.985 19.644v-4.992m0 0h4.992m-4.993 0l3.181 3.183a8.25 8.25 0 0013.803-3.7M4.031 9.865a8.25 8.25 0 0113.803-3.7l3.181 3.182m0-4.991v4.99" /></svg>

  return (
    <div className="max-w-7xl mx-auto space-y-8">

      {syncing && (
        <div className="fixed top-0 left-0 right-0 h-0.5 z-50 overflow-hidden">
          <div className="h-full bg-emerald-400 animate-pulse w-full" />
        </div>
      )}

      {showToast && (
        <div className="fixed bottom-6 left-1/2 -translate-x-1/2 bg-zinc-900 border border-zinc-700 text-zinc-200 text-xs px-4 py-2.5 rounded-full shadow-xl z-50 flex items-center gap-2 pointer-events-none">
          <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 shrink-0" />
          Datos actualizados
        </div>
      )}

      {/* HEADER */}
      <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-3">
        <div>
          <div className="flex items-center gap-2 flex-wrap">
            <h1 className="text-xl font-bold text-gray-900 dark:text-zinc-100">Dashboard</h1>
            <span className={`w-2 h-2 rounded-full ${roasStatus === 'ok' ? 'bg-emerald-400' : roasStatus === 'warn' ? 'bg-amber-400' : roasStatus === 'bad' ? 'bg-red-400' : 'bg-zinc-600'}`} />
            <div className="flex items-center gap-1.5 ml-1">
              <span className={`w-1.5 h-1.5 rounded-full ${isLive ? 'bg-emerald-400 animate-pulse' : 'bg-zinc-600'}`} />
              <span className={`text-[10px] font-semibold ${isLive ? 'text-emerald-500 dark:text-emerald-400' : 'text-zinc-600'}`}>{isLive ? 'EN VIVO' : 'offline'}</span>
            </div>
          </div>
          <p className="text-xs mt-0.5 text-gray-400 dark:text-zinc-500 flex items-center gap-1.5 flex-wrap">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="w-3 h-3 shrink-0"><circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/></svg>
            Actualizado {syncTime} &middot; {snapshot.snapshot_date}
            <span className="text-zinc-600">&middot; ↺ {fmtCountdown(countdown)}</span>
            {syncError && (
              syncError.toLowerCase().includes('token') || syncError.toLowerCase().includes('access') || syncError.toLowerCase().includes('reconect')
                ? <span className="text-red-500 ml-1">&#9888; <a href="/settings" className="underline hover:text-red-400">Reconectar TN</a></span>
                : <span className="text-red-500 ml-1">Error: {syncError}</span>
            )}
            {!hasPeriodData && period !== 'custom' && <span className="text-amber-500 ml-1"> &middot; sin datos para {PERIOD_LABELS[period]}</span>}
          </p>
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          {!notifEnabled && (
            <button onClick={enableNotifications} title="Activar alertas push"
              className="flex items-center gap-1.5 px-3 py-2 text-xs font-medium text-zinc-500 dark:text-zinc-400 hover:text-zinc-300 bg-zinc-100 dark:bg-zinc-800 rounded-xl transition-all border border-zinc-200 dark:border-zinc-700">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" className="w-3.5 h-3.5"><path strokeLinecap="round" strokeLinejoin="round" d="M14.857 17.082a23.848 23.848 0 005.454-1.31A8.967 8.967 0 0118 9.75v-.7V9A6 6 0 006 9v.75a8.967 8.967 0 01-2.312 6.022c1.733.64 3.56 1.085 5.455 1.31m5.714 0a24.255 24.255 0 01-5.714 0m5.714 0a3 3 0 11-5.714 0" /></svg>
              Alertas
            </button>
          )}
          <button onClick={triggerSync} disabled={syncing}
            className="flex items-center gap-1.5 px-4 py-2 bg-emerald-400 hover:bg-emerald-300 active:bg-emerald-500 disabled:opacity-50 text-black font-bold text-sm rounded-xl shadow-md transition-all">
            {syncIcon}
            {syncing ? 'Actualizando...' : 'Actualizar'}
          </button>
          <div className="flex bg-gray-100 dark:bg-zinc-800 rounded-xl p-0.5 gap-0.5 flex-wrap">
            {(Object.keys(PERIOD_LABELS) as Period[]).map(p => (
              <button key={p} onClick={() => setPeriod(p)}
                className={'px-2.5 py-1.5 text-xs font-semibold rounded-lg transition-all ' + (period === p ? 'bg-white dark:bg-zinc-700 text-gray-900 dark:text-zinc-100 shadow-sm' : 'text-gray-500 dark:text-zinc-400 hover:text-gray-700 dark:hover:text-zinc-200')}>
                {PERIOD_LABELS[p]}
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* AI SUMMARY */}
      <div className="bg-gradient-to-r from-indigo-950/60 to-violet-950/60 rounded-xl border border-indigo-800/40 overflow-hidden">
        <div className="flex items-center justify-between px-4 py-3">
          <div className="flex items-center gap-2">
            <div className="w-6 h-6 rounded-lg bg-indigo-500/20 flex items-center justify-center">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" className="w-3.5 h-3.5 text-indigo-400"><path strokeLinecap="round" strokeLinejoin="round" d="M9.813 15.904L9 18.75l-.813-2.846a4.5 4.5 0 00-3.09-3.09L2.25 12l2.846-.813a4.5 4.5 0 003.09-3.09L9 5.25l.813 2.846a4.5 4.5 0 003.09 3.09L15.75 12l-2.846.813a4.5 4.5 0 00-3.09 3.09z"/></svg>
            </div>
            <span className="text-xs font-bold text-indigo-300 uppercase tracking-widest">Resumen IA del día</span>
          </div>
          <div className="flex items-center gap-2">
            {!aiSummary && !aiLoading && (
              <button onClick={fetchAiSummary}
                className="text-xs px-3 py-1 bg-indigo-600 hover:bg-indigo-500 text-white rounded-lg font-medium transition-all">
                Generar
              </button>
            )}
            {aiSummary && (
              <button onClick={() => setAiExpanded(e => !e)} className="text-indigo-400 hover:text-indigo-300 transition-colors">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className={`w-4 h-4 transition-transform ${aiExpanded ? 'rotate-180' : ''}`}><path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7"/></svg>
              </button>
            )}
            {aiSummary && (
              <button onClick={fetchAiSummary} title="Regenerar" className="text-indigo-500 hover:text-indigo-400">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="w-3.5 h-3.5"><path strokeLinecap="round" strokeLinejoin="round" d="M16.023 9.348h4.992v-.001M2.985 19.644v-4.992m0 0h4.992m-4.993 0l3.181 3.183a8.25 8.25 0 0013.803-3.7M4.031 9.865a8.25 8.25 0 0113.803-3.7l3.181 3.182m0-4.991v4.99" /></svg>
              </button>
            )}
          </div>
        </div>
        {aiLoading && (
          <div className="px-4 pb-4 flex items-center gap-2">
            <div className="flex gap-1">
              {[0,1,2].map(i => <span key={i} className="w-1.5 h-1.5 rounded-full bg-indigo-400 animate-bounce" style={{ animationDelay: i * 0.15 + 's' }} />)}
            </div>
            <span className="text-xs text-indigo-400">Claude está analizando tus datos...</span>
          </div>
        )}
        {aiSummary && aiExpanded && (
          <div className="px-4 pb-4">
            <p className="text-sm text-indigo-100 leading-relaxed">{aiSummary}</p>
          </div>
        )}
        {!aiSummary && !aiLoading && (
          <div className="px-4 pb-3">
            <p className="text-xs text-indigo-600">Presá &ldquo;Generar&rdquo; para que Claude analice el estado actual de tus campañas.</p>
          </div>
        )}
      </div>

      {/* HERO ROW */}
      <div className="flex gap-3 overflow-x-auto pb-1">
        <HeroKpi label="ROAS Real" value={realRoas ? realRoas.toFixed(2) + 'x' : '—'} sub="TN ÷ gasto Meta" status={roasStatus} accent="bg-emerald-400"
          delta={calcDelta(realRoas, prevSnapshot?.summary?.blended_roas)} />
        <HeroKpi label={`Ventas TN ${pLabel}`} value={fmtM(tnRevenue)} sub="todas las fuentes" accent="bg-violet-400" />
        <HeroKpi label={`Gasto Meta ${pLabel}`} value={fmtM(metaSpend)} sub="ARS invertido" accent="bg-blue-400"
          delta={calcDelta(metaSpend, prevSummary?.total_spend_7d)} loading={period === 'today' && todayLoading} />
        <HeroKpi label="CPA blended" value={summary.blended_cpa ? fmtM(summary.blended_cpa) : '—'} sub={`bk ${fmtM(BREAKEVEN_CPA)}`} status={cpaStatus} invertDelta accent="bg-amber-400" delta={calcDelta(summary.blended_cpa, prevSummary?.blended_cpa)} />
        <HeroKpi label="Compras pixel" value={String(metaPurchases)} sub={metaPurchases > 0 && periodDays > 1 ? `~${(metaPurchases / periodDays).toFixed(1)}/día` : undefined} accent="bg-blue-400" loading={period === 'today' && todayLoading} />
      </div>

      {/* Custom date picker */}
      {period === 'custom' && (
        <div className="flex flex-wrap items-end gap-3 bg-white dark:bg-zinc-900 border border-gray-200 dark:border-zinc-800 rounded-xl px-4 py-3 shadow-sm">
          <div><label className="block text-xs text-gray-500 mb-1">Desde</label>
            <input type="date" value={customFrom} onChange={e => setCustomFrom(e.target.value)} className="text-sm bg-gray-50 dark:bg-zinc-800 border border-gray-200 dark:border-zinc-700 rounded-lg px-3 py-1.5 text-gray-900 dark:text-zinc-100 focus:outline-none focus:ring-2 focus:ring-indigo-400" /></div>
          <div><label className="block text-xs text-gray-500 mb-1">Hasta</label>
            <input type="date" value={customTo} onChange={e => setCustomTo(e.target.value)} className="text-sm bg-gray-50 dark:bg-zinc-800 border border-gray-200 dark:border-zinc-700 rounded-lg px-3 py-1.5 text-gray-900 dark:text-zinc-100 focus:outline-none focus:ring-2 focus:ring-indigo-400" /></div>
          <button onClick={fetchCustom} disabled={customLoading} className="px-4 py-1.5 text-xs font-semibold bg-indigo-600 hover:bg-indigo-700 disabled:opacity-50 text-white rounded-lg transition-all">
            {customLoading ? 'Consultando...' : 'Consultar'}</button>
          {customError && <p className="text-xs text-red-500">{customError}</p>}
        </div>
      )}

      {/* Attribution note */}
      {(period === 'today' || period === 'yesterday') && hasPeriodData && (
        <div className="flex items-start gap-2 bg-amber-50 dark:bg-amber-950/30 border border-amber-200 dark:border-amber-900/50 rounded-xl px-4 py-2.5">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="w-4 h-4 text-amber-500 shrink-0 mt-0.5"><path strokeLinecap="round" strokeLinejoin="round" d="M12 9v3.75m-9.303 3.376c-.866 1.5.217 3.374 1.948 3.374h14.71c1.73 0 2.813-1.874 1.948-3.374L13.949 3.378c-.866-1.5-3.032-1.5-3.898 0L2.697 16.126zM12 15.75h.007v.008H12v-.008z" /></svg>
          <p className="text-xs text-amber-700 dark:text-amber-400">
            {period === 'today'
              ? <><strong>ROAS real hoy: {realRoas?.toFixed(2) ?? '—'}x</strong> (ventas TN / gasto) vs <strong>{summary.blended_roas?.toFixed(2) ?? '—'}x</strong> reportado por Meta.</>
              : 'ROAS de ayer puede incluir conversiones de dias anteriores (ventana de atribucion Meta).'}
          </p>
        </div>
      )}

      {/* BUSINESS INSIGHTS ROW — 4 preguntas de negocio */}
      {(() => {
        // Breakeven ROAS mínimo = 1 / margen
        const beRoas = 1 / MARGIN  // ≈ 1.77x con margen 56.5%
        const roasVsBe = realRoas != null ? Math.min((realRoas / beRoas) * 100, 100) : null
        const roasBeStatus = realRoas == null ? 'neutral' : realRoas >= beRoas ? 'ok' : realRoas >= beRoas * 0.8 ? 'warn' : 'bad'

        // Alerta más urgente
        const topAlert = summary.alerts?.find(a => a.severity === 'danger') ?? summary.alerts?.[0] ?? null
        const urgentStatus: 'ok'|'warn'|'bad' = topAlert
          ? (topAlert.severity === 'danger' ? 'bad' : 'warn')
          : fatigueStatus === 'bad' ? 'bad'
          : fatigueStatus === 'warn' ? 'warn'
          : 'ok'
        const urgentBorderL = urgentStatus === 'bad' ? 'border-l-red-400 dark:border-l-red-500'
          : urgentStatus === 'warn' ? 'border-l-amber-400 dark:border-l-amber-500'
          : 'border-l-emerald-400 dark:border-l-emerald-500'
        const urgentBg = urgentStatus === 'bad'
          ? 'bg-gradient-to-br from-red-50/60 to-white dark:from-red-950/20 dark:to-zinc-900'
          : urgentStatus === 'warn'
          ? 'bg-gradient-to-br from-amber-50/60 to-white dark:from-amber-950/20 dark:to-zinc-900'
          : 'bg-white dark:bg-zinc-900'

        return (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-3">

            {/* Card 1: ¿Gané plata? */}
            <div className={`rounded-xl border border-gray-100 dark:border-zinc-800 border-l-[3px] ${grossProfit == null ? 'border-l-gray-100 dark:border-l-zinc-800 bg-white dark:bg-zinc-900' : grossProfit >= 0 ? 'border-l-emerald-400 dark:border-l-emerald-500 bg-gradient-to-br from-emerald-50/60 to-white dark:from-emerald-950/20 dark:to-zinc-900' : 'border-l-red-400 dark:border-l-red-500 bg-gradient-to-br from-red-50/60 to-white dark:from-red-950/20 dark:to-zinc-900'} p-4 shadow-sm`}>
              <div className="flex items-center gap-1 mb-1.5">
                <p className="text-[11px] font-semibold text-gray-400 dark:text-zinc-500 uppercase tracking-wider">¿Gané plata?</p>
                <InfoTooltip text={`Ventas TN × ${Math.round(MARGIN*100)}% margen − gasto Meta. Costo/orden: merch $19.5K + envío $5.8K + plataforma $1.4K + packaging $350 = $27K.`} />
              </div>
              <p className={`text-3xl font-bold tabular-nums leading-none ${grossProfit == null ? 'text-gray-300 dark:text-zinc-700' : grossProfit >= 0 ? 'text-emerald-600 dark:text-emerald-400' : 'text-red-600 dark:text-red-400'}`}>
                {grossProfit != null ? fmtM(grossProfit) : '—'}
              </p>
              <p className="text-[10px] text-gray-400 dark:text-zinc-500 mt-2 leading-snug">
                {tnRevenue ? fmtM(tnRevenue) : '—'} × {Math.round(MARGIN*100)}% − {fmtM(metaSpend)}
              </p>
              {grossProfit != null && (
                <div className="mt-2.5 flex items-center gap-1.5">
                  <span className={`text-[11px] font-semibold px-2 py-0.5 rounded-full ${grossProfit >= 0 ? 'bg-emerald-100 dark:bg-emerald-950/60 text-emerald-700 dark:text-emerald-400' : 'bg-red-100 dark:bg-red-950/60 text-red-700 dark:text-red-400'}`}>
                    {grossProfit >= 0 ? 'Rentable' : 'Sin cubrir'}
                  </span>
                  {contributionPct != null && (
                    <span className="text-[11px] text-gray-400 dark:text-zinc-600">{contributionPct}% del total</span>
                  )}
                </div>
              )}
            </div>

            {/* Card 2: ¿Cubrí la inversión? — siempre visible */}
            <div className={`rounded-xl border border-gray-100 dark:border-zinc-800 border-l-[3px] ${
              period === 'today'
                ? (bePct == null ? 'border-l-gray-100 dark:border-l-zinc-800 bg-white dark:bg-zinc-900'
                  : bePct >= 100 ? 'border-l-emerald-400 dark:border-l-emerald-500 bg-gradient-to-br from-emerald-50/60 to-white dark:from-emerald-950/20 dark:to-zinc-900'
                  : bePct >= 60  ? 'border-l-amber-400 dark:border-l-amber-500 bg-gradient-to-br from-amber-50/60 to-white dark:from-amber-950/20 dark:to-zinc-900'
                  : 'border-l-red-400 dark:border-l-red-500 bg-gradient-to-br from-red-50/60 to-white dark:from-red-950/20 dark:to-zinc-900')
                : (roasBeStatus === 'ok' ? 'border-l-emerald-400 dark:border-l-emerald-500 bg-gradient-to-br from-emerald-50/60 to-white dark:from-emerald-950/20 dark:to-zinc-900'
                  : roasBeStatus === 'warn' ? 'border-l-amber-400 dark:border-l-amber-500 bg-gradient-to-br from-amber-50/60 to-white dark:from-amber-950/20 dark:to-zinc-900'
                  : roasBeStatus === 'bad' ? 'border-l-red-400 dark:border-l-red-500 bg-gradient-to-br from-red-50/60 to-white dark:from-red-950/20 dark:to-zinc-900'
                  : 'border-l-gray-100 dark:border-l-zinc-800 bg-white dark:bg-zinc-900')
            } p-4 shadow-sm`}>
              <div className="flex items-center gap-1 mb-1.5">
                <p className="text-[11px] font-semibold text-gray-400 dark:text-zinc-500 uppercase tracking-wider">¿Cubrí la inversión?</p>
                <InfoTooltip text={period === 'today' ? `Compras necesarias para cubrir el gasto de hoy: gasto ÷ CPA bk ${fmtM(BREAKEVEN_CPA)}.` : `ROAS mínimo para no perder plata: 1 ÷ ${Math.round(MARGIN*100)}% margen = ${beRoas.toFixed(2)}x. Tu ROAS real es ${realRoas?.toFixed(2) ?? '—'}x.`} />
              </div>
              {period === 'today' && dailyBudget > 0 ? (
                <>
                  <p className={`text-3xl font-bold tabular-nums leading-none ${bePct == null ? 'text-gray-300 dark:text-zinc-700' : bePct >= 100 ? 'text-emerald-600 dark:text-emerald-400' : bePct >= 60 ? 'text-amber-600 dark:text-amber-400' : 'text-red-600 dark:text-red-400'}`}>
                    {beCurrentPurchases ?? 0}<span className="text-xl text-gray-400 dark:text-zinc-600">/{beTargetPurchases ?? '?'}</span>
                  </p>
                  <p className="text-[10px] text-gray-400 dark:text-zinc-500 mt-1.5">compras para cubrir el gasto</p>
                  <div className="mt-2 h-1.5 bg-gray-100 dark:bg-zinc-800 rounded-full overflow-hidden">
                    <div className={`h-full rounded-full transition-all ${(bePct ?? 0) >= 100 ? 'bg-emerald-400' : (bePct ?? 0) >= 60 ? 'bg-amber-400' : 'bg-red-400'}`}
                         style={{ width: `${Math.min(bePct ?? 0, 100)}%` }} />
                  </div>
                  <p className="text-[10px] text-gray-400 dark:text-zinc-600 mt-1.5">
                    {beRemaining === 0 ? 'Breakeven alcanzado' : `Faltan ${beRemaining ?? '?'} · CPA bk ${fmtM(BREAKEVEN_CPA)}`}
                  </p>
                </>
              ) : (
                <>
                  <p className={`text-3xl font-bold tabular-nums leading-none ${roasBeStatus === 'ok' ? 'text-emerald-600 dark:text-emerald-400' : roasBeStatus === 'warn' ? 'text-amber-600 dark:text-amber-400' : roasBeStatus === 'bad' ? 'text-red-600 dark:text-red-400' : 'text-gray-300 dark:text-zinc-700'}`}>
                    {realRoas ? realRoas.toFixed(2) + 'x' : '—'}
                  </p>
                  <p className="text-[10px] text-gray-400 dark:text-zinc-500 mt-1.5">mínimo para BEP: {beRoas.toFixed(2)}x</p>
                  {roasVsBe != null && (
                    <div className="mt-2 h-1.5 bg-gray-100 dark:bg-zinc-800 rounded-full overflow-hidden">
                      <div className={`h-full rounded-full transition-all ${roasBeStatus === 'ok' ? 'bg-emerald-400' : roasBeStatus === 'warn' ? 'bg-amber-400' : 'bg-red-400'}`}
                           style={{ width: `${roasVsBe}%` }} />
                    </div>
                  )}
                  <p className="text-[10px] text-gray-400 dark:text-zinc-600 mt-1.5">
                    {roasBeStatus === 'ok' ? `+${((realRoas! / beRoas - 1) * 100).toFixed(0)}% sobre el mínimo` : roasBeStatus === 'warn' ? 'Casi en punto de equilibrio' : 'Por debajo del BEP'}
                  </p>
                </>
              )}
            </div>

            {/* Card 3: ¿Cómo termino el mes? */}
            <div className="rounded-xl border border-gray-100 dark:border-zinc-800 border-l-[3px] border-l-violet-400 dark:border-l-violet-500 bg-gradient-to-br from-violet-50/60 to-white dark:from-violet-950/20 dark:to-zinc-900 p-4 shadow-sm">
              <div className="flex items-center gap-1 mb-1.5">
                <p className="text-[11px] font-semibold text-gray-400 dark:text-zinc-500 uppercase tracking-wider">¿Cómo termino el mes?</p>
                <InfoTooltip text={`Si mantenés el ritmo de los últimos 7 días todo el mes (${daysInMonth} días). TN revenue 7d: ${fmtM(tnRev7d)} → ${fmtM(dailyRevAvg7d)}/día promedio.`} />
              </div>
              <p className={`text-3xl font-bold tabular-nums leading-none ${projRevenueMonth == null ? 'text-gray-300 dark:text-zinc-700' : 'text-violet-600 dark:text-violet-400'}`}>
                {projRevenueMonth != null ? fmtM(projRevenueMonth) : '—'}
              </p>
              <p className="text-[10px] text-gray-400 dark:text-zinc-500 mt-1.5">ventas proyectadas</p>
              {projProfitMonth != null && (
                <p className={`text-sm font-semibold mt-2 ${projProfitMonth >= 0 ? 'text-emerald-600 dark:text-emerald-400' : 'text-red-600 dark:text-red-400'}`}>
                  {fmtM(projProfitMonth)} ganancia · ritmo 7d
                </p>
              )}
              <p className="text-[10px] text-gray-400 dark:text-zinc-600 mt-1">{daysRemaining}d restantes · {fmtM(dailyRevAvg7d)}/día promedio</p>
            </div>

            {/* Card 4: Acción urgente */}
            <div className={`rounded-xl border border-gray-100 dark:border-zinc-800 border-l-[3px] ${urgentBorderL} ${urgentBg} p-4 shadow-sm`}>
              <p className="text-[11px] font-semibold text-gray-400 dark:text-zinc-500 uppercase tracking-wider mb-1.5">Acción urgente</p>
              {topAlert ? (
                <>
                  <div className={`inline-block text-[11px] font-semibold px-2 py-0.5 rounded-full mb-2 ${topAlert.severity === 'danger' ? 'bg-red-100 dark:bg-red-950/60 text-red-700 dark:text-red-400' : 'bg-amber-100 dark:bg-amber-950/60 text-amber-700 dark:text-amber-400'}`}>
                    {topAlert.severity === 'danger' ? 'Crítico' : 'Atención'}
                  </div>
                  <p className="text-sm font-semibold text-gray-800 dark:text-zinc-200 leading-snug line-clamp-1">{topAlert.entity_name}</p>
                  <p className="text-[11px] text-gray-500 dark:text-zinc-400 mt-1 leading-snug line-clamp-2">{topAlert.message}</p>
                </>
              ) : fatigueStatus !== 'ok' ? (
                <>
                  <div className={`inline-block text-[11px] font-semibold px-2 py-0.5 rounded-full mb-2 ${fatigueStatus === 'bad' ? 'bg-red-100 dark:bg-red-950/60 text-red-700 dark:text-red-400' : 'bg-amber-100 dark:bg-amber-950/60 text-amber-700 dark:text-amber-400'}`}>
                    {fatigueStatus === 'bad' ? 'Creativos saturados' : 'Frecuencia alta'}
                  </div>
                  <p className="text-3xl font-bold tabular-nums leading-none text-gray-800 dark:text-zinc-200">{convFreq > 0 ? convFreq.toFixed(1) + 'x' : '—'}</p>
                  <p className="text-[11px] text-gray-500 dark:text-zinc-400 mt-1.5 leading-snug">{fatigueMsg}</p>
                </>
              ) : (
                <>
                  <div className="inline-block text-[11px] font-semibold px-2 py-0.5 rounded-full mb-2 bg-emerald-100 dark:bg-emerald-950/60 text-emerald-700 dark:text-emerald-400">
                    Todo en orden
                  </div>
                  <p className="text-sm text-gray-500 dark:text-zinc-400 mt-1 leading-snug">Sin alertas activas · Frecuencia saludable {convFreq > 0 ? `(${convFreq.toFixed(1)}x)` : ''}</p>
                </>
              )}
            </div>
          </div>
        )
      })()}

      {/* 1. TIENDANUBE */}
      <div>
        <SectionLabel title={`Tiendanube · ${PERIOD_LABELS[period]}`} sub="Ventas reales de la tienda — todas las fuentes de tráfico"
          color="bg-violet-100 dark:bg-violet-900/30 text-violet-600 dark:text-violet-400"
          icon={<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" className="w-4 h-4"><path d="M6 2L3 6v14a2 2 0 002 2h14a2 2 0 002-2V6l-3-4z"/><line x1="3" y1="6" x2="21" y2="6"/><path d="M16 10a4 4 0 01-8 0"/></svg>} />
        <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-3">
          <KpiCard label="Ventas totales" value={fmtM(tnRevenue)} sub={tnRevenue && periodDays > 1 ? fmtM(tnRevenue / periodDays) + '/día' : undefined} accent="bg-violet-400" tooltip="Total facturado en Tiendanube." />
          <KpiCard label="Órdenes" value={tnData?.total_orders != null ? String(tnData.total_orders) : '—'} sub={tnData?.total_orders && periodDays > 1 ? `~${(tnData.total_orders / periodDays).toFixed(1)}/día` : undefined} accent="bg-violet-400" tooltip="Órdenes pagadas en el período." />
          <KpiCard label="Ticket promedio" value={fmtM(tnData?.aov)} sub="por orden" accent="bg-violet-400" tooltip="Valor promedio por orden (AOV)." />
          <KpiCard label="Clientes únicos" value={tnData?.unique_customers != null ? String(tnData.unique_customers) : '—'} sub="compradores" accent="bg-violet-400" tooltip="Clientes con al menos una compra." />
          <KpiCard label="Unidades vendidas" value={tnData?.total_units_sold != null ? String(tnData.total_units_sold) : '—'} sub="artículos" accent="bg-violet-400" tooltip="Total de artículos vendidos." />
          <KpiCard
            label="Órd./cliente"
            value={tnData?.total_orders && tnData?.unique_customers && tnData.unique_customers > 0
              ? (tnData.total_orders / tnData.unique_customers).toFixed(2) : '—'}
            sub="ratio recompra"
            accent="bg-violet-400"
            status={tnData?.total_orders && tnData?.unique_customers && tnData.unique_customers > 0
              ? (tnData.total_orders / tnData.unique_customers) >= 1.2 ? 'ok' : (tnData.total_orders / tnData.unique_customers) >= 1.05 ? 'warn' : 'neutral'
              : 'neutral'}
            tooltip="Órdenes ÷ Clientes. >1.2 = buena recompra."
          />
        </div>
        {/* YTD Summary */}
        {ytdRev != null && (
          <div className="mt-3 flex items-center gap-4 text-xs text-gray-500 dark:text-zinc-500 bg-gray-50 dark:bg-zinc-800/50 rounded-xl px-4 py-2.5 border border-gray-100 dark:border-zinc-800">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" className="w-3.5 h-3.5 text-violet-400 shrink-0"><rect x="3" y="4" width="18" height="18" rx="2"/><line x1="16" y1="2" x2="16" y2="6"/><line x1="8" y1="2" x2="8" y2="6"/><line x1="3" y1="10" x2="21" y2="10"/></svg>
            <span className="font-semibold text-gray-600 dark:text-zinc-400">Año en curso:</span>
            <span>Ventas YTD: <strong className="text-violet-500">{fmtM(ytdRev)}</strong></span>
            {ytdOrders != null && <span>Órdenes: <strong className="text-violet-500">{ytdOrders}</strong></span>}
            {ytdRev != null && ytdOrders != null && ytdOrders > 0 && (
              <span>AOV: <strong className="text-violet-500">{fmtM(Math.round(ytdRev / ytdOrders))}</strong></span>
            )}
          </div>
        )}
      </div>

      {/* 2. META ADS */}
      <div>
        <SectionLabel title={`Meta Ads · ${PERIOD_LABELS[period]}`} sub="Performance de las campañas de publicidad pagada"
          color="bg-blue-100 dark:bg-blue-900/30 text-blue-600 dark:text-blue-400"
          icon={<svg viewBox="0 0 24 24" fill="currentColor" className="w-4 h-4"><path d="M12 2.04C6.5 2.04 2 6.53 2 12.06C2 17.06 5.66 21.21 10.44 21.96V14.96H7.9V12.06H10.44V9.85C10.44 7.34 11.93 5.96 14.22 5.96C15.31 5.96 16.45 6.15 16.45 6.15V8.62H15.19C13.95 8.62 13.56 9.39 13.56 10.18V12.06H16.34L15.89 14.96H13.56V21.96C18.34 21.21 22 17.06 22 12.06C22 6.53 17.5 2.04 12 2.04Z"/></svg>} />
        <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-3">
          <KpiCard label={`Gasto ${pLabel}`} value={fmtM(metaSpend)} sub="ARS invertido" accent="bg-blue-400" delta={calcDelta(metaSpend, prevSummary?.total_spend_7d)} tooltip="Total invertido en Meta Ads." anomaly={spendAnomaly} />
          <KpiCard label="Budget/día" value={fmtM(summary.daily_budget_active)} sub="ARS activo" accent="bg-blue-400" tooltip="Presupuesto diario activo." />
          <KpiCard label={`Compras ${pLabel}`} value={String(metaPurchases)} sub={metaPurchases > 0 && periodDays > 1 ? `~${(metaPurchases / periodDays).toFixed(1)}/día` : undefined} accent="bg-blue-400" delta={calcDelta(metaPurchases, prevSummary?.total_purchases_7d)} tooltip="Compras atribuidas por pixel Meta." anomaly={purchAnomaly} />
          <KpiCard label="ROAS real" value={realRoas ? realRoas.toFixed(2) + 'x' : '—'} sub="ventas TN / gasto" status={roasStatus} accent="bg-blue-400" tooltip="ROAS real = ventas TN ÷ gasto Meta." />
          <KpiCard label="CPA blend." value={summary.blended_cpa ? fmtM(summary.blended_cpa) : '—'} sub={`bk ${fmtM(BREAKEVEN_CPA)}`} status={cpaStatus} invertDelta accent="bg-blue-400" delta={calcDelta(summary.blended_cpa, prevSummary?.blended_cpa)} tooltip={`Costo por compra. Verde = debajo de ${fmtM(BREAKEVEN_CPA)}.`} anomaly={cpaAnomaly} />
          <KpiCard label="Ad sets activos" value={String(summary.active_adsets || 0)} sub="corriendo" accent="bg-blue-400" tooltip="Ad sets ACTIVE en este momento." />
        </div>
      </div>

      {/* BUDGET PACING */}
      {period === 'today' && dailyBudget > 0 && pacePct != null && (
        <div className="bg-white dark:bg-zinc-900 rounded-xl border border-gray-100 dark:border-zinc-800 p-4 shadow-sm">
          <div className="flex items-center justify-between mb-3">
            <div className="flex items-center gap-2">
              <div className="w-7 h-7 rounded-lg bg-blue-100 dark:bg-blue-900/30 flex items-center justify-center">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" className="w-4 h-4 text-blue-600 dark:text-blue-400" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/></svg>
              </div>
              <div>
                <p className="text-xs font-bold text-gray-700 dark:text-zinc-200">Pacing del día</p>
                <p className="text-[10px] text-gray-400 dark:text-zinc-500">Gasto vs ritmo esperado a las {new Date().getHours()}h</p>
              </div>
            </div>
            <span className={`text-xs font-bold px-2.5 py-1 rounded-lg ${pacingStatus === 'ok' ? 'bg-emerald-100 dark:bg-emerald-950/40 text-emerald-600 dark:text-emerald-400' : pacingStatus === 'warn' ? 'bg-amber-100 dark:bg-amber-950/40 text-amber-600 dark:text-amber-400' : 'bg-red-100 dark:bg-red-950/40 text-red-600 dark:text-red-400'}`}>
              {pacingLabel}
            </span>
          </div>
          <div className="relative h-3 bg-gray-100 dark:bg-zinc-800 rounded-full overflow-hidden">
            <div className="absolute top-0 bottom-0 w-px bg-zinc-400 dark:bg-zinc-500 opacity-50 z-10" style={{ left: `${Math.min(expectedPct, 99)}%` }} />
            <div className={`h-full rounded-full transition-all duration-500 ${pacingStatus === 'ok' ? 'bg-emerald-400' : pacingStatus === 'warn' ? 'bg-amber-400' : 'bg-red-400'}`}
                 style={{ width: `${Math.min(pacePct, 100)}%` }} />
          </div>
          <div className="flex justify-between text-[10px] text-gray-400 dark:text-zinc-600 mt-2">
            <span>Gastado: <strong className="text-gray-600 dark:text-zinc-300">{fmtM(spendToday)}</strong> ({pacePct.toFixed(0)}%)</span>
            <span>Budget: <strong className="text-gray-600 dark:text-zinc-300">{fmtM(dailyBudget)}</strong></span>
          </div>
          <p className="text-[10px] text-gray-400 dark:text-zinc-600 mt-1">
            Ritmo esperado: {expectedPct.toFixed(0)}% &middot; {pacingRatio != null ? `${(pacingRatio * 100).toFixed(0)}% del ritmo` : ''}
          </p>
        </div>
      )}

      {/* 3. CALIDAD PUBLICITARIA */}
      <div>
        <SectionLabel title="Calidad publicitaria" sub="Métricas de alcance y eficiencia — separadas por tipo de campaña"
          color="bg-indigo-100 dark:bg-indigo-900/30 text-indigo-600 dark:text-indigo-400"
          icon={<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" className="w-4 h-4"><polyline points="22 12 18 12 15 21 9 3 6 12 2 12"/></svg>} />
        <div className="space-y-3">
          {convAdsets.length > 0 && (
            <div>
              <p className="text-[10px] font-bold text-blue-500 dark:text-blue-400 uppercase tracking-widest mb-2 flex items-center gap-1.5">
                <span className="w-1.5 h-1.5 rounded-full bg-blue-500 inline-block" /> Conversión
              </p>
              <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                <KpiCard label="Impresiones" value={convQ.impressions > 0 ? fmtImpr(convQ.impressions) : '—'} sub="vistas" accent="bg-blue-400" tooltip="Impresiones totales de conv." />
                <KpiCard label="CTR" value={convQ.ctr ? convQ.ctr.toFixed(2) + '%' : '—'} sub="clicks / impr." status={ctrConvSt} accent="bg-blue-400" tooltip="CTR conv. >1.2% bueno." />
                <KpiCard label="Frecuencia" value={convQ.freq ? convQ.freq.toFixed(1) + 'x' : '—'} sub="veces/persona" status={freqConvSt} invertDelta accent="bg-blue-400" tooltip=">3x puede causar fatiga." />
                <KpiCard label="CPC conv." value={convQ.cpc ? fmtM(convQ.cpc) : '—'} sub="costo por click" accent="bg-blue-400" tooltip="CPC campañas de conv." />
              </div>
            </div>
          )}
          {trafAdsets.length > 0 && (
            <div>
              <p className="text-[10px] font-bold text-violet-500 dark:text-violet-400 uppercase tracking-widest mb-2 flex items-center gap-1.5">
                <span className="w-1.5 h-1.5 rounded-full bg-violet-500 inline-block" /> Tráfico web
              </p>
              <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                <KpiCard label="Impresiones" value={trafQ.impressions > 0 ? fmtImpr(trafQ.impressions) : '—'} sub="vistas" accent="bg-violet-400" tooltip="Impresiones tráfico." />
                <KpiCard label="CTR" value={trafQ.ctr ? trafQ.ctr.toFixed(2) + '%' : '—'} sub="clicks / impr." status={ctrTrafSt} accent="bg-violet-400" tooltip="CTR tráfico." />
                <KpiCard label="Frecuencia" value={trafQ.freq ? trafQ.freq.toFixed(1) + 'x' : '—'} sub="veces/persona" status={freqTrafSt} invertDelta accent="bg-violet-400" tooltip=">4x indica saturación." />
                <KpiCard label="CPC tráfico" value={trafQ.cpc ? fmtM(trafQ.cpc) : '—'} sub="costo por click" accent="bg-violet-400" tooltip="CPC tráfico web." />
              </div>
            </div>
          )}
        </div>
      </div>

      {/* TENDENCIA HISTORICA */}
      {historicalSnapshots.length >= 3 && (
        <div>
          <SectionLabel title="Tendencia 30 días" sub="ROAS real y gasto semanal — últimos 30 snapshots"
            color="bg-teal-100 dark:bg-teal-900/30 text-teal-600 dark:text-teal-400"
            icon={<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" className="w-4 h-4"><polyline points="23 6 13.5 15.5 8.5 10.5 1 18"/><polyline points="17 6 23 6 23 12"/></svg>} />
          <div className="bg-white dark:bg-zinc-900 rounded-xl border border-gray-100 dark:border-zinc-800 p-4 shadow-sm">
            <ResponsiveContainer width="100%" height={220}>
              <AreaChart
                data={historicalSnapshots.map(s => ({
                  date: s.snapshot_date.slice(5),
                  roas: s.summary.blended_roas ?? null,
                  gasto: s.summary.total_spend_7d ? Math.round(s.summary.total_spend_7d / 1000) : null,
                }))}
                margin={{ top: 8, right: 28, left: -8, bottom: 0 }}
              >
                <defs>
                  <linearGradient id="roasGrad" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="#10b981" stopOpacity={0.25}/>
                    <stop offset="95%" stopColor="#10b981" stopOpacity={0}/>
                  </linearGradient>
                  <linearGradient id="gastoGrad" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="#6366f1" stopOpacity={0.18}/>
                    <stop offset="95%" stopColor="#6366f1" stopOpacity={0}/>
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" stroke="rgba(128,128,128,0.1)" vertical={false} />
                <XAxis dataKey="date" tick={{ fontSize: 10, fill: '#71717a' }} tickLine={false} axisLine={false} interval="preserveStartEnd" />
                <YAxis yAxisId="roas" domain={[0, 'auto']} tick={{ fontSize: 10, fill: '#71717a' }} tickLine={false} axisLine={false} tickFormatter={v => v + 'x'} width={32} />
                <YAxis yAxisId="gasto" orientation="right" tick={{ fontSize: 10, fill: '#71717a' }} tickLine={false} axisLine={false} tickFormatter={v => '$' + v + 'K'} width={44} />
                <ReferenceLine yAxisId="roas" y={2.86} stroke="#f59e0b" strokeDasharray="4 2" strokeWidth={1.5}
                  label={{ value: 'mín', position: 'right', fontSize: 9, fill: '#f59e0b', offset: 4 }} />
                <RechartTooltip
                  contentStyle={{ fontSize: 11, borderRadius: 10, border: '1px solid rgba(100,100,100,0.2)', background: '#18181b', color: '#e4e4e7', padding: '8px 12px' }}
                  labelStyle={{ color: '#a1a1aa', marginBottom: 4 }}
                  formatter={(value: number, name: string) => {
                    if (name === 'ROAS') return [value?.toFixed(2) + 'x', 'ROAS blend.']
                    if (name === 'Gasto 7d') return ['$' + value + 'K ARS', 'Gasto 7d']
                    return [value, name]
                  }}
                />
                <Legend wrapperStyle={{ fontSize: 10, paddingTop: 8, color: '#71717a' }} />
                <Area yAxisId="roas" type="monotone" dataKey="roas" name="ROAS" stroke="#10b981" strokeWidth={2} fill="url(#roasGrad)" dot={false} activeDot={{ r: 4, fill: '#10b981' }} connectNulls />
                <Area yAxisId="gasto" type="monotone" dataKey="gasto" name="Gasto 7d" stroke="#6366f1" strokeWidth={2} fill="url(#gastoGrad)" dot={false} activeDot={{ r: 4, fill: '#6366f1' }} connectNulls />
              </AreaChart>
            </ResponsiveContainer>
          </div>
        </div>
      )}

      {/* HIGHLIGHTS */}
      <div>
        <SectionLabel title="Highlights del período" sub="Lo más relevante de un vistazo"
          color="bg-emerald-100 dark:bg-emerald-900/30 text-emerald-600 dark:text-emerald-400"
          icon={<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" className="w-4 h-4"><polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2"/></svg>} />
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-3">
          {/* Mejor Creativo Conversion */}
          <div className="bg-white dark:bg-zinc-900 rounded-xl border border-gray-100 dark:border-zinc-800 p-4 shadow-sm">
            <div className="flex items-center gap-2 mb-3">
              <div className="w-6 h-6 rounded-lg bg-blue-100 dark:bg-blue-900/30 flex items-center justify-center">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" className="w-3.5 h-3.5 text-blue-600 dark:text-blue-400" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/></svg>
              </div>
              <p className="text-[10px] font-bold text-gray-400 dark:text-zinc-500 uppercase tracking-wider">Mejor creativo conv.</p>
            </div>
            {bestConvAd ? (
              <>
                <p className="text-xs font-semibold text-gray-800 dark:text-zinc-200 leading-snug mb-2 line-clamp-2">{bestConvAd.name}</p>
                <div className="flex items-center gap-2">
                  <span className={`text-xl font-bold ${(bestConvAd.roas||0)>=5?'text-emerald-500':(bestConvAd.roas||0)>=3?'text-blue-500':'text-amber-500'}`}>{bestConvAd.roas?.toFixed(2)}x</span>
                  <span className="text-xs text-gray-400">ROAS</span>
                  <span className="text-xs text-gray-400 ml-auto">{fmtM(bestConvAd.spend)}</span>
                </div>
                {bestConvAd.results != null && <p className="text-xs text-gray-400 dark:text-zinc-600 mt-1">{bestConvAd.results} compras &middot; CPA {fmtM(bestConvAd.cost_per_result)}</p>}
              </>
            ) : <p className="text-xs text-gray-400 dark:text-zinc-600">Sin creativos con ROAS calculado</p>}
          </div>

          {/* Mejor Creativo Trafico */}
          <div className="bg-white dark:bg-zinc-900 rounded-xl border border-gray-100 dark:border-zinc-800 p-4 shadow-sm">
            <div className="flex items-center gap-2 mb-3">
              <div className="w-6 h-6 rounded-lg bg-violet-100 dark:bg-violet-900/30 flex items-center justify-center">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" className="w-3.5 h-3.5 text-violet-600 dark:text-violet-400" strokeLinecap="round" strokeLinejoin="round"><path d="M5 12h14M12 5l7 7-7 7"/></svg>
              </div>
              <p className="text-[10px] font-bold text-gray-400 dark:text-zinc-500 uppercase tracking-wider">Mejor creativo tráfico</p>
            </div>
            {bestTrafAd ? (
              <>
                <p className="text-xs font-semibold text-gray-800 dark:text-zinc-200 leading-snug mb-2 line-clamp-2">{bestTrafAd.name}</p>
                <div className="flex items-center gap-2">
                  <span className="text-xl font-bold text-violet-500">{bestTrafAd.spend && bestTrafAd.clicks ? fmtM(bestTrafAd.spend / bestTrafAd.clicks) : '—'}</span>
                  <span className="text-xs text-gray-400">CPC</span>
                  <span className="text-xs text-gray-400 ml-auto">{bestTrafAd.clicks?.toLocaleString('es-AR')} clicks</span>
                </div>
                {bestTrafAd.ctr != null && <p className="text-xs text-gray-400 dark:text-zinc-600 mt-1">CTR {bestTrafAd.ctr.toFixed(2)}% &middot; {fmtM(bestTrafAd.spend)} gasto</p>}
              </>
            ) : <p className="text-xs text-gray-400 dark:text-zinc-600">Sin creativos de tráfico con datos</p>}
          </div>

          {/* Ventas por origen */}
          <div className="bg-white dark:bg-zinc-900 rounded-xl border border-gray-100 dark:border-zinc-800 p-4 shadow-sm">
            <div className="flex items-center gap-2 mb-3">
              <div className="w-6 h-6 rounded-lg bg-indigo-100 dark:bg-indigo-900/30 flex items-center justify-center">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" className="w-3.5 h-3.5 text-indigo-600 dark:text-indigo-400" strokeLinecap="round" strokeLinejoin="round"><rect x="2" y="3" width="20" height="14" rx="2"/><path d="M8 21h8M12 17v4"/></svg>
              </div>
              <p className="text-[10px] font-bold text-gray-400 dark:text-zinc-500 uppercase tracking-wider">Ventas por origen</p>
            </div>
            {tnRevenue && tnRevenue > 0 ? (
              <div className="space-y-2.5">
                <div>
                  <div className="flex justify-between text-xs mb-1">
                    <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-sm bg-indigo-500 inline-block"/>Meta</span>
                    <span className="font-semibold text-gray-700 dark:text-zinc-300">{fmtM(metaAttr)} &middot; {metaPct}%</span>
                  </div>
                  <div className="w-full bg-gray-100 dark:bg-zinc-800 rounded-full h-2">
                    <div className="h-2 rounded-full bg-indigo-500 transition-all" style={{ width: `${Math.min(metaPct,100)}%` }} />
                  </div>
                </div>
                <div>
                  <div className="flex justify-between text-xs mb-1">
                    <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-sm bg-emerald-500 inline-block"/>Orgánico</span>
                    <span className="font-semibold text-gray-700 dark:text-zinc-300">{fmtM(organicRev)} &middot; {organicPct}%</span>
                  </div>
                  <div className="w-full bg-gray-100 dark:bg-zinc-800 rounded-full h-2">
                    <div className="h-2 rounded-full bg-emerald-500 transition-all" style={{ width: `${Math.min(organicPct,100)}%` }} />
                  </div>
                </div>
              </div>
            ) : <p className="text-xs text-gray-400 dark:text-zinc-600">Sin datos de TN para este período</p>}
          </div>

          {/* Top Provincias */}
          <div className="bg-white dark:bg-zinc-900 rounded-xl border border-gray-100 dark:border-zinc-800 p-4 shadow-sm">
            <div className="flex items-center gap-2 mb-3">
              <div className="w-6 h-6 rounded-lg bg-emerald-100 dark:bg-emerald-900/30 flex items-center justify-center">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" className="w-3.5 h-3.5 text-emerald-600 dark:text-emerald-400" strokeLinecap="round" strokeLinejoin="round"><path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z"/><circle cx="12" cy="10" r="3"/></svg>
              </div>
              <p className="text-[10px] font-bold text-gray-400 dark:text-zinc-500 uppercase tracking-wider">Top provincias TN</p>
            </div>
            {topProvince && tnData?.top_provinces ? (
              <div className="space-y-2">
                {tnData.top_provinces.slice(0,4).map((p: { name: string; count: number }) => {
                  const pct = tnData.total_orders > 0 ? (p.count / tnData.total_orders) * 100 : 0
                  const isTop = p.name === topProvince.name
                  return (
                    <div key={p.name} className="flex items-center gap-2">
                      <span className={`text-[10px] w-20 truncate ${isTop ? 'font-semibold text-gray-700 dark:text-zinc-200' : 'text-gray-400 dark:text-zinc-600'}`}>{p.name}</span>
                      <div className="flex-1 bg-gray-100 dark:bg-zinc-800 rounded-full h-1.5">
                        <div className={`h-1.5 rounded-full ${isTop ? 'bg-emerald-500' : 'bg-emerald-300 dark:bg-emerald-700'}`} style={{ width: `${Math.min(pct,100)}%` }} />
                      </div>
                      <span className="text-[10px] text-gray-400 w-8 text-right">{Math.round(pct)}%</span>
                    </div>
                  )
                })}
              </div>
            ) : <p className="text-xs text-gray-400 dark:text-zinc-600">Sin datos de TN para este período</p>}
          </div>
        </div>

        {/* Top 5 productos */}
        {tnData?.top_products && tnData.top_products.length > 0 && (
          <div className="mt-3 bg-white dark:bg-zinc-900 rounded-xl border border-gray-100 dark:border-zinc-800 overflow-hidden shadow-sm">
            <div className="flex items-center gap-2 px-4 py-3 border-b border-gray-100 dark:border-zinc-800">
              <div className="w-6 h-6 rounded-lg bg-violet-100 dark:bg-violet-900/30 flex items-center justify-center">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" className="w-3.5 h-3.5 text-violet-600 dark:text-violet-400" strokeLinecap="round" strokeLinejoin="round"><path d="M6 2L3 6v14a2 2 0 002 2h14a2 2 0 002-2V6l-3-4z"/><line x1="3" y1="6" x2="21" y2="6"/><path d="M16 10a4 4 0 01-8 0"/></svg>
              </div>
              <p className="text-xs font-bold text-gray-700 dark:text-zinc-200">Top productos &middot; {PERIOD_LABELS[period]}</p>
            </div>
            <div className="divide-y divide-gray-50 dark:divide-zinc-800/60">
              {tnData.top_products.slice(0, 5).map((p: { name: string; quantity: number; revenue: number }, i: number) => {
                const maxRev = tnData.top_products[0].revenue || 1
                const barPct = Math.round((p.revenue / maxRev) * 100)
                const metaAdMatch = adsets.find((a: { name: string }) => a.name.toLowerCase().split(' ').some((w: string) => w.length > 4 && p.name.toLowerCase().includes(w)))
                return (
                  <div key={p.name} className="flex items-center gap-3 px-4 py-2.5">
                    <span className="text-[10px] text-gray-400 dark:text-zinc-600 w-3 font-mono shrink-0">{i + 1}</span>
                    <div className="flex-1 min-w-0">
                      <p className="text-xs font-medium text-gray-800 dark:text-zinc-200 truncate">{p.name}</p>
                      <div className="mt-1 h-1 bg-gray-100 dark:bg-zinc-800 rounded-full overflow-hidden w-full">
                        <div className="h-full bg-violet-400 rounded-full" style={{ width: `${barPct}%` }} />
                      </div>
                    </div>
                    <div className="flex items-center gap-4 shrink-0 text-right">
                      <div><p className="text-xs font-bold text-gray-700 dark:text-zinc-200">{fmtM(p.revenue)}</p><p className="text-[10px] text-gray-400">{p.quantity} uds</p></div>
                      {metaAdMatch && <div className="hidden sm:block text-[10px] text-blue-500 dark:text-blue-400 bg-blue-50 dark:bg-blue-950/30 px-1.5 py-0.5 rounded-full max-w-[80px] truncate" title={(metaAdMatch as { name: string }).name}>&harr; Meta</div>}
                    </div>
                  </div>
                )
              })}
            </div>
          </div>
        )}
      </div>

      {/* Alertas */}
      {summary.alerts && summary.alerts.length > 0 && (
        <div>
          <SectionLabel title="Alertas activas" sub="Ad sets que requieren atención"
            color="bg-amber-100 dark:bg-amber-900/30 text-amber-600 dark:text-amber-400"
            icon={<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" className="w-4 h-4"><path strokeLinecap="round" strokeLinejoin="round" d="M12 9v3.75m-9.303 3.376c-.866 1.5.217 3.374 1.948 3.374h14.71c1.73 0 2.813-1.874 1.948-3.374L13.949 3.378c-.866-1.5-3.032-1.5-3.898 0L2.697 16.126zM12 15.75h.007v.008H12v-.008z" /></svg>} />
          <div className="space-y-2">
            {summary.alerts.slice(0,5).map((alert, i) => (
              <div key={i} className={`flex items-start gap-3 px-4 py-3 rounded-xl border ${alert.severity==='danger'?'bg-red-50 dark:bg-red-950/20 border-red-200 dark:border-red-900/50':alert.severity==='warning'?'bg-amber-50 dark:bg-amber-950/20 border-amber-200 dark:border-amber-900/50':'bg-blue-50 dark:bg-blue-950/20 border-blue-200 dark:border-blue-900/50'}`}>
                <div className={`w-2 h-2 rounded-full mt-1.5 shrink-0 ${alert.severity==='danger'?'bg-red-500':alert.severity==='warning'?'bg-amber-500':'bg-blue-500'}`} />
                <div>
                  <p className={`font-semibold text-sm ${alert.severity==='danger'?'text-red-800 dark:text-red-300':alert.severity==='warning'?'text-amber-800 dark:text-amber-300':'text-blue-800 dark:text-blue-300'}`}>{alert.entity_name}</p>
                  <p className="text-xs text-gray-500 dark:text-zinc-400 mt-0.5">{alert.message}</p>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* FUNNEL + RECONCILIACION */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <div className="bg-white dark:bg-zinc-900 rounded-xl border border-gray-100 dark:border-zinc-800 p-4 shadow-sm">
          <div className="flex items-center justify-between mb-4">
            <div className="flex items-center gap-2">
              <div className="w-7 h-7 rounded-lg bg-blue-100 dark:bg-blue-900/30 flex items-center justify-center">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" className="w-4 h-4 text-blue-600 dark:text-blue-400" strokeLinecap="round" strokeLinejoin="round"><path d="M3 4h18v2l-7 7v7l-4-2v-5L3 6V4z"/></svg>
              </div>
              <div>
                <p className="text-xs font-bold text-gray-700 dark:text-zinc-200">Funnel de conversión</p>
                <p className="text-[10px] text-gray-400 dark:text-zinc-500">Impresiones → Tiendanube · {PERIOD_LABELS[period]}</p>
              </div>
            </div>
          </div>
          {(() => {
            const totalImpressions = [...convAdsets, ...trafAdsets].reduce((s, a) => s + (a.impressions || 0), 0)
            const totalClicks      = [...convAdsets, ...trafAdsets].reduce((s, a) => s + (a.clicks     || 0), 0)
            const tnOrders         = tnData?.total_orders || 0
            const funnelSteps = [
              { label: 'Impresiones', value: totalImpressions, color: '#3b82f6' },
              { label: 'Clicks',      value: totalClicks,      color: '#6366f1' },
              { label: 'Compras Meta',value: metaPurchases,    color: '#8b5cf6' },
              { label: 'Órdenes TN',  value: tnOrders,         color: '#7c3aed' },
            ].filter(s => s.value > 0)
            const ctr   = totalImpressions > 0 ? (totalClicks / totalImpressions * 100).toFixed(2) : null
            const cvr   = totalClicks > 0 ? (metaPurchases / totalClicks * 100).toFixed(2) : null
            const attr  = tnOrders > 0 && metaPurchases > 0 ? Math.round(metaPurchases / tnOrders * 100) : null
            return (
              <div>
                <FunnelSteps steps={funnelSteps} />
                {(ctr || cvr || attr != null) && (
                  <div className="mt-3 pt-3 border-t border-gray-100 dark:border-zinc-800 grid grid-cols-3 gap-2 text-center">
                    {ctr && (
                      <div>
                        <p className="text-[10px] text-gray-400 dark:text-zinc-500">CTR</p>
                        <p className="text-xs font-bold text-blue-500">{ctr}%</p>
                      </div>
                    )}
                    {cvr && (
                      <div>
                        <p className="text-[10px] text-gray-400 dark:text-zinc-500">CVR</p>
                        <p className="text-xs font-bold text-indigo-500">{cvr}%</p>
                      </div>
                    )}
                    {attr != null && (
                      <div>
                        <p className="text-[10px] text-gray-400 dark:text-zinc-500">Pixel</p>
                        <p className={`text-xs font-bold ${attr >= 60 ? 'text-emerald-500' : attr >= 40 ? 'text-amber-500' : 'text-red-500'}`}>{attr}%</p>
                      </div>
                    )}
                  </div>
                )}
              </div>
            )
          })()}
        </div>

        <div className="bg-white dark:bg-zinc-900 rounded-xl border border-gray-100 dark:border-zinc-800 p-4 shadow-sm">
          <div className="flex items-center gap-2 mb-4">
            <div className="w-7 h-7 rounded-lg bg-amber-100 dark:bg-amber-900/30 flex items-center justify-center">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" className="w-4 h-4 text-amber-600 dark:text-amber-400" strokeLinecap="round" strokeLinejoin="round"><path d="M8 3H5a2 2 0 0 0-2 2v3m18 0V5a2 2 0 0 0-2-2h-3m0 18h3a2 2 0 0 0 2-2v-3M3 16v3a2 2 0 0 0 2 2h3"/></svg>
            </div>
            <div>
              <p className="text-xs font-bold text-gray-700 dark:text-zinc-200">Reconciliación &middot; Meta vs TN</p>
              <p className="text-[10px] text-gray-400 dark:text-zinc-500">Pixel reportado vs ventas reales</p>
            </div>
          </div>
          <div className="space-y-3">
            <div className="flex items-center justify-between py-2 px-3 rounded-lg bg-blue-50 dark:bg-blue-950/20 border border-blue-100 dark:border-blue-900/30">
              <div className="flex items-center gap-2">
                <div className="w-2 h-2 rounded-full bg-blue-400 shrink-0" />
                <p className="text-xs font-medium text-gray-700 dark:text-zinc-300">Meta pixel (atribuido)</p>
              </div>
              <div className="text-right">
                <p className="text-sm font-bold text-blue-600 dark:text-blue-400">{metaPurchases} compras</p>
                <p className="text-[10px] text-gray-400">ROAS {summary.blended_roas?.toFixed(2) ?? '—'}x</p>
              </div>
            </div>
            <div className="flex items-center justify-between py-2 px-3 rounded-lg bg-violet-50 dark:bg-violet-950/20 border border-violet-100 dark:border-violet-900/30">
              <div className="flex items-center gap-2">
                <div className="w-2 h-2 rounded-full bg-violet-400 shrink-0" />
                <p className="text-xs font-medium text-gray-700 dark:text-zinc-300">Tiendanube (real)</p>
              </div>
              <div className="text-right">
                <p className="text-sm font-bold text-violet-600 dark:text-violet-400">{tnData?.total_orders ?? '—'} órdenes</p>
                <p className="text-[10px] text-gray-400">ROAS {realRoas?.toFixed(2) ?? '—'}x</p>
              </div>
            </div>
            {tnData?.total_orders != null && metaPurchases != null && (
              <div className="flex items-center justify-between py-2 px-3 rounded-lg bg-gray-50 dark:bg-zinc-800/60 border border-gray-200 dark:border-zinc-700">
                <p className="text-xs text-gray-500 dark:text-zinc-400">Gap de atribución</p>
                <div className="text-right">
                  <p className="text-sm font-bold text-gray-600 dark:text-zinc-300">
                    {tnData.total_orders - metaPurchases} órdenes no capturadas
                  </p>
                  <p className="text-[10px] text-gray-400">
                    {tnData.total_orders > 0
                      ? Math.round(((tnData.total_orders - metaPurchases) / tnData.total_orders) * 100)
                      : 0}% sin atribución Meta
                  </p>
                </div>
              </div>
            )}
            {/* Explanatory note */}
            <div className="mt-1 px-1">
              <p className="text-[10px] text-gray-400 dark:text-zinc-600 leading-relaxed">
                El ROAS de Meta usa ventana de atribución 7d click + 1d view. El ROAS de TN es ventas reales ÷ gasto.
                {summary.blended_roas != null && realRoas != null && summary.blended_roas > realRoas * 3 && (
                  <span className="text-amber-500 dark:text-amber-400 font-medium"> · Brecha alta: verificá que el pixel envíe valores en ARS.</span>
                )}
              </p>
            </div>
          </div>
        </div>
      </div>

      {/* CTA */}
      <div className="flex items-center justify-between pt-2 border-t border-gray-100 dark:border-zinc-800">
        <p className="text-xs text-gray-400 dark:text-zinc-600">Para gestionar ad sets, creativos y presupuesto entrá a <strong className="text-gray-600 dark:text-zinc-400">Campañas</strong>.</p>
        <a href="/campanias" className="text-xs font-semibold text-indigo-600 dark:text-indigo-400 hover:underline">Ver Campañas →</a>
      </div>

    </div>
  )
}
