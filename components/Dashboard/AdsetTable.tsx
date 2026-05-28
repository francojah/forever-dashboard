'use client'

import React, { useState, useCallback } from 'react'
import type { Adset, Ad } from '@/lib/supabase'
import { InfoTooltip } from '@/components/ui/InfoTooltip'

const ROAS_TARGET = 3.0

// -- Clasificacion ------------------------------------------------
function isTrafficAdset(adset: Adset, campaignMap: Record<string, string>): boolean {
  const goal = adset.optimization_goal || ''
  if (['LINK_CLICKS', 'LANDING_PAGE_VIEWS', 'REACH', 'BRAND_AWARENESS', 'POST_ENGAGEMENT'].includes(goal)) return true
  const campName = (campaignMap[adset.campaign_id] || '').toLowerCase()
  return campName.includes('trafico') || campName.includes('trafico') || campName.includes('traffic')
}

// -- UI helpers ---------------------------------------------------
function RoasBar({ roas }: { roas: number | null | undefined }) {
  if (!roas) return <span className="text-gray-300 dark:text-zinc-600 text-sm">—</span>
  const pct   = Math.min((roas / (ROAS_TARGET * 2.5)) * 100, 100)
  const color = roas >= ROAS_TARGET * 2 ? '#059669' : roas >= ROAS_TARGET ? '#2563eb' : roas >= 2 ? '#d97706' : '#dc2626'
  const cls   = roas >= ROAS_TARGET * 2 ? 'text-emerald-600 dark:text-emerald-400' : roas >= ROAS_TARGET ? 'text-blue-600 dark:text-blue-400' : roas >= 2 ? 'text-amber-600 dark:text-amber-400' : 'text-red-600 dark:text-red-400'
  return (
    <div className="flex items-center gap-2">
      <div className="h-1.5 bg-gray-100 dark:bg-zinc-700 rounded-full w-14 overflow-hidden">
        <div className="h-full rounded-full" style={{ width: `${pct}%`, background: color }} />
      </div>
      <span className={`text-xs font-bold ${cls}`}>{roas.toFixed(1)}x</span>
    </div>
  )
}

function CpaChip({ cpa, breakeven }: { cpa: number | null | undefined; breakeven: number }) {
  if (!cpa) return <span className="text-gray-300 dark:text-zinc-600 text-sm">—</span>
  const cls = cpa <= breakeven
    ? 'bg-emerald-100 dark:bg-emerald-900/40 text-emerald-800 dark:text-emerald-300'
    : cpa <= breakeven * 1.25
    ? 'bg-amber-100 dark:bg-amber-900/40 text-amber-800 dark:text-amber-300'
    : 'bg-red-100 dark:bg-red-900/40 text-red-800 dark:text-red-300'
  return <span className={`inline-block px-2 py-0.5 rounded-md text-xs font-bold ${cls}`}>${Math.round(cpa).toLocaleString('es-AR')}</span>
}

function CtrBadge({ ctr }: { ctr: number | null | undefined }) {
  if (!ctr) return <span className="text-gray-300 dark:text-zinc-600 text-sm">—</span>
  const cls = ctr >= 1.2 ? 'text-blue-700 dark:text-blue-400 font-bold' : ctr >= 0.6 ? 'text-amber-600 dark:text-amber-400 font-semibold' : 'text-red-600 dark:text-red-400 font-semibold'
  return <span className={`text-sm ${cls}`}>{ctr.toFixed(2)}%</span>
}

function FreqBadge({ freq }: { freq: number | null | undefined }) {
  if (freq == null) return <span className="text-gray-300 dark:text-zinc-600 text-sm">—</span>
  const cls = freq >= 4 ? 'text-red-600 dark:text-red-400 font-bold' : freq >= 2.5 ? 'text-amber-600 dark:text-amber-400 font-semibold' : 'text-gray-600 dark:text-zinc-300'
  return <span className={`text-sm ${cls}`}>{freq.toFixed(1)}</span>
}

function VideoMetric({ value, label, greenThreshold, amberThreshold }: { value: number | null | undefined; label: string; greenThreshold: number; amberThreshold: number }) {
  if (value == null) return <span className="text-gray-300 dark:text-zinc-600 text-xs">—</span>
  const cls = value >= greenThreshold ? 'text-emerald-600 dark:text-emerald-400 font-bold' : value >= amberThreshold ? 'text-amber-600 dark:text-amber-400 font-semibold' : 'text-gray-500 dark:text-zinc-400'
  return <span className={`text-xs ${cls}`}>{value.toFixed(1)}%</span>
}

function Chevron({ open }: { open: boolean }) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"
      strokeLinecap="round" strokeLinejoin="round"
      className={`w-3.5 h-3.5 transition-transform duration-200 ${open ? 'rotate-180' : ''}`}>
      <polyline points="6 9 12 15 18 9"/>
    </svg>
  )
}

// -- Botones de accion solo para creativos (pause/activate) --------
type ActionState = 'idle' | 'loading' | 'done' | 'error'

function AdActionButtons({ ad, onDone }: { ad: Ad; onDone: () => void }) {
  const [state, setState] = useState<ActionState>('idle')
  const [msg, setMsg]     = useState('')
  const [confirm, setConfirm] = useState<{ action: string; label: string } | null>(null)

  const doAction = useCallback(async (action: string, label: string) => {
    setState('loading')
    setMsg('')
    try {
      const res  = await fetch('/api/meta/update', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ entityId: ad.id, action }) })
      const data = await res.json() as { ok?: boolean; error?: string }
      if (!data.ok) throw new Error(data.error || 'Error')
      setState('done')
      setMsg(label)
      setTimeout(() => { setState('idle'); setMsg(''); onDone() }, 2000)
    } catch (e) {
      setState('error')
      setMsg(e instanceof Error ? e.message : 'Error')
      setTimeout(() => { setState('idle'); setMsg('') }, 3000)
    }
    setConfirm(null)
  }, [ad.id, onDone])

  if (state === 'loading') return <span className="text-xs text-gray-400 dark:text-zinc-500 animate-pulse">...</span>
  if (state === 'done')    return <span className="text-xs text-emerald-600 dark:text-emerald-400">{msg}</span>
  if (state === 'error')   return <span className="text-xs text-red-500 truncate max-w-[120px]" title={msg}>Error</span>

  if (confirm) {
    return (
      <div className="flex items-center gap-1">
        <span className="text-xs text-gray-500 dark:text-zinc-400">{confirm.label}?</span>
        <button onClick={() => doAction(confirm.action, confirm.label)}
          className="text-xs px-1.5 py-0.5 rounded bg-gray-900 dark:bg-zinc-100 text-white dark:text-zinc-900 font-medium">Si</button>
        <button onClick={() => setConfirm(null)}
          className="text-xs px-1.5 py-0.5 rounded border border-gray-200 dark:border-zinc-700 text-gray-500 dark:text-zinc-400">No</button>
      </div>
    )
  }

  const isPaused = ad.status === 'PAUSED'
  return (
    <div className="flex items-center gap-1">
      {isPaused ? (
        <button onClick={() => setConfirm({ action: 'activate', label: 'Activar' })}
          className="text-xs px-2 py-0.5 rounded-md border border-emerald-300 dark:border-emerald-700 text-emerald-600 dark:text-emerald-400 hover:bg-emerald-50 dark:hover:bg-emerald-900/20 font-medium transition-colors">
          Activar
        </button>
      ) : (
        <button onClick={() => setConfirm({ action: 'pause', label: 'Pausar' })}
          className="text-xs px-2 py-0.5 rounded-md border border-red-200 dark:border-red-800 text-red-600 dark:text-red-400 hover:bg-red-50 dark:hover:bg-red-900/20 font-medium transition-colors">
          Pausar
        </button>
      )}
    </div>
  )
}

// -- Botones de presupuesto para ad sets --------------------------
function AdsetBudgetButtons({ adset, onDone }: { adset: Adset; onDone: () => void }) {
  const [state, setState] = useState<ActionState>('idle')
  const [msg, setMsg]     = useState('')
  const [confirm, setConfirm] = useState<{ action: string; label: string; value: number } | null>(null)

  const doAction = useCallback(async (action: string, label: string, value: number) => {
    setState('loading')
    try {
      const res  = await fetch('/api/meta/update', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ entityId: adset.id, action, value }) })
      const data = await res.json() as { ok?: boolean; error?: string }
      if (!data.ok) throw new Error(data.error || 'Error')
      setState('done')
      setMsg(label)
      setTimeout(() => { setState('idle'); setMsg(''); onDone() }, 2000)
    } catch (e) {
      setState('error')
      setMsg('Error')
      setTimeout(() => { setState('idle'); setMsg('') }, 3000)
    }
    setConfirm(null)
  }, [adset.id, onDone])

  const budget = adset.daily_budget || 0
  if (!budget || adset.status === 'PAUSED') return null

  if (state === 'loading') return <span className="text-xs text-gray-400 dark:text-zinc-500 animate-pulse">...</span>
  if (state === 'done')    return <span className="text-xs text-emerald-600 dark:text-emerald-400">{msg}</span>
  if (state === 'error')   return <span className="text-xs text-red-500">Error</span>

  if (confirm) {
    return (
      <div className="flex items-center gap-1">
        <span className="text-xs text-gray-500 dark:text-zinc-400">{confirm.label}?</span>
        <button onClick={() => doAction(confirm.action, confirm.label, confirm.value)}
          className="text-xs px-1.5 py-0.5 rounded bg-gray-900 dark:bg-zinc-100 text-white dark:text-zinc-900 font-medium">Si</button>
        <button onClick={() => setConfirm(null)}
          className="text-xs px-1.5 py-0.5 rounded border border-gray-200 dark:border-zinc-700 text-gray-500 dark:text-zinc-400">No</button>
      </div>
    )
  }

  return (
    <div className="flex items-center gap-1">
      <button onClick={() => setConfirm({ action: 'set_budget', label: '+20%', value: Math.round(budget * 1.2 / 500) * 500 })}
        className="text-xs px-2 py-0.5 rounded-md border border-gray-200 dark:border-zinc-700 text-gray-600 dark:text-zinc-400 hover:bg-gray-50 dark:hover:bg-zinc-800 transition-colors font-medium">
        +20%
      </button>
      <button onClick={() => setConfirm({ action: 'set_budget', label: '-20%', value: Math.round(budget * 0.8 / 500) * 500 })}
        className="text-xs px-2 py-0.5 rounded-md border border-gray-200 dark:border-zinc-700 text-gray-600 dark:text-zinc-400 hover:bg-gray-50 dark:hover:bg-zinc-800 transition-colors font-medium">
        -20%
      </button>
    </div>
  )
}

// -- Sub-tabla de creativos de un ad set --------------------------
function AdsSubTable({ ads, type, breakeven, onAction }: { ads: Ad[]; type: 'conversion' | 'traffic'; breakeven: number; onAction: () => void }) {
  if (ads.length === 0) return (
    <tr><td colSpan={9} className="px-8 py-3 text-xs text-gray-400 dark:text-zinc-600 italic">Sin creativos con datos en este periodo.</td></tr>
  )
  const isConv = type === 'conversion'
  return (
    <>
      <tr className="bg-gray-50/80 dark:bg-zinc-800/60">
        <td colSpan={9} className="px-0 py-0">
          <table className="w-full text-xs">
            <thead>
              <tr className="border-t border-gray-100 dark:border-zinc-700">
                <th className="pl-10 pr-3 py-2 text-left text-gray-400 dark:text-zinc-500 font-semibold uppercase tracking-wide">Creativo</th>
                <th className="px-3 py-2 text-right text-gray-400 dark:text-zinc-500 font-semibold uppercase tracking-wide">Gasto</th>
                {isConv ? (
                  <>
                    <th className="px-3 py-2 text-right text-gray-400 dark:text-zinc-500 font-semibold uppercase tracking-wide">Compras</th>
                    <th className="px-3 py-2 text-right text-gray-400 dark:text-zinc-500 font-semibold uppercase tracking-wide">CPA</th>
                    <th className="px-3 py-2 text-left text-gray-400 dark:text-zinc-500 font-semibold uppercase tracking-wide">ROAS</th>
                  </>
                ) : (
                  <>
                    <th className="px-3 py-2 text-right text-gray-400 dark:text-zinc-500 font-semibold uppercase tracking-wide">Impr.</th>
                    <th className="px-3 py-2 text-right text-gray-400 dark:text-zinc-500 font-semibold uppercase tracking-wide">Clicks</th>
                  </>
                )}
                <th className="px-3 py-2 text-right text-gray-400 dark:text-zinc-500 font-semibold uppercase tracking-wide">CTR</th>
                <th className="px-3 py-2 text-right text-gray-400 dark:text-zinc-500 font-semibold uppercase tracking-wide">
                  <span className="inline-flex items-center gap-1">Frec.<InfoTooltip text="Frecuencia promedio: cuántas veces vio cada usuario este anuncio. Valores altos (>3x) pueden indicar saturación de audiencia y caída del CTR." /></span>
                </th>
                <th className="px-3 py-2 text-right text-gray-400 dark:text-zinc-500 font-semibold uppercase tracking-wide">
                  <span className="inline-flex items-center gap-1">Hook%<InfoTooltip text="Hook Rate: % de personas que iniciaron la reproducción del video. Mide si el primer segundo captura atención. Referencia: bueno &gt;20%." /></span>
                </th>
                <th className="px-3 py-2 text-right text-gray-400 dark:text-zinc-500 font-semibold uppercase tracking-wide">
                  <span className="inline-flex items-center gap-1">View%<InfoTooltip text="View Rate: % de personas que vieron al menos el 50% del video. Indica si el contenido retiene la atención tras el hook. Referencia: bueno &gt;25%." /></span>
                </th>
                <th className="px-3 py-2 text-left text-gray-400 dark:text-zinc-500 font-semibold uppercase tracking-wide">Accion</th>
              </tr>
            </thead>
            <tbody>
              {ads.map(ad => (
                <tr key={ad.id} className="border-t border-gray-100 dark:border-zinc-700/50 hover:bg-white/50 dark:hover:bg-zinc-800/30">
                  <td className="pl-10 pr-3 py-2">
                    <div className="flex items-center gap-1.5">
                      {ad.status === 'PAUSED' && <span className="w-1.5 h-1.5 rounded-full bg-amber-400 shrink-0" />}
                      {ad.status === 'ACTIVE' && <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 shrink-0" />}
                      <span className="text-gray-700 dark:text-zinc-200 leading-tight">{ad.name}</span>
                    </div>
                  </td>
                  <td className="px-3 py-2 text-right text-gray-600 dark:text-zinc-300 tabular-nums">
                    {ad.spend ? '$' + Math.round(ad.spend).toLocaleString('es-AR') : '—'}
                  </td>
                  {isConv ? (
                    <>
                      <td className="px-3 py-2 text-right font-medium text-gray-700 dark:text-zinc-200">{ad.results ?? '—'}</td>
                      <td className="px-3 py-2 text-right"><CpaChip cpa={ad.cost_per_result} breakeven={breakeven} /></td>
                      <td className="px-3 py-2"><RoasBar roas={ad.roas} /></td>
                    </>
                  ) : (
                    <>
                      <td className="px-3 py-2 text-right text-gray-600 dark:text-zinc-300 tabular-nums">{ad.impressions ? ad.impressions.toLocaleString('es-AR') : '—'}</td>
                      <td className="px-3 py-2 text-right text-gray-600 dark:text-zinc-300 tabular-nums">{ad.clicks ? ad.clicks.toLocaleString('es-AR') : '—'}</td>
                    </>
                  )}
                  <td className="px-3 py-2 text-right"><CtrBadge ctr={ad.ctr} /></td>
                  <td className="px-3 py-2 text-right"><FreqBadge freq={ad.frequency} /></td>
                  <td className="px-3 py-2 text-right"><VideoMetric value={ad.hook_rate} label="Hook" greenThreshold={20} amberThreshold={10} /></td>
                  <td className="px-3 py-2 text-right"><VideoMetric value={ad.view_rate} label="View" greenThreshold={25} amberThreshold={12} /></td>
                  <td className="px-3 py-2"><AdActionButtons ad={ad} onDone={onAction} /></td>
                </tr>
              ))}
            </tbody>
          </table>
        </td>
      </tr>
    </>
  )
}

// -- Seccion acordeon (Conversion / Trafico) ----------------------
interface SectionProps {
  title: string
  type: 'conversion' | 'traffic'
  adsets: Adset[]
  ads: Ad[]
  campaignMap: Record<string, string>
  breakeven: number
  period?: string
  onAction?: () => void
}

function AdsetSection({ title, type, adsets, ads, campaignMap, breakeven, period, onAction }: SectionProps) {
  const [open, setOpen]           = useState(true)
  const [expandedIds, setExpanded] = useState<Set<string>>(new Set())
  const handleAction = onAction ?? (() => {})

  const toggleExpand = (id: string) => {
    setExpanded(prev => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  const totalSpend  = adsets.reduce((s, a) => s + (a.spend  || 0), 0)
  const totalBudget = adsets.reduce((s, a) => s + (a.daily_budget || 0), 0)
  const isConv      = type === 'conversion'
  const gradient    = isConv ? 'from-blue-600 to-blue-700' : 'from-violet-600 to-violet-700'

  const spendLabel = period
    ? 'Gasto ' + (period === 'hoy' ? 'Hoy' : period === 'ayer' ? 'Ayer' : period === '30d' ? '30d' : '7d')
    : 'Gasto 7d'

  return (
    <div className="bg-white dark:bg-zinc-900 rounded-2xl border border-gray-200 dark:border-zinc-800 overflow-hidden shadow-sm">

      {/* Header */}
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
            <span>Budget/dia: <strong className="text-white">${Math.round(totalBudget).toLocaleString('es-AR')}</strong></span>
          </div>
          <span className="text-white/70"><Chevron open={open} /></span>
        </div>
      </button>

      {open && (
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-gray-100 dark:border-zinc-800 bg-gray-50/60 dark:bg-zinc-800/40">
                <th className="text-left px-5 py-2.5 text-xs font-semibold text-gray-400 dark:text-zinc-500 uppercase tracking-wide">Ad Set</th>
                <th className="text-right px-3 py-2.5 text-xs font-semibold text-gray-400 dark:text-zinc-500 uppercase tracking-wide">Budget/dia</th>
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
                    <th className="text-right px-3 py-2.5 text-xs font-semibold text-gray-400 dark:text-zinc-500 uppercase tracking-wide">CTR</th>
                  </>
                )}
                <th className="text-right px-3 py-2.5 text-xs font-semibold text-gray-400 dark:text-zinc-500 uppercase tracking-wide">
                  <span className="inline-flex items-center gap-1">Frec.<InfoTooltip text="Frecuencia promedio: cuántas veces vio cada persona este anuncio en el período. Valores altos (>3x) pueden causar fatiga y reducir el CTR." /></span>
                </th>
                <th className="text-left  px-3 py-2.5 text-xs font-semibold text-gray-400 dark:text-zinc-500 uppercase tracking-wide">Budget</th>
              </tr>
            </thead>
            <tbody>
              {adsets.map(adset => {
                const adsetAds = ads
                  .filter(a => a.adset_id === adset.id)
                  .sort((a, b) => (b.spend || 0) - (a.spend || 0))
                const isExpanded = expandedIds.has(adset.id)

                return (
                  <React.Fragment key={adset.id}>
                    <tr
                      onClick={() => toggleExpand(adset.id)}
                      className="border-t border-gray-50 dark:border-zinc-800 hover:bg-gray-50/40 dark:hover:bg-zinc-800/30 transition-colors cursor-pointer"
                    >
                      <td className="px-5 py-3">
                        <div className="flex items-center gap-2">
                          <span className="text-gray-400 dark:text-zinc-500"><Chevron open={isExpanded} /></span>
                          <div>
                            <p className="font-semibold text-gray-900 dark:text-white leading-tight">{adset.name}</p>
                            <p className="text-xs text-gray-400 dark:text-zinc-500 mt-0.5">{campaignMap[adset.campaign_id] || '—'}</p>
                          </div>
                        </div>
                      </td>
                      <td className="px-3 py-3 text-right text-gray-500 dark:text-zinc-400 tabular-nums">
                        {adset.daily_budget ? '$' + adset.daily_budget.toLocaleString('es-AR') : '—'}
                      </td>
                      <td className="px-3 py-3 text-right font-semibold text-gray-900 dark:text-white tabular-nums">
                        {adset.spend ? '$' + Math.round(adset.spend).toLocaleString('es-AR') : '—'}
                      </td>
                      {isConv ? (
                        <>
                          <td className="px-3 py-3 text-right">
                            <span className={`text-sm font-bold ${(adset.results || 0) > 0 ? 'text-gray-900 dark:text-white' : 'text-gray-300 dark:text-zinc-600'}`}>
                              {adset.results ?? '—'}
                            </span>
                          </td>
                          <td className="px-3 py-3 text-right"><CpaChip cpa={adset.cost_per_result} breakeven={breakeven} /></td>
                          <td className="px-3 py-3"><RoasBar roas={adset.roas} /></td>
                          <td className="px-3 py-3 text-right text-gray-500 dark:text-zinc-400 text-xs tabular-nums">
                            {adset.ctr ? adset.ctr.toFixed(2) + '%' : '—'}
                          </td>
                        </>
                      ) : (
                        <>
                          <td className="px-3 py-3 text-right text-gray-600 dark:text-zinc-300 tabular-nums">{adset.impressions ? adset.impressions.toLocaleString('es-AR') : '—'}</td>
                          <td className="px-3 py-3 text-right text-gray-600 dark:text-zinc-300 tabular-nums">{adset.clicks ? adset.clicks.toLocaleString('es-AR') : '—'}</td>
                          <td className="px-3 py-3 text-right"><CtrBadge ctr={adset.ctr} /></td>
                        </>
                      )}
                      <td className="px-3 py-3 text-right"><FreqBadge freq={adset.frequency} /></td>
                      <td className="px-3 py-3" onClick={e => e.stopPropagation()}>
                        <AdsetBudgetButtons adset={adset} onDone={handleAction} />
                      </td>
                    </tr>
                    {isExpanded && (
                      <AdsSubTable ads={adsetAds} type={type} breakeven={breakeven} onAction={handleAction} />
                    )}
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

// -- Export principal ---------------------------------------------
interface Props {
  adsets: Adset[]
  ads: Ad[]
  campaignMap: Record<string, string>
  breakeven: number
  period?: string
}

export default function AdsetTable({ adsets, ads, campaignMap, breakeven, period }: Props) {
  const convAdsets    = adsets.filter(a => !isTrafficAdset(a, campaignMap))
  const trafficAdsets = adsets.filter(a =>  isTrafficAdset(a, campaignMap))

  return (
    <div className="space-y-6">
      {convAdsets.length > 0 && (
        <AdsetSection title="Conversion" type="conversion" adsets={convAdsets} ads={ads} campaignMap={campaignMap} breakeven={breakeven} period={period} />
      )}
      {trafficAdsets.length > 0 && (
        <AdsetSection title="Trafico web" type="traffic" adsets={trafficAdsets} ads={ads} campaignMap={campaignMap} breakeven={breakeven} period={period} />
      )}
    </div>
  )
}
