'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import type { Snapshot, TNSnapshot } from '@/lib/supabase'
import { LOCALE } from '@/lib/config'
import { Skeleton } from '@/components/ui/Skeleton'

/**
 * TodayCommandCenter — El "Home Hoy": centro de comando de apertura.
 * Saludo + KPIs del día en vivo + las 3 acciones sugeridas por IA (/api/today-actions).
 * Pensado como lo primero que ve el dueño cada mañana.
 */

interface Action {
  priority: 'alta' | 'media' | 'baja'
  title: string
  why: string
  action: string
  link?: string
}

interface Props {
  snapshot: Snapshot | null
  tnSnapshot: TNSnapshot | null
}

const money = (n: number | null | undefined) => (n == null ? '—' : '$' + Math.round(n).toLocaleString(LOCALE))

function greeting() {
  const h = new Date().getHours()
  if (h < 6) return 'Buenas noches'
  if (h < 13) return 'Buenos días'
  if (h < 20) return 'Buenas tardes'
  return 'Buenas noches'
}

const PRIORITY = {
  alta: { dot: 'bg-red-500', label: 'text-red-600 dark:text-red-400', chip: 'bg-red-100 dark:bg-red-500/15' },
  media: { dot: 'bg-amber-500', label: 'text-amber-600 dark:text-amber-400', chip: 'bg-amber-100 dark:bg-amber-500/15' },
  baja: { dot: 'bg-emerald-500', label: 'text-emerald-600 dark:text-emerald-400', chip: 'bg-emerald-100 dark:bg-emerald-500/15' },
}

export default function TodayCommandCenter({ snapshot, tnSnapshot }: Props) {
  const [todaySpend, setTodaySpend] = useState<number | null>(null)
  const [actions, setActions] = useState<Action[] | null>(null)
  const [loadingActions, setLoadingActions] = useState(true)
  const [generatedAt, setGeneratedAt] = useState<string | null>(null)
  const [mounted, setMounted] = useState(false)

  const tnToday = tnSnapshot?.summary_today
  const revenueToday = tnToday?.total_revenue ?? null
  const ordersToday = tnToday?.total_orders ?? 0
  const realRoasToday = revenueToday != null && todaySpend && todaySpend > 0 ? revenueToday / todaySpend : null

  const cacheKey = () => `faro_actions_${new Date().toISOString().slice(0, 10)}`

  function loadActions(force = false) {
    // Cache diario en localStorage: se genera una vez por día y queda estable.
    if (!force) {
      try {
        const raw = localStorage.getItem(cacheKey())
        if (raw) {
          const cached = JSON.parse(raw) as { actions: Action[]; at: string }
          setActions(cached.actions)
          setGeneratedAt(cached.at)
          setLoadingActions(false)
          return
        }
      } catch { /* cache inválido → regenerar */ }
    }
    setLoadingActions(true)
    fetch('/api/today-actions')
      .then((r) => r.json())
      .then((d) => {
        const acts = d.actions || []
        const at = new Date().toISOString()
        setActions(acts)
        setGeneratedAt(at)
        try { localStorage.setItem(cacheKey(), JSON.stringify({ actions: acts, at })) } catch { /* ignore */ }
      })
      .catch(() => setActions([]))
      .finally(() => setLoadingActions(false))
  }

  useEffect(() => {
    setMounted(true)
    fetch('/api/meta-today').then((r) => r.json()).then((d) => setTodaySpend(typeof d.spend === 'number' ? d.spend : null)).catch(() => {})
    loadActions(false)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // Solo tras montar (evita mismatch de hidratación por hora/fecha del cliente)
  const fecha = mounted ? new Date().toLocaleDateString(LOCALE, { weekday: 'long', day: 'numeric', month: 'long' }) : ''

  return (
    <div
      className="rounded-2xl border border-gray-200 dark:border-zinc-800 overflow-hidden shadow-sm mb-6"
      style={{ background: 'linear-gradient(135deg, color-mix(in srgb, var(--brand-500) 8%, transparent), transparent 55%)' }}
    >
      <div className="p-5 sm:p-6">
        {/* Saludo */}
        <div className="flex items-end justify-between gap-4 mb-5">
          <div>
            <h2 className="text-xl font-bold text-gray-900 dark:text-zinc-100">{mounted ? greeting() : 'Hola'} 👋</h2>
            <p className="text-mini text-gray-500 dark:text-zinc-500 capitalize mt-0.5">{fecha}</p>
          </div>
        </div>

        {/* KPIs del día */}
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 mb-5">
          <Kpi label="Ventas hoy" value={money(revenueToday)} sub={`${ordersToday} órdenes`} strong />
          <Kpi label="Gasto Meta hoy" value={todaySpend == null ? '…' : money(todaySpend)} />
          <Kpi
            label="ROAS real hoy"
            value={realRoasToday == null ? '—' : realRoasToday.toFixed(2) + 'x'}
            tone={realRoasToday == null ? undefined : realRoasToday >= 3 ? 'good' : realRoasToday >= 1.8 ? 'warn' : 'bad'}
          />
          <Kpi label="ROAS real 7d" value={roas7d(snapshot, tnSnapshot)} />
        </div>

        {/* Acciones para hoy */}
        <div className="rounded-xl bg-white/70 dark:bg-zinc-900/60 border border-gray-100 dark:border-zinc-800 p-4 backdrop-blur">
          <div className="flex items-center justify-between gap-2 mb-3">
            <div className="flex items-center gap-2">
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" className="text-brand" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><path d="M13 2L3 14h7l-1 8 10-12h-7l1-8z" /></svg>
              <h3 className="text-sm font-semibold text-gray-900 dark:text-zinc-100">Plan de hoy</h3>
              <span className="text-micro text-gray-400 dark:text-zinc-600">· por IA</span>
            </div>
            <div className="flex items-center gap-2">
              {mounted && generatedAt && (
                <span className="text-micro text-gray-400 dark:text-zinc-600">
                  {new Date(generatedAt).toLocaleTimeString(LOCALE, { hour: '2-digit', minute: '2-digit' })}
                </span>
              )}
              <button
                onClick={() => loadActions(true)}
                disabled={loadingActions}
                className="text-micro rounded-md border border-gray-200 dark:border-zinc-700 px-2 py-1 text-gray-600 dark:text-zinc-300 hover:bg-gray-50 dark:hover:bg-zinc-800 disabled:opacity-40"
              >
                Regenerar
              </button>
            </div>
          </div>

          {loadingActions ? (
            <div className="space-y-2">{Array.from({ length: 3 }).map((_, i) => <Skeleton key={i} className="h-14 w-full" />)}</div>
          ) : !actions || actions.length === 0 ? (
            <p className="text-mini text-gray-400 dark:text-zinc-500 py-3">Sin señales suficientes todavía. Corré un sync para generar recomendaciones.</p>
          ) : (
            <div className="space-y-2">
              {actions.map((a, i) => {
                const p = PRIORITY[a.priority] || PRIORITY.media
                const inner = (
                  <div className="flex items-start gap-3 p-3 rounded-lg hover:bg-gray-50 dark:hover:bg-zinc-800/50 transition-colors">
                    <span className={'mt-1 w-2 h-2 rounded-full shrink-0 ' + p.dot} />
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="text-sm font-medium text-gray-900 dark:text-zinc-100">{a.title}</span>
                        <span className={'text-micro px-1.5 py-0.5 rounded-full font-medium ' + p.chip + ' ' + p.label}>{a.priority}</span>
                      </div>
                      <p className="text-mini text-gray-500 dark:text-zinc-400 mt-0.5">{a.why}</p>
                      <p className="text-mini text-gray-700 dark:text-zinc-300 mt-1">→ {a.action}</p>
                    </div>
                    {a.link && (
                      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" className="text-gray-300 dark:text-zinc-600 mt-1 shrink-0" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M9 18l6-6-6-6" /></svg>
                    )}
                  </div>
                )
                return a.link ? <Link key={i} href={a.link}>{inner}</Link> : <div key={i}>{inner}</div>
              })}
            </div>
          )}
        </div>
      </div>
    </div>
  )
}

function Kpi({ label, value, sub, strong, tone }: { label: string; value: string; sub?: string; strong?: boolean; tone?: 'good' | 'warn' | 'bad' }) {
  const color = tone === 'good' ? 'text-emerald-600 dark:text-emerald-400' : tone === 'warn' ? 'text-amber-600 dark:text-amber-400' : tone === 'bad' ? 'text-red-500' : 'text-gray-900 dark:text-zinc-100'
  return (
    <div className="rounded-xl bg-white/70 dark:bg-zinc-900/60 border border-gray-100 dark:border-zinc-800 p-3 backdrop-blur">
      <p className="text-micro uppercase tracking-wide text-gray-400 dark:text-zinc-500">{label}</p>
      <p className={'font-bold mt-0.5 ' + (strong ? 'text-2xl ' : 'text-xl ') + color}>{value}</p>
      {sub && <p className="text-micro text-gray-400 dark:text-zinc-600 mt-0.5">{sub}</p>}
    </div>
  )
}

function roas7d(snapshot: Snapshot | null, tn: TNSnapshot | null): string {
  const rev = tn?.summary_7d?.total_revenue
  const spend = snapshot?.summary?.total_spend_7d
  if (!rev || !spend) return '—'
  return (rev / spend).toFixed(2) + 'x'
}
