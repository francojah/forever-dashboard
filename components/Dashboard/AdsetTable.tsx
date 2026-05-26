'use client'

import React, { useState } from 'react'
import type { Adset } from '@/lib/supabase'

const ROAS_TARGET = 3.0

// ── Clasificación ──────────────────────────────────────────────
function isTrafficAdset(adset: Adset, campaignMap: Record<string, string>): boolean {
  const goal = adset.optimization_goal || ''
  if (['LINK_CLICKS', 'LANDING_PAGE_VIEWS', 'REACH', 'BRAND_AWARENESS', 'POST_ENGAGEMENT'].includes(goal)) return true
  const campName = (campaignMap[adset.campaign_id] || '').toLowerCase()
  return campName.includes('trafico') || campName.includes('tráfico') || campName.includes('traffic')
}

// ── Motor de insights ──────────────────────────────────────────
type Verdict = 'success' | 'good' | 'warning' | 'danger' | 'info'
interface Insight { verdict: Verdict; text: string; action: string }

function generateInsight(adset: Adset, type: 'conversion' | 'traffic', breakeven: number): Insight {
  if (type === 'conversion') {
    const spend   = adset.spend   || 0
    const results = adset.results || 0

    if (results === 0) {
      if (spend > breakeven * 3) return {
        verdict: 'danger',
        text:   `Sin compras con $${Math.round(spend).toLocaleString('es-AR')} gastado en 7 días.`,
        action: 'Revisar audiencia, landing y oferta. Si no convierte hoy, pausar.'
      }
      return {
        verdict: 'info',
        text:   'Sin compras registradas en el período.',
        action: 'Normal en ad sets nuevos o con alcance bajo. Monitorear los próximos días.'
      }
    }

    const roas = adset.roas
    const cpa  = adset.cost_per_result

    if (roas !== null && roas !== undefined) {
      if (roas >= 6) return { verdict: 'success', text: `ROAS ${roas.toFixed(1)}x — top performer, muy por encima del objetivo (${ROAS_TARGET}x).`, action: 'Escalar +20–30% si lleva más de 5 días estable. Duplicar en nueva audiencia.' }
      if (roas >= ROAS_TARGET) return { verdict: 'good',    text: `ROAS ${roas.toFixed(1)}x — rentable y por encima del objetivo mínimo (${ROAS_TARGET}x).`, action: 'Mantener presupuesto. Testear creativos frescos para seguir escalando.' }
      if (roas >= 2) return           { verdict: 'warning', text: `ROAS ${roas.toFixed(1)}x — cerca del punto de equilibrio. Margen ajustado.`,              action: 'No escalar. Testear nuevos creativos, revisar copy y frecuencia de anuncio.' }
      return                          { verdict: 'danger',  text: `ROAS ${roas.toFixed(1)}x — por debajo del mínimo rentable (${ROAS_TARGET}x).`,              action: 'Acción urgente: revisar creativos y segmentación. Sin mejora en 24h, pausar.' }
    }

    if (cpa !== null && cpa !== undefined) {
      const pct = Math.round((cpa / breakeven - 1) * 100)
      if (cpa <= breakeven)        return { verdict: 'success', text: `CPA $${Math.round(cpa).toLocaleString('es-AR')} — dentro del breakeven ($${breakeven.toLocaleString('es-AR')}).`, action: 'Mantener. Optimizar creativos para seguir bajando el CPA.' }
      if (cpa <= breakeven * 1.25) return { verdict: 'warning', text: `CPA $${Math.round(cpa).toLocaleString('es-AR')} — ${pct}% sobre el breakeven.`,          action: 'No escalar. Optimizar creativos y copy. Revisar calidad de la audiencia.' }
      return                              { verdict: 'danger',  text: `CPA $${Math.round(cpa).toLocaleString('es-AR')} — ${pct}% sobre el breakeven. No rentable.`, action: 'Revisar audiencia, landing y oferta urgente. Pausar si no mejora en 24h.' }
    }

    return { verdict: 'info', text: 'Datos insuficientes para generar una recomendación.', action: 'Esperar al menos 3 días de acumulación de datos.' }
  }

  // Tráfico
  const ctr = adset.ctr || 0
  if (!adset.impressions || adset.impressions < 500) return { verdict: 'info',    text: 'Volumen bajo. Pocas impresiones para evaluar el rendimiento.', action: 'Esperar más entrega antes de tomar decisiones de optimización.' }
  if (ctr >= 2.5) return                                    { verdict: 'success', text: `CTR ${ctr.toFixed(2)}% — excelente. El creativo captura muy bien la atención.`,          action: 'Reutilizar este creativo en campañas de conversión. Considerar escalar.' }
  if (ctr >= 1.2) return                                    { verdict: 'good',    text: `CTR ${ctr.toFixed(2)}% — buen rendimiento para tráfico frío.`,                           action: 'Testear variaciones de copy e imagen para seguir mejorando el CTR.' }
  if (ctr >= 0.6) return                                    { verdict: 'warning', text: `CTR ${ctr.toFixed(2)}% — por debajo del promedio esperado (>1.2%).`,                     action: 'Revisar creativos. Testear audiencias más amplias o diferentes intereses.' }
  return                                                    { verdict: 'danger',  text: `CTR ${ctr.toFixed(2)}% — muy bajo. El creativo no está resonando con la audiencia.`,     action: 'Cambiar creativos urgente. Revisar segmentación y relevancia del mensaje.' }
}

// ── UI helpers ─────────────────────────────────────────────────
const VS: Record<Verdict, { bg: string; border: string; icon: string; text: string; action: string }> = {
  success: { bg: 'bg-emerald-50 dark:bg-emerald-950/30', border: 'border-l-emerald-400', icon: '✅', text: 'text-emerald-900 dark:text-emerald-300', action: 'text-emerald-700 dark:text-emerald-400' },
  good:    { bg: 'bg-blue-50 dark:bg-blue-950/30',       border: 'border-l-blue-400',    icon: '👍', text: 'text-blue-900 dark:text-blue-300',       action: 'text-blue-700 dark:text-blue-400' },
  warning: { bg: 'bg-amber-50 dark:bg-amber-950/30',     border: 'border-l-amber-400',   icon: '⚠️', text: 'text-amber-900 dark:text-amber-300',     action: 'text-amber-700 dark:text-amber-400' },
  danger:  { bg: 'bg-red-50 dark:bg-red-950/30',         border: 'border-l-red-400',     icon: '🚨', text: 'text-red-900 dark:text-red-300',         action: 'text-red-700 dark:text-red-400' },
  info:    { bg: 'bg-gray-50 dark:bg-zinc-800/40',       border: 'border-l-gray-300 dark:border-l-zinc-600', icon: '📊', text: 'text-gray-700 dark:text-zinc-300', action: 'text-gray-500 dark:text-zinc-400' },
}

function RoasBar({ roas }: { roas: number | null }) {
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

function CpaChip({ cpa, breakeven }: { cpa: number | null; breakeven: number }) {
  if (!cpa) return <span className="text-gray-300 dark:text-zinc-600 text-sm">—</span>
  const cls = cpa <= breakeven
    ? 'bg-emerald-100 dark:bg-emerald-900/40 text-emerald-800 dark:text-emerald-300'
    : cpa <= breakeven * 1.25
    ? 'bg-amber-100 dark:bg-amber-900/40 text-amber-800 dark:text-amber-300'
    : 'bg-red-100 dark:bg-red-900/40 text-red-800 dark:text-red-300'
  return <span className={`inline-block px-2 py-0.5 rounded-md text-xs font-bold ${cls}`}>${Math.round(cpa).toLocaleString('es-AR')}</span>
}

function CtrBadge({ ctr }: { ctr: number | null }) {
  if (!ctr) return <span className="text-gray-300 dark:text-zinc-600 text-sm">—</span>
  const cls = ctr >= 1.2 ? 'text-blue-700 dark:text-blue-400 font-bold' : ctr >= 0.6 ? 'text-amber-600 dark:text-amber-400 font-semibold' : 'text-red-600 dark:text-red-400 font-semibold'
  return <span className={`text-sm ${cls}`}>{ctr.toFixed(2)}%</span>
}

// Chevron animado
function Chevron({ open }: { open: boolean }) {
  return (
    <svg
      viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"
      strokeLinecap="round" strokeLinejoin="round"
      className={`w-4 h-4 transition-transform duration-200 ${open ? 'rotate-180' : ''}`}
    >
      <polyline points="6 9 12 15 18 9"/>
    </svg>
  )
}

// ── Sección acordeón ───────────────────────────────────────────
interface SectionProps {
  title: string
  type: 'conversion' | 'traffic'
  adsets: Adset[]
  campaignMap: Record<string, string>
  breakeven: number
}

function AdsetSection({ title, type, adsets, campaignMap, breakeven }: SectionProps) {
  const [open, setOpen] = useState(true)

  const totalSpend  = adsets.reduce((s, a) => s + (a.spend  || 0), 0)
  const totalBudget = adsets.reduce((s, a) => s + (a.daily_budget || 0), 0)
  const isConv      = type === 'conversion'
  const cols        = isConv ? 7 : 6
  const gradient    = isConv ? 'from-blue-600 to-blue-700' : 'from-violet-600 to-violet-700'
  const emoji       = isConv ? '🎯' : '🚀'

  return (
    <div className="bg-white dark:bg-zinc-900 rounded-2xl border border-gray-200 dark:border-zinc-800 overflow-hidden shadow-sm">

      {/* Header acordeón */}
      <button
        onClick={() => setOpen(o => !o)}
        className={`w-full bg-gradient-to-r ${gradient} px-5 py-3.5 flex items-center justify-between hover:opacity-95 transition-opacity`}
      >
        <div className="flex items-center gap-2.5">
          <span className="text-lg">{emoji}</span>
          <span className="text-sm font-bold text-white">{title}</span>
          <span className="text-xs text-white/60 bg-white/10 px-2 py-0.5 rounded-full">
            {adsets.length} ad set{adsets.length !== 1 ? 's' : ''}
          </span>
        </div>
        <div className="flex items-center gap-5">
          <div className="hidden sm:flex items-center gap-5 text-xs text-white/80">
            <span>Gasto 7d: <strong className="text-white">${Math.round(totalSpend).toLocaleString('es-AR')}</strong></span>
            <span>Budget/día: <strong className="text-white">${Math.round(totalBudget).toLocaleString('es-AR')}</strong></span>
          </div>
          <span className="text-white/70"><Chevron open={open} /></span>
        </div>
      </button>

      {/* Contenido colapsable */}
      {open && (
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-gray-100 dark:border-zinc-800 bg-gray-50/60 dark:bg-zinc-800/40">
                <th className="text-left px-5 py-2.5 text-xs font-semibold text-gray-400 dark:text-zinc-500 uppercase tracking-wide">Ad Set</th>
                <th className="text-right px-3 py-2.5 text-xs font-semibold text-gray-400 dark:text-zinc-500 uppercase tracking-wide">Budget/día</th>
                <th className="text-right px-3 py-2.5 text-xs font-semibold text-gray-400 dark:text-zinc-500 uppercase tracking-wide">Gasto 7d</th>
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
                    <th className="text-right px-3 py-2.5 text-xs font-semibold text-gray-400 dark:text-zinc-500 uppercase tracking-wide">CPC</th>
                  </>
                )}
              </tr>
            </thead>
            <tbody>
              {adsets.map(adset => {
                const insight = generateInsight(adset, type, breakeven)
                const vs      = VS[insight.verdict]
                const cpc     = (adset.spend && adset.clicks > 0) ? adset.spend / adset.clicks : null

                return (
                  <React.Fragment key={adset.id}>
                    <tr className="border-t border-gray-50 dark:border-zinc-800 hover:bg-gray-50/40 dark:hover:bg-zinc-800/30 transition-colors">
                      <td className="px-5 py-3">
                        <p className="font-semibold text-gray-900 dark:text-white leading-tight">{adset.name}</p>
                        <p className="text-xs text-gray-400 dark:text-zinc-500 mt-0.5">{campaignMap[adset.campaign_id] || '—'}</p>
                      </td>
                      <td className="px-3 py-3 text-right text-gray-500 dark:text-zinc-400 tabular-nums">
                        {adset.daily_budget ? `$${adset.daily_budget.toLocaleString('es-AR')}` : '—'}
                      </td>
                      <td className="px-3 py-3 text-right font-semibold text-gray-900 dark:text-white tabular-nums">
                        {adset.spend ? `$${Math.round(adset.spend).toLocaleString('es-AR')}` : '—'}
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
                            {adset.ctr ? `${adset.ctr.toFixed(2)}%` : '—'}
                          </td>
                        </>
                      ) : (
                        <>
                          <td className="px-3 py-3 text-right text-gray-600 dark:text-zinc-300 tabular-nums">{adset.impressions ? adset.impressions.toLocaleString('es-AR') : '—'}</td>
                          <td className="px-3 py-3 text-right text-gray-600 dark:text-zinc-300 tabular-nums">{adset.clicks ? adset.clicks.toLocaleString('es-AR') : '—'}</td>
                          <td className="px-3 py-3 text-right"><CtrBadge ctr={adset.ctr} /></td>
                          <td className="px-3 py-3 text-right text-gray-600 dark:text-zinc-300 tabular-nums">{cpc ? `$${Math.round(cpc).toLocaleString('es-AR')}` : '—'}</td>
                        </>
                      )}
                    </tr>

                    {/* Insight row */}
                    <tr>
                      <td colSpan={cols} className="px-5 pt-0 pb-3">
                        <div className={`${vs.bg} border-l-2 ${vs.border} rounded-r-lg px-3 py-2 flex items-start gap-2`}>
                          <span className="text-sm shrink-0 mt-0.5">{vs.icon}</span>
                          <p className="text-xs leading-relaxed">
                            <span className={`font-medium ${vs.text}`}>{insight.text}</span>
                            <span className={`ml-2 ${vs.action}`}>→ <em>{insight.action}</em></span>
                          </p>
                        </div>
                      </td>
                    </tr>
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

// ── Export principal ───────────────────────────────────────────
interface Props {
  adsets: Adset[]
  campaignMap: Record<string, string>
  breakeven: number
}

export default function AdsetTable({ adsets, campaignMap, breakeven }: Props) {
  const convAdsets    = adsets.filter(a => !isTrafficAdset(a, campaignMap))
  const trafficAdsets = adsets.filter(a =>  isTrafficAdset(a, campaignMap))

  return (
    <div className="space-y-6">
      {convAdsets.length > 0 && (
        <AdsetSection title="Conversión" type="conversion" adsets={convAdsets} campaignMap={campaignMap} breakeven={breakeven} />
      )}
      {trafficAdsets.length > 0 && (
        <AdsetSection title="Tráfico web" type="traffic" adsets={trafficAdsets} campaignMap={campaignMap} breakeven={breakeven} />
      )}
    </div>
  )
}
