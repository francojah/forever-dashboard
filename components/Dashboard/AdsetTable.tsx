'use client'

import React, { useState, useCallback, useRef, useEffect } from 'react'
import type { Adset, Ad } from '@/lib/supabase'
import { InfoTooltip } from '@/components/ui/InfoTooltip'

const ROAS_TARGET = 3.0

function isTrafficAdset(a: Adset, campaignMap: Record<string, string>): boolean {
  const TRAFFIC_GOALS = ['LINK_CLICKS', 'LANDING_PAGE_VIEWS', 'REACH', 'BRAND_AWARENESS', 'POST_ENGAGEMENT']
  if (TRAFFIC_GOALS.includes(a.optimization_goal || '')) return true
  const campName = (campaignMap[a.campaign_id] || '').toLowerCase()
  return campName.includes('trafico') || campName.includes('tráfico') || campName.includes('traffic')
}

// ── Mini components ───────────────────────────────────────────────
function RoasBar({ roas }: { roas?: number | null }) {
  if (!roas) return <span className="text-gray-300 dark:text-zinc-700 text-xs">—</span>
  const pct  = Math.min((roas / (ROAS_TARGET * 2)) * 100, 100)
  const color = roas >= ROAS_TARGET * 1.5 ? 'bg-emerald-400' : roas >= ROAS_TARGET ? 'bg-blue-400' : roas >= 1.5 ? 'bg-amber-400' : 'bg-red-400'
  return (
    <div className="flex items-center gap-2 min-w-[80px]">
      <div className="flex-1 h-1.5 bg-gray-100 dark:bg-zinc-800 rounded-full overflow-hidden">
        <div className={`h-full rounded-full ${color}`} style={{ width: pct + '%' }} />
      </div>
      <span className={`text-xs font-bold tabular-nums ${roas >= ROAS_TARGET ? 'text-emerald-600 dark:text-emerald-400' : roas >= 1.5 ? 'text-amber-600 dark:text-amber-400' : 'text-red-500'}`}>
        {roas.toFixed(2)}x
      </span>
    </div>
  )
}

function CpaChip({ cpa, breakeven }: { cpa?: number | null; breakeven: number }) {
  if (!cpa) return <span className="text-gray-300 dark:text-zinc-700 text-xs">—</span>
  const color = cpa <= breakeven ? 'text-emerald-600 dark:text-emerald-400 bg-emerald-50 dark:bg-emerald-950/30'
    : cpa <= breakeven * 1.3 ? 'text-amber-600 dark:text-amber-400 bg-amber-50 dark:bg-amber-950/30'
    : 'text-red-600 dark:text-red-400 bg-red-50 dark:bg-red-950/30'
  return (
    <span className={`text-xs font-semibold px-1.5 py-0.5 rounded-md tabular-nums ${color}`}>
      ${Math.round(cpa).toLocaleString('es-AR')}
    </span>
  )
}

function CtrBadge({ ctr }: { ctr?: number | null }) {
  if (!ctr) return <span className="text-gray-300 dark:text-zinc-700 text-xs">—</span>
  const color = ctr >= 1.2 ? 'text-emerald-600 dark:text-emerald-400' : ctr >= 0.6 ? 'text-amber-600 dark:text-amber-400' : 'text-red-500'
  return <span className={`text-xs font-medium tabular-nums ${color}`}>{ctr.toFixed(2)}%</span>
}

function FreqBadge({ freq }: { freq?: number | null }) {
  if (!freq) return <span className="text-gray-300 dark:text-zinc-700 text-xs">—</span>
  const color = freq >= 4 ? 'text-red-500' : freq >= 2.5 ? 'text-amber-500 dark:text-amber-400' : 'text-gray-500 dark:text-zinc-400'
  return <span className={`text-xs font-medium tabular-nums ${color}`}>{freq.toFixed(1)}x</span>
}

function VideoMetric({ value, label, greenThreshold, amberThreshold }: { value?: number | null; label: string; greenThreshold: number; amberThreshold: number }) {
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

// ── Ad pause/activate button ──────────────────────────────────────
function AdActionButtons({ ad, onDone }: { ad: Ad; onDone: () => void }) {
  const [state, setState]     = useState<'idle'|'loading'|'done'|'error'>('idle')
  const [confirm, setConfirm] = useState<{ action: string; label: string } | null>(null)
  const [msg, setMsg]         = useState('')

  const doAction = useCallback(async (action: string, label: string) => {
    setState('loading')
    try {
      const res = await fetch('/api/meta/update', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ entity: 'ad', id: ad.id, action }),
      })
      const data = await res.json()
      if (!res.ok || data.error) throw new Error(data.error || 'Error')
      setMsg(label + ' ✓'); setState('done')
      setTimeout(() => { setState('idle'); onDone() }, 2000)
    } catch { setState('error'); setTimeout(() => setState('idle'), 2500) }
    setConfirm(null)
  }, [ad.id, onDone])

  if (state === 'loading') return <span className="text-xs text-gray-400 dark:text-zinc-500 animate-pulse">...</span>
  if (state === 'done')    return <span className="text-xs text-emerald-600 dark:text-emerald-400">{msg}</span>
  if (state === 'error')   return <span className="text-xs text-red-500">Error</span>

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

  if (ad.status === 'ACTIVE') {
    return (
      <button onClick={() => setConfirm({ action: 'pause', label: 'Pausar' })}
        className="text-xs px-2 py-0.5 rounded-md border border-gray-200 dark:border-zinc-700 text-gray-500 dark:text-zinc-400 hover:bg-gray-50 dark:hover:bg-zinc-800 hover:text-red-500 transition-colors">
        Pausar
      </button>
    )
  }
  return (
    <button onClick={() => setConfirm({ action: 'activate', label: 'Activar' })}
      className="text-xs px-2 py-0.5 rounded-md border border-emerald-200 dark:border-emerald-800 text-emerald-600 dark:text-emerald-400 hover:bg-emerald-50 dark:hover:bg-emerald-950/30 transition-colors">
      Activar
    </button>
  )
}

// ── Inline budget editor (click to edit) ─────────────────────────
function InlineBudgetEdit({ adset, onDone }: { adset: Adset; onDone: () => void }) {
  const [editing, setEditing] = useState(false)
  const [value, setValue]     = useState(String(adset.daily_budget || ''))
  const [state, setState]     = useState<'idle'|'loading'|'done'|'error'>('idle')
  const inputRef = useRef<HTMLInputElement>(null)

  useEffect(() => { if (editing) inputRef.current?.focus() }, [editing])

  const submit = useCallback(async () => {
    const newBudget = Math.round(parseInt(value) / 500) * 500
    if (!newBudget || newBudget === adset.daily_budget) { setEditing(false); return }
    setState('loading')
    try {
      const res = await fetch('/api/meta/update', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ entity: 'adset', id: adset.id, action: 'set_budget', value: newBudget }),
      })
      const data = await res.json()
      if (!res.ok || data.error) throw new Error(data.error || 'Error')
      setState('done'); setEditing(false)
      setTimeout(() => { setState('idle'); onDone() }, 1500)
    } catch { setState('error'); setTimeout(() => setState('idle'), 2000); setEditing(false) }
  }, [value, adset.daily_budget, adset.id, onDone])

  const budget = adset.daily_budget || 0

  if (state === 'loading') return <span className="text-xs text-zinc-400 animate-pulse">...</span>
  if (state === 'done')    return <span className="text-xs text-emerald-500">✓</span>
  if (state === 'error')   return <span className="text-xs text-red-500">Error</span>

  if (editing) {
    return (
      <div className="flex items-center gap-1">
        <span className="text-xs text-gray-400">$</span>
        <input
          ref={inputRef}
          type="number"
          value={value}
          onChange={e => setValue(e.target.value)}
          onKeyDown={e => { if (e.key === 'Enter') submit(); if (e.key === 'Escape') setEditing(false) }}
          onBlur={submit}
          className="w-20 text-xs bg-gray-50 dark:bg-zinc-800 border border-indigo-400 rounded px-1.5 py-0.5 text-gray-900 dark:text-zinc-100 outline-none"
          step={500}
        />
      </div>
    )
  }

  if (!budget || adset.status === 'PAUSED') {
    return <span className="text-xs text-gray-300 dark:text-zinc-700">—</span>
  }

  return (
    <button
      onClick={() => { setValue(String(budget)); setEditing(true) }}
      title="Click para editar budget"
      className="text-xs text-gray-500 dark:text-zinc-400 hover:text-indigo-500 dark:hover:text-indigo-400 transition-colors flex items-center gap-1 group"
    >
      <span className="tabular-nums">${budget.toLocaleString('es-AR')}</span>
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="w-3 h-3 opacity-0 group-hover:opacity-100 transition-opacity">
        <path strokeLinecap="round" strokeLinejoin="round" d="M16.862 4.487l1.687-1.688a1.875 1.875 0 112.652 2.652L10.582 16.07a4.5 4.5 0 01-1.897 1.13L6 18l.8-2.685a4.5 4.5 0 011.13-1.897l8.932-8.931z"/>
      </svg>
    </button>
  )
}

// ── +/- budget adjustment buttons ────────────────────────────────
function AdsetBudgetButtons({ adset, onDone }: { adset: Adset; onDone: () => void }) {
  const [state, setState]     = useState<'idle'|'loading'|'done'|'error'>('idle')
  const [confirm, setConfirm] = useState<{ action: string; label: string; value: number } | null>(null)
  const [msg, setMsg]         = useState('')

  const doAction = useCallback(async (action: string, label: string, value: number) => {
    setState('loading')
    try {
      const res = await fetch('/api/meta/update', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ entity: 'adset', id: adset.id, action, value }),
      })
      const data = await res.json()
      if (!res.ok || data.error) throw new Error(data.error || 'Error')
      setMsg(label + ' ✓'); setState('done')
      setTimeout(() => { setState('idle'); onDone() }, 2000)
    } catch { setState('error'); setTimeout(() => setState('idle'), 2500) }
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

// ── Sub-tabla de creativos ────────────────────────────────────────
function AdsSubTable({ ads, type, breakeven, onAction, colCount }: {
  ads: Ad[]; type: 'conversion' | 'traffic'; breakeven: number; onAction: () => void; colCount: number
}) {
  if (ads.length === 0) return (
    <tr><td colSpan={colCount} className="px-8 py-3 text-xs text-gray-400 dark:text-zinc-600 italic">Sin creativos con datos en este periodo.</td></tr>
  )
  const isConv = type === 'conversion'
  return (
    <>
      <tr className="bg-gray-50/80 dark:bg-zinc-800/60">
        <td colSpan={colCount} className="px-0 py-0">
          <table className="w-full text-xs">
            <thead>
              <tr className="border-t border-gray-100 dark:border-zinc-700">
                <th className="pl-12 pr-3 py-2 text-left text-gray-400 dark:text-zinc-500 font-semibold uppercase tracking-wide">Creativo</th>
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
                    <th className="px-3 py-2 text-right text-gray-400 dark:text-zinc-500 font-semibold uppercase tracking-wide">CPC</th>
                  </>
                )}
                <th className="px-3 py-2 text-right text-gray-400 dark:text-zinc-500 font-semibold uppercase tracking-wide">CTR</th>
                <th className="px-3 py-2 text-right text-gray-400 dark:text-zinc-500 font-semibold uppercase tracking-wide">
                  <span className="inline-flex items-center gap-1">Frec.<InfoTooltip text="Frecuencia promedio. >3x puede indicar saturación." /></span>
                </th>
                <th className="px-3 py-2 text-right text-gray-400 dark:text-zinc-500 font-semibold uppercase tracking-wide">
                  <span className="inline-flex items-center gap-1">Hook%<InfoTooltip text="Hook Rate: % que inició reproducción. Bueno >20%." /></span>
                </th>
                <th className="px-3 py-2 text-right text-gray-400 dark:text-zinc-500 font-semibold uppercase tracking-wide">
                  <span className="inline-flex items-center gap-1">View%<InfoTooltip text="View Rate: % que vio ≥50% del video. Bueno >25%." /></span>
                </th>
                <th className="px-3 py-2 text-left text-gray-400 dark:text-zinc-500 font-semibold uppercase tracking-wide">Accion</th>
              </tr>
            </thead>
            <tbody>
              {ads.map(ad => {
                const adPaused = ad.status === 'PAUSED'
                const adRoas   = ad.roas
                const adCpa    = ad.cost_per_result
                const adSpend  = ad.spend || 0
                const adTint   =
                  adPaused                                         ? 'opacity-55'
                  : (adRoas && adRoas >= 5)                        ? 'bg-emerald-50/40 dark:bg-emerald-950/15'
                  : (adCpa && adCpa > breakeven && adSpend > 2000) ? 'bg-red-50/40 dark:bg-red-950/10'
                  : ''
                return (
                  <tr key={ad.id} className={`border-t border-gray-100 dark:border-zinc-700/50 hover:bg-white/50 dark:hover:bg-zinc-800/30 ${adTint}`}>
                    <td className="pl-12 pr-3 py-2">
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
                        <td className="px-3 py-2 text-right text-gray-600 dark:text-zinc-300 tabular-nums text-xs">
                          {ad.spend && ad.clicks ? '$' + Math.round(ad.spend / ad.clicks).toLocaleString('es-AR') : '—'}
                        </td>
                      </>
                    )}
                    <td className="px-3 py-2 text-right"><CtrBadge ctr={ad.ctr} /></td>
                    <td className="px-3 py-2 text-right"><FreqBadge freq={ad.frequency} /></td>
                    <td className="px-3 py-2 text-right"><VideoMetric value={ad.hook_rate} label="Hook" greenThreshold={20} amberThreshold={10} /></td>
                    <td className="px-3 py-2 text-right"><VideoMetric value={ad.view_rate} label="View" greenThreshold={25} amberThreshold={12} /></td>
                    <td className="px-3 py-2"><AdActionButtons ad={ad} onDone={onAction} /></td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </td>
      </tr>
    </>
  )
}

// ── Bulk action bar ───────────────────────────────────────────────
// IMPORTANT: all hooks must come BEFORE any conditional returns
function BulkBar({ selected, onDone, onClear }: {
  selected: Set<string>
  onDone: () => void
  onClear: () => void
}) {
  // All hooks declared first — no conditional returns before this point
  const [state, setState]       = useState<'idle'|'loading'|'done'|'error'>('idle')
  const [confirm, setConfirm]   = useState<string | null>(null)

  const doBulk = useCallback(async (action: string) => {
    setState('loading')
    try {
      const ids = Array.from(selected)
      await Promise.all(ids.map(id =>
        fetch('/api/meta/update', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ entity: 'adset', id, action }),
        })
      ))
      setState('done')
      setTimeout(() => { setState('idle'); onClear(); onDone() }, 2000)
    } catch {
      setState('error')
      setTimeout(() => setState('idle'), 2500)
    }
    setConfirm(null)
  }, [selected, onClear, onDone])

  // Conditional logic comes AFTER all hooks
  const count = selected.size
  if (count === 0) return null

  if (state === 'loading') return (
    <div className="flex items-center gap-3 px-5 py-3 bg-indigo-600 text-white text-sm rounded-xl shadow-lg mb-2">
      <span className="animate-pulse">Ejecutando en {count} ad set{count !== 1 ? 's' : ''}...</span>
    </div>
  )
  if (state === 'done') return (
    <div className="flex items-center gap-3 px-5 py-3 bg-emerald-600 text-white text-sm rounded-xl shadow-lg mb-2">
      <span>✓ Acción completada en {count} ad set{count !== 1 ? 's' : ''}</span>
    </div>
  )

  if (confirm) {
    const labels: Record<string, string> = { pause: 'Pausar', activate: 'Activar' }
    return (
      <div className="flex items-center gap-3 px-5 py-3 bg-zinc-900 text-white text-sm rounded-xl shadow-lg mb-2">
        <span className="text-zinc-300">¿{labels[confirm]} {count} ad set{count !== 1 ? 's' : ''}?</span>
        <button onClick={() => doBulk(confirm)} className="px-3 py-1 bg-white text-zinc-900 rounded-lg font-semibold text-xs hover:bg-zinc-100">Sí</button>
        <button onClick={() => setConfirm(null)} className="px-3 py-1 border border-zinc-600 text-zinc-300 rounded-lg text-xs hover:bg-zinc-800">No</button>
        <button onClick={onClear} className="ml-auto text-zinc-500 hover:text-zinc-300 text-xs">Cancelar</button>
      </div>
    )
  }

  return (
    <div className="flex items-center gap-3 px-5 py-3 bg-zinc-900 border border-zinc-700 rounded-xl shadow-lg mb-2">
      <span className="text-xs font-semibold text-indigo-400">{count} seleccionado{count !== 1 ? 's' : ''}</span>
      <div className="flex items-center gap-2 ml-2">
        <button onClick={() => setConfirm('pause')}
          className="text-xs px-3 py-1.5 bg-amber-600 hover:bg-amber-500 text-white rounded-lg font-medium transition-colors">
          ⏸ Pausar todos
        </button>
        <button onClick={() => setConfirm('activate')}
          className="text-xs px-3 py-1.5 bg-emerald-600 hover:bg-emerald-500 text-white rounded-lg font-medium transition-colors">
          ▶ Activar todos
        </button>
      </div>
      <button onClick={onClear} className="ml-auto text-xs text-zinc-500 hover:text-zinc-300 transition-colors">
        ✕ Deseleccionar
      </button>
    </div>
  )
}

// ── Adset section with checkboxes ─────────────────────────────────
interface SectionProps {
  title: string
  type: 'conversion' | 'traffic'
  adsets: Adset[]
  ads: Ad[]
  campaignMap: Record<string, string>
  breakeven: number
  period?: string
  selectedIds: Set<string>
  onToggleSelect: (id: string) => void
  onSelectAll: (ids: string[]) => void
  onAction?: () => void
}

function AdsetSection({ title, type, adsets, ads, campaignMap, breakeven, period, selectedIds, onToggleSelect, onSelectAll, onAction }: SectionProps) {
  const [open, setOpen]                     = useState(true)
  const [expandedIds, setExpanded]          = useState<Set<string>>(new Set())
  const [collapsedCamps, setCollapsedCamps] = useState<Set<string>>(new Set())
  const handleAction = onAction ?? (() => {})

  const toggleCamp = (id: string) => {
    setCollapsedCamps(prev => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id); else next.add(id)
      return next
    })
  }

  const toggleExpand = (id: string) => {
    setExpanded(prev => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id); else next.add(id)
      return next
    })
  }

  const sectionIds   = adsets.map(a => a.id)
  const allSelected  = sectionIds.length > 0 && sectionIds.every(id => selectedIds.has(id))
  const someSelected = sectionIds.some(id => selectedIds.has(id))

  const totalSpend  = adsets.reduce((s, a) => s + (a.spend  || 0), 0)
  const totalBudget = adsets.reduce((s, a) => s + (a.daily_budget || 0), 0)
  const isConv      = type === 'conversion'
  const gradient    = isConv ? 'from-blue-600 to-blue-700' : 'from-violet-600 to-violet-700'

  const spendLabel = period
    ? 'Gasto ' + (period === 'hoy' ? 'Hoy' : period === 'ayer' ? 'Ayer' : period === '30d' ? '30d' : '7d')
    : 'Gasto 7d'

  // Total columns: checkbox(1) + name(1) + budget-inline(1) + gasto(1) + 4 metrics(4) + freq(1) + ajuste(1) = 11
  const TOTAL_COLS = 11

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
          {someSelected && (
            <span className="text-xs text-white/80 bg-white/15 px-2 py-0.5 rounded-full">
              {sectionIds.filter(id => selectedIds.has(id)).length} sel.
            </span>
          )}
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
                <th className="px-3 py-2.5 w-8">
                  <input
                    type="checkbox"
                    checked={allSelected}
                    onChange={() => {
                      if (allSelected) {
                        sectionIds.forEach(id => { if (selectedIds.has(id)) onToggleSelect(id) })
                      } else {
                        onSelectAll(sectionIds.filter(id => !selectedIds.has(id)))
                      }
                    }}
                    className="rounded border-gray-300 dark:border-zinc-600 text-indigo-600 focus:ring-indigo-500 cursor-pointer"
                  />
                </th>
                <th className="text-left px-3 py-2.5 text-xs font-semibold text-gray-400 dark:text-zinc-500 uppercase tracking-wide">Ad Set</th>
                <th className="text-left px-3 py-2.5 text-xs font-semibold text-gray-400 dark:text-zinc-500 uppercase tracking-wide">Budget/dia</th>
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
                  <span className="inline-flex items-center gap-1">Frec.<InfoTooltip text="Frecuencia promedio. >3x puede causar fatiga." /></span>
                </th>
                <th className="text-left px-3 py-2.5 text-xs font-semibold text-gray-400 dark:text-zinc-500 uppercase tracking-wide">Ajuste</th>
              </tr>
            </thead>
            <tbody>
              {Array.from(new Set(adsets.map(a => a.campaign_id))).map(campId => {
                const campAdsets  = adsets.filter(a => a.campaign_id === campId)
                const campName    = campaignMap[campId] || 'Campaña sin nombre'
                const campSpend   = campAdsets.reduce((s, a) => s + (a.spend || 0), 0)
                const campBudget  = campAdsets.reduce((s, a) => s + (a.daily_budget || 0), 0)
                const campOpen    = !collapsedCamps.has(campId)
                const campAllSel  = campAdsets.every(a => selectedIds.has(a.id))

                return (
                  <React.Fragment key={campId}>
                    {/* Campaign header row */}
                    <tr className="border-t-2 border-gray-200 dark:border-zinc-700 bg-gray-50/80 dark:bg-zinc-800/60 cursor-pointer hover:bg-gray-100/60 dark:hover:bg-zinc-800 transition-colors"
                        onClick={() => toggleCamp(campId)}>
                      <td className="px-3 py-2.5" onClick={e => e.stopPropagation()}>
                        <input
                          type="checkbox"
                          checked={campAllSel}
                          onChange={() => {
                            if (campAllSel) {
                              campAdsets.forEach(a => { if (selectedIds.has(a.id)) onToggleSelect(a.id) })
                            } else {
                              onSelectAll(campAdsets.filter(a => !selectedIds.has(a.id)).map(a => a.id))
                            }
                          }}
                          className="rounded border-gray-300 dark:border-zinc-600 text-indigo-600 focus:ring-indigo-500 cursor-pointer"
                        />
                      </td>
                      <td colSpan={TOTAL_COLS - 1} className="px-3 py-2.5">
                        <div className="flex items-center gap-2">
                          <span className="text-gray-500 dark:text-zinc-400"><Chevron open={campOpen} /></span>
                          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" className="w-3.5 h-3.5 text-gray-400 dark:text-zinc-500">
                            <path d="M22 12h-4l-3 9L9 3l-3 9H2"/>
                          </svg>
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
                      const isSelected = selectedIds.has(adset.id)

                      const isPaused = adset.status === 'PAUSED'
                      const cpa      = adset.cost_per_result
                      const roas     = adset.roas
                      const spend    = adset.spend || 0
                      const rowTint  =
                        isSelected                                           ? 'bg-indigo-50/60 dark:bg-indigo-950/20'
                        : isPaused                                           ? 'opacity-60'
                        : (roas && roas >= 5)                               ? 'bg-emerald-50/60 dark:bg-emerald-950/20'
                        : (cpa && cpa > breakeven && spend > 3000)          ? 'bg-red-50/50 dark:bg-red-950/15'
                        : (cpa && cpa > breakeven * 1.3 && spend > 1500)   ? 'bg-amber-50/40 dark:bg-amber-950/10'
                        : ''

                      return (
                        <React.Fragment key={adset.id}>
                          <tr className={`border-t border-gray-50 dark:border-zinc-800 hover:bg-gray-50/40 dark:hover:bg-zinc-800/30 transition-colors ${rowTint}`}>
                            {/* Checkbox */}
                            <td className="px-3 py-3" onClick={e => e.stopPropagation()}>
                              <input
                                type="checkbox"
                                checked={isSelected}
                                onChange={() => onToggleSelect(adset.id)}
                                className="rounded border-gray-300 dark:border-zinc-600 text-indigo-600 focus:ring-indigo-500 cursor-pointer"
                              />
                            </td>
                            {/* Name — click to expand */}
                            <td className="px-3 py-3 pl-6 cursor-pointer" onClick={() => toggleExpand(adset.id)}>
                              <div className="flex items-center gap-2">
                                <span className="text-gray-400 dark:text-zinc-500"><Chevron open={isExpanded} /></span>
                                <span className={`w-1.5 h-1.5 rounded-full shrink-0 ${
                                  isPaused ? 'bg-zinc-400' :
                                  (roas && roas >= 5) ? 'bg-emerald-400' :
                                  (cpa && cpa > breakeven) ? 'bg-red-400' :
                                  'bg-blue-400'
                                }`} />
                                <p className="font-semibold text-gray-900 dark:text-white leading-tight text-sm">{adset.name}</p>
                              </div>
                            </td>
                            {/* Inline budget edit */}
                            <td className="px-3 py-3" onClick={e => e.stopPropagation()}>
                              <InlineBudgetEdit adset={adset} onDone={handleAction} />
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
                                <td className="px-3 py-3 text-right text-gray-600 dark:text-zinc-300 tabular-nums text-xs">
                                  {adset.spend && adset.clicks > 0 ? '$' + Math.round(adset.spend / adset.clicks).toLocaleString('es-AR') : '—'}
                                </td>
                                <td className="px-3 py-3 text-right"><CtrBadge ctr={adset.ctr} /></td>
                              </>
                            )}
                            <td className="px-3 py-3 text-right"><FreqBadge freq={adset.frequency} /></td>
                            <td className="px-3 py-3" onClick={e => e.stopPropagation()}>
                              <AdsetBudgetButtons adset={adset} onDone={handleAction} />
                            </td>
                          </tr>
                          {isExpanded && (
                            <AdsSubTable ads={adsetAds} type={type} breakeven={breakeven} onAction={handleAction} colCount={TOTAL_COLS} />
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
  adsets: Adset[]
  ads: Ad[]
  campaignMap: Record<string, string>
  breakeven: number
  period?: string
  onAction?: () => void
}

export default function AdsetTable({ adsets, ads, campaignMap, breakeven, period, onAction }: Props) {
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set())

  const convAdsets    = adsets.filter(a => !isTrafficAdset(a, campaignMap))
  const trafficAdsets = adsets.filter(a =>  isTrafficAdset(a, campaignMap))

  const toggleSelect = useCallback((id: string) => {
    setSelectedIds(prev => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id); else next.add(id)
      return next
    })
  }, [])

  const selectAll = useCallback((ids: string[]) => {
    setSelectedIds(prev => {
      const next = new Set(prev)
      ids.forEach(id => next.add(id))
      return next
    })
  }, [])

  const clearSelection = useCallback(() => setSelectedIds(new Set()), [])

  const handleDone = useCallback(() => {
    clearSelection()
    onAction?.()
  }, [clearSelection, onAction])

  return (
    <div className="space-y-6">
      <BulkBar selected={selectedIds} onDone={handleDone} onClear={clearSelection} />

      {convAdsets.length > 0 && (
        <AdsetSection
          title="Conversion" type="conversion"
          adsets={convAdsets} ads={ads} campaignMap={campaignMap}
          breakeven={breakeven} period={period}
          selectedIds={selectedIds} onToggleSelect={toggleSelect} onSelectAll={selectAll}
          onAction={onAction}
        />
      )}
      {trafficAdsets.length > 0 && (
        <AdsetSection
          title="Trafico web" type="traffic"
          adsets={trafficAdsets} ads={ads} campaignMap={campaignMap}
          breakeven={breakeven} period={period}
          selectedIds={selectedIds} onToggleSelect={toggleSelect} onSelectAll={selectAll}
          onAction={onAction}
        />
      )}
    </div>
  )
}
