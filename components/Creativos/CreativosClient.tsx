'use client'

import { useState } from 'react'
import type { Snapshot } from '@/lib/supabase'

const BREAKEVEN_CPA = 17500
const ROAS_MIN = 2.86
const ROAS_SCALE = 6

interface Props { snapshot: Snapshot | null }

type Action = 'scale' | 'maintain' | 'watch' | 'pause' | 'no_data' | 'traffic'

interface CreativeRow {
  id: string
  name: string
  adset_name: string
  campaign_name: string
  status: string
  spend: number
  roas: number | null
  cpa: number | null
  results: number
  impressions: number
  clicks: number
  ctr: number | null
  action: Action
  reason: string
}

const ACTION_CONFIG: Record<Action, { label: string; color: string; bg: string; darkBg: string; dot: string }> = {
  scale:    { label: 'Escalar',   color: 'text-emerald-700 dark:text-emerald-400', bg: 'bg-emerald-50',  darkBg: 'dark:bg-emerald-900/20', dot: 'bg-emerald-500' },
  maintain: { label: 'Mantener',  color: 'text-blue-700    dark:text-blue-400',    bg: 'bg-blue-50',     darkBg: 'dark:bg-blue-900/20',    dot: 'bg-blue-500'    },
  watch:    { label: 'Vigilar',   color: 'text-amber-700   dark:text-amber-400',   bg: 'bg-amber-50',    darkBg: 'dark:bg-amber-900/20',   dot: 'bg-amber-500'   },
  pause:    { label: 'Pausar',    color: 'text-red-700     dark:text-red-400',     bg: 'bg-red-50',      darkBg: 'dark:bg-red-900/20',     dot: 'bg-red-500'     },
  no_data:  { label: 'Sin datos', color: 'text-gray-500    dark:text-zinc-500',    bg: 'bg-gray-50',     darkBg: 'dark:bg-zinc-800/40',    dot: 'bg-gray-400'    },
  traffic:  { label: 'Trafico',   color: 'text-violet-700  dark:text-violet-400',  bg: 'bg-violet-50',   darkBg: 'dark:bg-violet-900/20',  dot: 'bg-violet-500'  },
}

function classify(ad: CreativeRow): { action: Action; reason: string } {
  const { spend, roas, cpa, results } = ad
  if (spend < 1000 || (!roas && !cpa)) return { action: 'no_data', reason: 'Gasto insuficiente para evaluar.' }
  if (roas && roas >= ROAS_SCALE) return { action: 'scale', reason: 'ROAS ' + roas.toFixed(2) + 'x excepcional. Duplicar budget o replicar en mas ad sets.' }
  if (cpa && cpa > BREAKEVEN_CPA * 1.5) return { action: 'pause', reason: 'CPA $' + Math.round(cpa / 1000) + 'K es 1.5x el breakeven. Pausar inmediatamente.' }
  if (cpa && cpa > BREAKEVEN_CPA) return { action: 'watch', reason: 'CPA $' + Math.round(cpa / 1000) + 'K sobre el breakeven ($' + BREAKEVEN_CPA / 1000 + 'K). Monitorear de cerca.' }
  if (roas && roas < ROAS_MIN && spend > 3000) return { action: 'pause', reason: 'ROAS ' + roas.toFixed(2) + 'x por debajo del minimo (' + ROAS_MIN + 'x). No es rentable.' }
  if (roas && roas >= ROAS_MIN && results > 0) return { action: 'maintain', reason: 'Performance estable. ROAS ' + roas.toFixed(2) + 'x dentro de rango.' }
  return { action: 'watch', reason: 'Datos insuficientes para recomendacion definitiva.' }
}

type SortKey = 'spend' | 'roas' | 'cpa' | 'results' | 'ctr'
type FilterAction = Action | 'all'

export default function CreativosClient({ snapshot }: Props) {
  const [filter, setFilter] = useState<FilterAction>('all')
  const [sort, setSort] = useState<SortKey>('spend')
  const [sortAsc, setSortAsc] = useState(false)

  if (!snapshot) {
    return (
      <div className="flex flex-col items-center justify-center h-[60vh] text-center">
        <div className="text-5xl mb-4">🎨</div>
        <h2 className="text-lg font-semibold text-gray-800 dark:text-zinc-200 mb-2">Sin datos todavia</h2>
        <p className="text-sm text-gray-500 dark:text-zinc-500 max-w-xs">Ejecuta un sync para ver el analisis de creativos.</p>
      </div>
    )
  }

  const campMap: Record<string, string> = {}
  snapshot.campaigns.forEach(c => { campMap[c.id] = c.name })
  const adsetMap: Record<string, string> = {}
  snapshot.adsets.forEach(s => { adsetMap[s.id] = s.name })
  const adsetCampMap: Record<string, string> = {}
  snapshot.adsets.forEach(s => { adsetCampMap[s.id] = s.campaign_id })
  const adsetGoalMap: Record<string, string> = {}
  snapshot.adsets.forEach(s => { adsetGoalMap[s.id] = s.optimization_goal })

  const rows: CreativeRow[] = snapshot.ads
    .filter(a => a.status === 'ACTIVE')
    .map(a => {
      const base: CreativeRow = {
        id: a.id, name: a.name,
        adset_name: adsetMap[a.adset_id] || a.adset_id,
        campaign_name: campMap[adsetCampMap[a.adset_id]] || '—',
        status: a.status,
        spend: a.spend || 0, roas: a.roas, cpa: a.cost_per_result,
        results: a.results || 0, impressions: a.impressions || 0,
        clicks: a.clicks || 0, ctr: a.ctr, action: 'no_data', reason: '',
      }
      const isTrafficAd = (() => {
        const goal = adsetGoalMap[a.adset_id] || ''
        if (['LINK_CLICKS', 'LANDING_PAGE_VIEWS', 'REACH', 'BRAND_AWARENESS', 'POST_ENGAGEMENT'].includes(goal)) return true
        const campName = (campMap[adsetCampMap[a.adset_id]] || '').toLowerCase()
        return campName.includes('trafico') || campName.includes('tráfico') || campName.includes('traffic')
      })()
      const { action, reason } = isTrafficAd
        ? { action: 'traffic' as Action, reason: 'Campaña de trafico web. Evaluar por CTR y CPC.' }
        : classify(base)
      return { ...base, action, reason }
    })

  const counts = { scale: 0, maintain: 0, watch: 0, pause: 0, no_data: 0, traffic: 0 }
  rows.forEach(r => { counts[r.action]++ })

  const filtered = rows.filter(r => filter === 'all' || r.action === filter)
  const sorted = [...filtered].sort((a, b) => {
    const av = (a[sort] ?? 0) as number, bv = (b[sort] ?? 0) as number
    return sortAsc ? av - bv : bv - av
  })

  function toggleSort(key: SortKey) {
    if (sort === key) setSortAsc(p => !p)
    else { setSort(key); setSortAsc(false) }
  }

  return (
    <div className="max-w-6xl mx-auto space-y-6">
      <div>
        <h1 className="text-xl font-semibold text-gray-900 dark:text-zinc-100">Analisis de creativos</h1>
        <p className="text-sm text-gray-500 dark:text-zinc-500 mt-0.5">{rows.length} anuncios activos · datos ultimos 7d · {snapshot.snapshot_date}</p>
      </div>

      {/* Filter chips */}
      <div className="flex flex-wrap gap-2">
        {(['all', 'scale', 'pause', 'watch', 'maintain', 'traffic', 'no_data'] as const).map(f => {
          const count = f === 'all' ? rows.length : counts[f]
          const cfg = f !== 'all' ? ACTION_CONFIG[f] : null
          return (
            <button key={f} onClick={() => setFilter(f)}
              className={'flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-medium border transition-all ' + (
                filter === f ? 'bg-gray-900 dark:bg-zinc-100 text-white dark:text-zinc-900 border-transparent' : 'border-gray-200 dark:border-zinc-700 text-gray-600 dark:text-zinc-400 hover:border-gray-400'
              )}>
              {cfg && <span className={'w-1.5 h-1.5 rounded-full ' + cfg.dot} />}
              {f === 'all' ? 'Todos' : ACTION_CONFIG[f as Action].label}
              <span className="opacity-60">{count}</span>
            </button>
          )
        })}
      </div>

      {/* Table */}
      <div className="bg-white dark:bg-zinc-900 rounded-xl border border-gray-200 dark:border-zinc-800 overflow-hidden shadow-sm">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="text-xs text-gray-400 dark:text-zinc-500 bg-gray-50 dark:bg-zinc-800/50 border-b border-gray-100 dark:border-zinc-800">
                <th className="text-left px-4 py-2.5 font-medium">#</th>
                <th className="text-left px-4 py-2.5 font-medium">Anuncio</th>
                <th className="text-left px-4 py-2.5 font-medium">Recomendacion</th>
                {(['spend','results','roas','cpa','ctr'] as SortKey[]).map(k => (
                  <th key={k} onClick={() => toggleSort(k)}
                    className="text-right px-4 py-2.5 font-medium cursor-pointer hover:text-gray-700 dark:hover:text-zinc-200 select-none capitalize">
                    {k === 'spend' ? 'Gasto' : k === 'results' ? 'Compras' : k.toUpperCase()}
                    {sort === k ? (sortAsc ? ' ↑' : ' ↓') : ''}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100 dark:divide-zinc-800">
              {sorted.length === 0 && (
                <tr><td colSpan={8} className="text-center py-10 text-gray-400 dark:text-zinc-600 text-sm">Sin anuncios para este filtro</td></tr>
              )}
              {sorted.map((r, i) => {
                const cfg = ACTION_CONFIG[r.action]
                return (
                  <tr key={r.id} className="hover:bg-gray-50 dark:hover:bg-zinc-800/30 transition-colors">
                    <td className="px-4 py-3 text-xs text-gray-400">{i + 1}</td>
                    <td className="px-4 py-3 max-w-[200px]">
                      <p className="font-medium text-gray-800 dark:text-zinc-200 truncate text-xs">{r.name}</p>
                      <p className="text-[11px] text-gray-400 dark:text-zinc-600 truncate mt-0.5">{r.adset_name}</p>
                    </td>
                    <td className="px-4 py-3">
                      <span className={'inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] font-semibold ' + cfg.bg + ' ' + cfg.darkBg + ' ' + cfg.color}>
                        <span className={'w-1.5 h-1.5 rounded-full ' + cfg.dot} />
                        {cfg.label}
                      </span>
                      <p className="text-[11px] text-gray-500 dark:text-zinc-500 mt-1 max-w-[200px] leading-snug">{r.reason}</p>
                    </td>
                    <td className="px-4 py-3 text-right text-xs text-gray-600 dark:text-zinc-400">${Math.round(r.spend / 1000)}K</td>
                    <td className="px-4 py-3 text-right text-xs text-gray-600 dark:text-zinc-400">{r.results || '—'}</td>
                    <td className="px-4 py-3 text-right text-xs">
                      {r.roas != null ? <span className={'font-medium ' + (r.roas >= ROAS_SCALE ? 'text-emerald-600 dark:text-emerald-400' : r.roas >= ROAS_MIN ? 'text-blue-600 dark:text-blue-400' : 'text-red-600 dark:text-red-400')}>{r.roas.toFixed(2)}x</span> : <span className="text-gray-400">—</span>}
                    </td>
                    <td className="px-4 py-3 text-right text-xs">
                      {r.cpa != null ? <span className={'font-medium ' + (r.cpa <= BREAKEVEN_CPA ? 'text-emerald-600 dark:text-emerald-400' : r.cpa <= BREAKEVEN_CPA * 1.3 ? 'text-amber-600 dark:text-amber-400' : 'text-red-600 dark:text-red-400')}>${Math.round(r.cpa / 1000)}K</span> : <span className="text-gray-400">—</span>}
                    </td>
                    <td className="px-4 py-3 text-right text-xs text-gray-600 dark:text-zinc-400">{r.ctr != null ? r.ctr.toFixed(2) + '%' : '—'}</td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      </div>

      <div className="flex flex-wrap gap-x-6 gap-y-1.5 text-xs text-gray-400 dark:text-zinc-600">
        <span><strong className="text-emerald-600 dark:text-emerald-400">Escalar</strong> — ROAS &gt;= {ROAS_SCALE}x</span>
        <span><strong className="text-blue-600 dark:text-blue-400">Mantener</strong> — ROAS {ROAS_MIN}–{ROAS_SCALE}x</span>
        <span><strong className="text-amber-600 dark:text-amber-400">Vigilar</strong> — CPA sobre breakeven</span>
        <span><strong className="text-red-600 dark:text-red-400">Pausar</strong> — CPA &gt; 1.5x breakeven o ROAS &lt; {ROAS_MIN}x</span>
        <span><strong className="text-violet-600 dark:text-violet-400">Trafico</strong> — Campanas de trafico web (sin compras)</span>
      </div>
    </div>
  )
}
