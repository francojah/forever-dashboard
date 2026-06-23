'use client'

import React, { useState } from 'react'
import type { Adset, Ad } from '@/lib/supabase'
import { InfoTooltip } from '@/components/ui/InfoTooltip'

const BREAKEVEN_CPA = 30462
const ROAS_BE       = 1.77   // 1 / 0.53 margen

function isTrafficAdset(a: Adset, campaignMap: Record<string, string>): boolean {
  const TRAFFIC_GOALS = ['LINK_CLICKS', 'LANDING_PAGE_VIEWS', 'REACH', 'BRAND_AWARENESS', 'POST_ENGAGEMENT']
  if (TRAFFIC_GOALS.includes(a.optimization_goal || '')) return true
  const campName = (campaignMap[a.campaign_id] || '').toLowerCase()
  return campName.includes('trafico') || campName.includes('tráfico') || campName.includes('traffic')
}

// ── Health status dot ─────────────────────────────────────────────
function healthStatus(cpa: number | null | undefined, roas: number | null | undefined, freq: number | null | undefined, spend: number): 'ok' | 'warn' | 'bad' | 'neutral' {
  if (!spend || spend < 500) return 'neutral'
  if (freq && freq >= 4)                          return 'bad'
  if (cpa  && cpa > BREAKEVEN_CPA * 1.3)         return 'bad'
  if (freq && freq >= 2.5)                        return 'warn'
  if (cpa  && cpa > BREAKEVEN_CPA)               return 'warn'
  if (roas && roas < ROAS_BE && spend > 2000)    return 'warn'
  return 'ok'
}

function HealthDot({ cpa, roas, freq, spend }: { cpa?: number | null; roas?: number | null; freq?: number | null; spend: number }) {
  const s = healthStatus(cpa, roas, freq, spend)
  const map = {
    ok:      { dot: 'bg-emerald-400', label: 'Saludable',  tip: 'CPA ok · ROAS ok · Frecuencia normal' },
    warn:    { dot: 'bg-amber-400',   label: 'Atención',   tip: cpa && cpa > BREAKEVEN_CPA ? `CPA $${Math.round(cpa/1000)}K supera BE $${Math.round(BREAKEVEN_CPA/1000)}K` : freq && freq >= 2.5 ? `Frecuencia ${freq?.toFixed(1)}x en zona de alerta` : 'Revisar métricas' },
    bad:     { dot: 'bg-red-400',     label: 'Crítico',    tip: cpa && cpa > BREAKEVEN_CPA * 1.3 ? `CPA $${Math.round(cpa!/1000)}K muy alto — ${Math.round(cpa!/BREAKEVEN_CPA*100-100)}% sobre BE` : `Frecuencia ${freq?.toFixed(1)}x — audiencia saturada` },
    neutral: { dot: 'bg-gray-300 dark:bg-zinc-600', label: 'Sin datos', tip: 'Gasto insuficiente para evaluar' },
  }[s]
  return (
    <span className="inline-flex items-center gap-1.5 group relative">
      <span className={`w-2 h-2 rounded-full shrink-0 ${map.dot}`} />
      <span className="text-[11px] font-medium text-gray-500 dark:text-zinc-400 hidden sm:inline">{map.label}</span>
      <span className="absolute bottom-full left-0 mb-1.5 w-52 text-[11px] bg-gray-900 text-white rounded-lg px-2.5 py-1.5 opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none z-10 shadow-xl">
        {map.tip}
      </span>
    </span>
  )
}

// ── Visual sub-components ─────────────────────────────────────────
function RoasBar({ roas }: { roas?: number | null }) {
  if (!roas) return <span className="text-gray-300 dark:text-zinc-700 text-xs">—</span>
  const pct   = Math.min((roas / (ROAS_BE * 3)) * 100, 100)
  const color = roas >= ROAS_BE * 3 ? 'bg-emerald-400' : roas >= ROAS_BE * 2 ? 'bg-blue-400' : roas >= ROAS_BE ? 'bg-amber-400' : 'bg-red-400'
  return (
    <div className="flex items-center gap-2 min-w-[80px]">
      <div className="flex-1 h-1.5 bg-gray-100 dark:bg-zinc-800 rounded-full overflow-hidden">
        <div className={`h-full rounded-full ${color}`} style={{ width: pct + '%' }} />
      </div>
      <span className={`text-xs font-bold tabular-nums ${roas >= ROAS_BE ? 'text-emerald-600 dark:text-emerald-400' : 'text-red-500'}`}>
        {roas.toFixed(2)}x
      </span>
    </div>
  )
}

function CpaChip({ cpa }: { cpa?: number | null }) {
  if (!cpa) return <span className="text-gray-300 dark:text-zinc-700 text-xs">—</span>
  const color = cpa <= BREAKEVEN_CPA       ? 'text-emerald-600 dark:text-emerald-400 bg-emerald-50 dark:bg-emerald-950/30'
    : cpa <= BREAKEVEN_CPA * 1.3           ? 'text-amber-600 dark:text-amber-400 bg-amber-50 dark:bg-amber-950/30'
    : 'text-red-600 dark:text-red-400 bg-red-50 dark:bg-red-950/30'
  return <span className={`text-xs font-semibold px-1.5 py-0.5 rounded-md tabular-nums ${color}`}>${Math.round(cpa).toLocaleString('es-AR')}</span>
}

function CtrBadge({ ctr }: { ctr?: number | null }) {
  if (!ctr) return <span className="text-gray-300 dark:text-zinc-700 text-xs">—</span>
  const color = ctr >= 1.2 ? 'text-emerald-600 dark:text-emerald-400' : ctr >= 0.6 ? 'text-amber-600 dark:text-amber-400' : 'text-red-500'
  return <span className={`text-xs font-medium tabular-nums ${color}`}>{ctr.toFixed(2)}%</span>
}

function FreqBadge({ freq }: { freq?: number | null }) {
  if (!freq) return <span className="text-gray-300 dark:text-zinc-700 text-xs">—</span>
  const color = freq >= 4 ? 'text-red-500 font-bold' : freq >= 2.5 ? 'text-amber-500 dark:text-amber-400' : 'text-gray-500 dark:text-zinc-400'
  return <span className={`text-xs tabular-nums ${color}`}>{freq.toFixed(1)}x</span>
}

function VideoMetric({ value, greenThreshold, amberThreshold }: { value?: number | null; greenThreshold: number; amberThreshold: number }) {
  if (value == null) return <span className="text-gray-300 dark:text-zinc-700 text-xs">—</span>
  const color = value >= greenThreshold ? 'text-emerald-600 dark:text-emerald-400' : value >= amberThreshold ? 'text-amber-600 dark:text-amber-400' : 'text-gray-400 dark:text-zinc-600'
  return <span className={`text-xs font-medium tabular-nums ${color}`}>{value.toFixed(1)}%</span>
}

function Chevron({ open }: { open: boolean }) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"
      className={`w-3 h-3 transition-transform duration-150 ${open ? 'rotate-180' : ''}`}>
      <path d="M19 9l-7 7-7-7"/>
    </svg>
  )
}

// ── Creative performance badge ────────────────────────────────────
type CreativeRank = 'top' | 'mid' | 'low' | 'fatigued' | 'paused'

interface RankResult {
  rank: CreativeRank
  tooltip: string
}

function getCreativeRank(ad: Ad, allAds: Ad[], type: 'conversion' | 'traffic'): RankResult {
  // Saturación — umbral absoluto, prioridad máxima
  if (ad.status === 'PAUSED') return { rank: 'paused', tooltip: 'Ad pausado en Meta.' }
  if (ad.frequency && ad.frequency >= 4) {
    return { rank: 'fatigued', tooltip: `Frecuencia ${ad.frequency.toFixed(1)}x — la misma persona ve este ad demasiadas veces. Renovar creativo.` }
  }

  const activeAds = allAds.filter(a => a.status === 'ACTIVE' && (a.spend || 0) > 500)
  if (activeAds.length < 2) return { rank: 'mid', tooltip: '' }

  if (type === 'conversion') {
    const cpas = activeAds.map(a => a.cost_per_result).filter(Boolean) as number[]
    if (!cpas.length || !ad.cost_per_result) return { rank: 'mid', tooltip: '' }
    const sorted = [...cpas].sort((a, b) => a - b)
    const rank   = sorted.indexOf(ad.cost_per_result)
    const cpaK   = (v: number) => '$' + Math.round(v / 1000) + 'K'
    const beK    = cpaK(BREAKEVEN_CPA)

    // TOP: mejor CPA del ad set Y rentable (por debajo del BE)
    if (rank === 0 && ad.cost_per_result < BREAKEVEN_CPA) {
      const diff = Math.round((sorted[1] - sorted[0]) / 1000)
      return {
        rank: 'top',
        tooltip: `Mejor CPA del ad set (${cpaK(ad.cost_per_result)} vs BE ${beK}). ${sorted.length > 1 ? `${diff}K más eficiente que el siguiente.` : ''}`,
      }
    }
    // BAJO: peor CPA del ad set Y sobre el breakeven (pierde plata)
    if (rank >= sorted.length - 1 && ad.cost_per_result > BREAKEVEN_CPA) {
      const overBE = Math.round((ad.cost_per_result - BREAKEVEN_CPA) / 1000)
      return {
        rank: 'low',
        tooltip: `CPA ${cpaK(ad.cost_per_result)} supera el breakeven (${beK}) en $${overBE}K — cada venta pierde dinero. Evaluar pausar o renovar.`,
      }
    }
  } else {
    // Tráfico: ranking por CTR
    const ctrs = activeAds.map(a => a.ctr).filter(Boolean) as number[]
    if (!ctrs.length || !ad.ctr) return { rank: 'mid', tooltip: '' }
    const sorted = [...ctrs].sort((a, b) => b - a)
    const rank   = sorted.indexOf(ad.ctr)

    if (rank === 0 && ad.ctr >= 1.2) {
      return { rank: 'top', tooltip: `Mejor CTR del ad set (${ad.ctr.toFixed(2)}%). La audiencia responde bien a este creativo.` }
    }
    if (rank >= sorted.length - 1 && ad.ctr < 0.5 && (ad.spend || 0) > 2000) {
      return { rank: 'low', tooltip: `CTR ${ad.ctr.toFixed(2)}% muy bajo con $${Math.round((ad.spend || 0) / 1000)}K gastados. Revisar el hook o cambiar creativo.` }
    }
  }
  return { rank: 'mid', tooltip: '' }
}

function CreativeBadge({ rank, tooltip }: { rank: CreativeRank; tooltip: string }) {
  const map = {
    top:      { label: 'TOP',      cls: 'bg-emerald-100 dark:bg-emerald-950/60 text-emerald-700 dark:text-emerald-300 border border-emerald-200 dark:border-emerald-800' },
    mid:      null,
    low:      { label: 'BAJO',     cls: 'bg-red-50 dark:bg-red-950/40 text-red-600 dark:text-red-400 border border-red-200 dark:border-red-800' },
    fatigued: { label: 'SATURADO', cls: 'bg-amber-50 dark:bg-amber-950/40 text-amber-700 dark:text-amber-400 border border-amber-200 dark:border-amber-800' },
    paused:   { label: 'PAUSADO',  cls: 'bg-gray-100 dark:bg-zinc-800 text-gray-400 dark:text-zinc-500 border border-gray-200 dark:border-zinc-700' },
  }[rank]
  if (!map) return null
  return (
    <span className="relative group/badge inline-flex">
      <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded-md uppercase tracking-wide cursor-help ${map.cls}`}>
        {map.label}
      </span>
      {tooltip && (
        <span className="absolute bottom-full left-0 mb-2 w-60 text-[11px] leading-snug bg-gray-900 dark:bg-zinc-700 text-white rounded-lg px-3 py-2 opacity-0 group-hover/badge:opacity-100 transition-opacity pointer-events-none z-20 shadow-xl">
          {tooltip}
        </span>
      )}
    </span>
  )
}

// ── Format badge (video vs image) ─────────────────────────────────
function FormatBadge({ ad }: { ad: Ad }) {
  const isVideo = (ad.hook_rate != null && ad.hook_rate > 0) || (ad.view_rate != null && ad.view_rate > 0)
  return (
    <span className={`text-[10px] font-medium px-1.5 py-0.5 rounded-md ${isVideo ? 'bg-blue-50 dark:bg-blue-950/40 text-blue-600 dark:text-blue-400' : 'bg-gray-100 dark:bg-zinc-800 text-gray-500 dark:text-zinc-500'}`}>
      {isVideo ? '▶ VID' : '🖼 IMG'}
    </span>
  )
}

// ── Creative sub-table ────────────────────────────────────────────
function AdsSubTable({ ads, type, colCount }: {
  ads: Ad[]; type: 'conversion' | 'traffic'; colCount: number
}) {
  if (ads.length === 0) return (
    <tr><td colSpan={colCount} className="px-8 py-3 text-xs text-gray-400 dark:text-zinc-600 italic">Sin creativos con datos en este periodo.</td></tr>
  )
  const isConv = type === 'conversion'
  const sortedAds = [...ads].sort((a, b) => (b.spend || 0) - (a.spend || 0))

  return (
    <tr>
      <td colSpan={colCount} className="px-0 py-0">
        <div className="bg-gray-50/80 dark:bg-zinc-800/60">
          <table className="w-full text-xs">
            <thead>
              <tr className="border-t border-gray-100 dark:border-zinc-700">
                <th className="pl-12 pr-2 py-2 text-left text-gray-400 dark:text-zinc-500 font-semibold uppercase tracking-wide">Creativo</th>
                <th className="px-2 py-2 text-right text-gray-400 dark:text-zinc-500 font-semibold uppercase tracking-wide">Gasto</th>
                {isConv ? (
                  <>
                    <th className="px-2 py-2 text-right text-gray-400 dark:text-zinc-500 font-semibold uppercase tracking-wide">Compras</th>
                    <th className="px-2 py-2 text-right text-gray-400 dark:text-zinc-500 font-semibold uppercase tracking-wide">CPA</th>
                    <th className="px-2 py-2 text-left  text-gray-400 dark:text-zinc-500 font-semibold uppercase tracking-wide">ROAS</th>
                  </>
                ) : (
                  <>
                    <th className="px-2 py-2 text-right text-gray-400 dark:text-zinc-500 font-semibold uppercase tracking-wide">Clicks</th>
                    <th className="px-2 py-2 text-right text-gray-400 dark:text-zinc-500 font-semibold uppercase tracking-wide">CPC</th>
                  </>
                )}
                <th className="px-2 py-2 text-right text-gray-400 dark:text-zinc-500 font-semibold uppercase tracking-wide">CTR</th>
                <th className="px-2 py-2 text-right text-gray-400 dark:text-zinc-500 font-semibold uppercase tracking-wide">
                  <span className="inline-flex items-center gap-1">Frec.<InfoTooltip text="Frecuencia promedio. >3x puede indicar saturación." /></span>
                </th>
                <th className="px-2 py-2 text-right text-gray-400 dark:text-zinc-500 font-semibold uppercase tracking-wide">
                  <span className="inline-flex items-center gap-1">Hook%<InfoTooltip text="% que inició reproducción. Bueno >20%." /></span>
                </th>
                <th className="px-2 py-2 text-right text-gray-400 dark:text-zinc-500 font-semibold uppercase tracking-wide">
                  <span className="inline-flex items-center gap-1">View%<InfoTooltip text="% que vio ≥50% del video. Bueno >25%." /></span>
                </th>
              </tr>
            </thead>
            <tbody>
              {sortedAds.map(ad => {
                const { rank, tooltip } = getCreativeRank(ad, sortedAds, type)
                const adTint = rank === 'top'      ? 'bg-emerald-50/30 dark:bg-emerald-950/10'
                             : rank === 'low'      ? 'bg-red-50/30 dark:bg-red-950/10'
                             : rank === 'fatigued' ? 'bg-amber-50/30 dark:bg-amber-950/10'
                             : rank === 'paused'   ? 'opacity-50'
                             : ''
                return (
                  <tr key={ad.id} className={`border-t border-gray-100 dark:border-zinc-700/50 hover:bg-white/50 dark:hover:bg-zinc-800/30 transition-colors ${adTint}`}>
                    <td className="pl-12 pr-2 py-2.5 max-w-[200px]">
                      <div className="flex items-center gap-2 flex-wrap">
                        <FormatBadge ad={ad} />
                        <CreativeBadge rank={rank} tooltip={tooltip} />
                        <span className="text-gray-700 dark:text-zinc-200 leading-tight truncate max-w-[140px]" title={ad.name}>{ad.name}</span>
                      </div>
                    </td>
                    <td className="px-2 py-2.5 text-right text-gray-600 dark:text-zinc-300 tabular-nums">
                      {ad.spend ? '$' + Math.round(ad.spend).toLocaleString('es-AR') : '—'}
                    </td>
                    {isConv ? (
                      <>
                        <td className="px-2 py-2.5 text-right font-medium text-gray-700 dark:text-zinc-200">{ad.results ?? '—'}</td>
                        <td className="px-2 py-2.5 text-right"><CpaChip cpa={ad.cost_per_result} /></td>
                        <td className="px-2 py-2.5"><RoasBar roas={ad.roas} /></td>
                      </>
                    ) : (
                      <>
                        <td className="px-2 py-2.5 text-right text-gray-600 dark:text-zinc-300 tabular-nums">{ad.clicks ? ad.clicks.toLocaleString('es-AR') : '—'}</td>
                        <td className="px-2 py-2.5 text-right text-gray-600 dark:text-zinc-300 tabular-nums text-xs">
                          {ad.spend && ad.clicks ? '$' + Math.round(ad.spend / ad.clicks).toLocaleString('es-AR') : '—'}
                        </td>
                      </>
                    )}
                    <td className="px-2 py-2.5 text-right"><CtrBadge ctr={ad.ctr} /></td>
                    <td className="px-2 py-2.5 text-right"><FreqBadge freq={ad.frequency} /></td>
                    <td className="px-2 py-2.5 text-right"><VideoMetric value={ad.hook_rate} greenThreshold={20} amberThreshold={10} /></td>
                    <td className="px-2 py-2.5 text-right"><VideoMetric value={ad.view_rate} greenThreshold={25} amberThreshold={12} /></td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      </td>
    </tr>
  )
}

// ── Ad Set section ────────────────────────────────────────────────
interface SectionProps {
  title:       string
  type:        'conversion' | 'traffic'
  adsets:      Adset[]
  ads:         Ad[]
  campaignMap: Record<string, string>
  period?:     string
}

function AdsetSection({ title, type, adsets, ads, campaignMap, period }: SectionProps) {
  const [open, setOpen]           = useState(true)
  const [expandedIds, setExpanded]= useState<Set<string>>(new Set())
  const [collapsedCamps, setColl] = useState<Set<string>>(new Set())

  const toggleCamp   = (id: string) => setColl(prev  => { const n = new Set(prev); n.has(id) ? n.delete(id) : n.add(id); return n })
  const toggleExpand = (id: string) => setExpanded(prev => { const n = new Set(prev); n.has(id) ? n.delete(id) : n.add(id); return n })

  const totalSpend  = adsets.reduce((s, a) => s + (a.spend       || 0), 0)
  const totalBudget = adsets.reduce((s, a) => s + (a.daily_budget || 0), 0)
  const isConv      = type === 'conversion'
  const gradient    = isConv ? 'from-blue-600 to-blue-700' : 'from-violet-600 to-violet-700'

  const spendLabel  = period === 'hoy' ? 'Gasto Hoy' : period === 'ayer' ? 'Gasto Ayer' : period === '30d' ? 'Gasto 30d' : 'Gasto 7d'

  // cols: name | budget | spend | metrics (3-4) | freq | salud  = 8-9
  const TOTAL_COLS = isConv ? 9 : 8

  return (
    <div className="bg-white dark:bg-zinc-900 rounded-2xl border border-gray-200 dark:border-zinc-800 overflow-hidden shadow-sm">

      {/* Section header */}
      <button onClick={() => setOpen(o => !o)}
        className={`w-full bg-gradient-to-r ${gradient} px-5 py-3.5 flex items-center justify-between hover:opacity-95 transition-opacity`}>
        <div className="flex items-center gap-2.5">
          <span className="w-2.5 h-2.5 rounded-full bg-white/80 inline-block shrink-0" />
          <span className="text-sm font-bold text-white">{title}</span>
          <span className="text-xs text-white/60 bg-white/10 px-2 py-0.5 rounded-full">
            {adsets.length} ad set{adsets.length !== 1 ? 's' : ''}
          </span>
        </div>
        <div className="flex items-center gap-5">
          <div className="hidden sm:flex items-center gap-5 text-xs text-white/80">
            <span>{spendLabel}: <strong className="text-white">${Math.round(totalSpend).toLocaleString('es-AR')}</strong></span>
            {totalBudget > 0 && <span>Budget/día: <strong className="text-white">${Math.round(totalBudget).toLocaleString('es-AR')}</strong></span>}
          </div>
          <span className="text-white/70"><Chevron open={open} /></span>
        </div>
      </button>

      {open && (
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-gray-100 dark:border-zinc-800 bg-gray-50/60 dark:bg-zinc-800/40">
                <th className="text-left px-4 py-2.5 text-xs font-semibold text-gray-400 dark:text-zinc-500 uppercase tracking-wide">Ad Set</th>
                <th className="text-left px-3 py-2.5 text-xs font-semibold text-gray-400 dark:text-zinc-500 uppercase tracking-wide">Budget/día</th>
                <th className="text-right px-3 py-2.5 text-xs font-semibold text-gray-400 dark:text-zinc-500 uppercase tracking-wide">{spendLabel}</th>
                {isConv ? (
                  <>
                    <th className="text-right px-3 py-2.5 text-xs font-semibold text-gray-400 dark:text-zinc-500 uppercase tracking-wide">Compras</th>
                    <th className="text-right px-3 py-2.5 text-xs font-semibold text-gray-400 dark:text-zinc-500 uppercase tracking-wide">CPA</th>
                    <th className="text-left  px-3 py-2.5 text-xs font-semibold text-gray-400 dark:text-zinc-500 uppercase tracking-wide">ROAS</th>
                    <th className="text-right px-3 py-2.5 text-xs font-semibold text-gray-400 dark:text-zinc-500 uppercase tracking-wide">CTR</th>
                  </>
                ) : (
                  <>
                    <th className="text-right px-3 py-2.5 text-xs font-semibold text-gray-400 dark:text-zinc-500 uppercase tracking-wide">Impr.</th>
                    <th className="text-right px-3 py-2.5 text-xs font-semibold text-gray-400 dark:text-zinc-500 uppercase tracking-wide">Clicks</th>
                    <th className="text-right px-3 py-2.5 text-xs font-semibold text-gray-400 dark:text-zinc-500 uppercase tracking-wide">CPC</th>
                    <th className="text-right px-3 py-2.5 text-xs font-semibold text-gray-400 dark:text-zinc-500 uppercase tracking-wide">CTR</th>
                  </>
                )}
                <th className="text-right px-3 py-2.5 text-xs font-semibold text-gray-400 dark:text-zinc-500 uppercase tracking-wide">
                  <span className="inline-flex items-center gap-1">Frec.<InfoTooltip text="Frecuencia promedio. >3x puede causar fatiga de audiencia." /></span>
                </th>
                <th className="text-left px-3 py-2.5 text-xs font-semibold text-gray-400 dark:text-zinc-500 uppercase tracking-wide">
                  <span className="inline-flex items-center gap-1">Salud<InfoTooltip text={`Estado basado en CPA (BE: $${Math.round(BREAKEVEN_CPA/1000)}K), ROAS mínimo ${ROAS_BE}x y frecuencia.`} /></span>
                </th>
              </tr>
            </thead>
            <tbody>
              {Array.from(new Set(adsets.map(a => a.campaign_id))).map(campId => {
                const campAdsets = adsets.filter(a => a.campaign_id === campId)
                const campName   = campaignMap[campId] || 'Campaña sin nombre'
                const campSpend  = campAdsets.reduce((s, a) => s + (a.spend || 0), 0)
                const campBudget = campAdsets.reduce((s, a) => s + (a.daily_budget || 0), 0)
                const campOpen   = !collapsedCamps.has(campId)

                // Campaign-level health summary
                const campBad  = campAdsets.some(a => healthStatus(a.cost_per_result, a.roas, a.frequency, a.spend || 0) === 'bad')
                const campWarn = campAdsets.some(a => healthStatus(a.cost_per_result, a.roas, a.frequency, a.spend || 0) === 'warn')
                const campDotColor = campBad ? 'bg-red-400' : campWarn ? 'bg-amber-400' : 'bg-emerald-400'

                return (
                  <React.Fragment key={campId}>
                    {/* Campaign header row */}
                    <tr className="border-t-2 border-gray-200 dark:border-zinc-700 bg-gray-50/80 dark:bg-zinc-800/60 cursor-pointer hover:bg-gray-100/60 dark:hover:bg-zinc-800 transition-colors"
                        onClick={() => toggleCamp(campId)}>
                      <td colSpan={TOTAL_COLS} className="px-4 py-2.5">
                        <div className="flex items-center gap-2">
                          <span className="text-gray-500 dark:text-zinc-400"><Chevron open={campOpen} /></span>
                          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" className="w-3.5 h-3.5 text-gray-400 dark:text-zinc-500">
                            <path d="M22 12h-4l-3 9L9 3l-3 9H2"/>
                          </svg>
                          <span className={`w-1.5 h-1.5 rounded-full shrink-0 ${campDotColor}`} />
                          <span className="text-xs font-bold text-gray-700 dark:text-zinc-200">{campName}</span>
                          <span className="text-[10px] text-gray-400 dark:text-zinc-600 bg-gray-200 dark:bg-zinc-700 px-1.5 py-0.5 rounded-full">
                            {campAdsets.length} ad set{campAdsets.length !== 1 ? 's' : ''}
                          </span>
                          <div className="ml-auto flex items-center gap-4 text-xs text-gray-400 dark:text-zinc-500">
                            <span>Gasto: <strong className="text-gray-600 dark:text-zinc-300">${Math.round(campSpend).toLocaleString('es-AR')}</strong></span>
                            {campBudget > 0 && <span>Budget: <strong className="text-gray-600 dark:text-zinc-300">${Math.round(campBudget).toLocaleString('es-AR')}/día</strong></span>}
                          </div>
                        </div>
                      </td>
                    </tr>

                    {campOpen && campAdsets.map(adset => {
                      const adsetAds   = ads.filter(a => a.adset_id === adset.id).sort((a, b) => (b.spend || 0) - (a.spend || 0))
                      const isExpanded = expandedIds.has(adset.id)
                      const isPaused   = adset.status === 'PAUSED'
                      const cpa        = adset.cost_per_result
                      const roas       = adset.roas
                      const spend      = adset.spend || 0

                      const hs = healthStatus(cpa, roas, adset.frequency, spend)
                      const rowTint =
                        isPaused            ? 'opacity-60'
                        : hs === 'ok'       ? ''
                        : hs === 'warn'     ? 'bg-amber-50/30 dark:bg-amber-950/10'
                        : hs === 'bad'      ? 'bg-red-50/40 dark:bg-red-950/15'
                        : ''

                      return (
                        <React.Fragment key={adset.id}>
                          <tr className={`border-t border-gray-50 dark:border-zinc-800 hover:bg-gray-50/40 dark:hover:bg-zinc-800/30 transition-colors ${rowTint}`}>
                            {/* Name — click to expand creativos */}
                            <td className="px-4 py-3 pl-8 cursor-pointer" onClick={() => toggleExpand(adset.id)}>
                              <div className="flex items-center gap-2">
                                <span className="text-gray-400 dark:text-zinc-500 shrink-0"><Chevron open={isExpanded} /></span>
                                <p className="font-semibold text-gray-900 dark:text-white leading-tight text-sm truncate max-w-[180px]">{adset.name}</p>
                                {isPaused && <span className="text-[10px] bg-gray-100 dark:bg-zinc-800 text-gray-400 dark:text-zinc-500 px-1.5 py-0.5 rounded-full font-medium shrink-0">PAUSADO</span>}
                              </div>
                            </td>
                            {/* Budget (read-only) */}
                            <td className="px-3 py-3">
                              {adset.daily_budget && !isPaused
                                ? <span className="text-xs text-gray-500 dark:text-zinc-400 tabular-nums">${adset.daily_budget.toLocaleString('es-AR')}</span>
                                : <span className="text-xs text-gray-300 dark:text-zinc-700">—</span>}
                            </td>
                            <td className="px-3 py-3 text-right font-semibold text-gray-900 dark:text-white tabular-nums">
                              {spend ? '$' + Math.round(spend).toLocaleString('es-AR') : '—'}
                            </td>
                            {isConv ? (
                              <>
                                <td className="px-3 py-3 text-right">
                                  <span className={`text-sm font-bold ${(adset.results || 0) > 0 ? 'text-gray-900 dark:text-white' : 'text-gray-300 dark:text-zinc-600'}`}>
                                    {adset.results ?? '—'}
                                  </span>
                                </td>
                                <td className="px-3 py-3 text-right"><CpaChip cpa={cpa} /></td>
                                <td className="px-3 py-3"><RoasBar roas={roas} /></td>
                                <td className="px-3 py-3 text-right"><CtrBadge ctr={adset.ctr} /></td>
                              </>
                            ) : (
                              <>
                                <td className="px-3 py-3 text-right text-gray-600 dark:text-zinc-300 tabular-nums text-xs">{adset.impressions ? adset.impressions.toLocaleString('es-AR') : '—'}</td>
                                <td className="px-3 py-3 text-right text-gray-600 dark:text-zinc-300 tabular-nums text-xs">{adset.clicks ? adset.clicks.toLocaleString('es-AR') : '—'}</td>
                                <td className="px-3 py-3 text-right text-gray-600 dark:text-zinc-300 tabular-nums text-xs">
                                  {adset.spend && adset.clicks > 0 ? '$' + Math.round(adset.spend / adset.clicks).toLocaleString('es-AR') : '—'}
                                </td>
                                <td className="px-3 py-3 text-right"><CtrBadge ctr={adset.ctr} /></td>
                              </>
                            )}
                            <td className="px-3 py-3 text-right"><FreqBadge freq={adset.frequency} /></td>
                            <td className="px-3 py-3">
                              <HealthDot cpa={cpa} roas={roas} freq={adset.frequency} spend={spend} />
                            </td>
                          </tr>
                          {isExpanded && (
                            <AdsSubTable ads={adsetAds} type={type} colCount={TOTAL_COLS} />
                          )}
                        </React.Fragment>
                      )
                    })}
                  </React.Fragment>
                )
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}

// ── Export principal ──────────────────────────────────────────────
interface Props {
  adsets:      Adset[]
  ads:         Ad[]
  campaignMap: Record<string, string>
  breakeven?:  number
  period?:     string
  onAction?:   () => void
}

export default function AdsetTable({ adsets, ads, campaignMap, period }: Props) {
  const convAdsets    = adsets.filter(a => !isTrafficAdset(a, campaignMap))
  const trafficAdsets = adsets.filter(a =>  isTrafficAdset(a, campaignMap))

  return (
    <div className="space-y-5">
      {convAdsets.length > 0 && (
        <AdsetSection title="Conversión" type="conversion" adsets={convAdsets} ads={ads} campaignMap={campaignMap} period={period} />
      )}
      {trafficAdsets.length > 0 && (
        <AdsetSection title="Tráfico web" type="traffic" adsets={trafficAdsets} ads={ads} campaignMap={campaignMap} period={period} />
      )}
      {convAdsets.length === 0 && trafficAdsets.length === 0 && (
        <div className="text-center py-16 text-gray-400 dark:text-zinc-500">
          <p className="text-sm">Sin ad sets activos con datos en este período.</p>
        </div>
      )}
    </div>
  )
}
