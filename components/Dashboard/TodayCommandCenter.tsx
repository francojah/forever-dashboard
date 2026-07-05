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
  const [done, setDone] = useState<Set<string>>(new Set())

  const tnToday = tnSnapshot?.summary_today
  const revenueToday = tnToday?.total_revenue ?? null
  const ordersToday = tnToday?.total_orders ?? 0
  const realRoasToday = revenueToday != null && todaySpend && todaySpend > 0 ? revenueToday / todaySpend : null

  // Tendencia: ventas de hoy vs promedio diario de los últimos 7 días
  const avgDaily7d = tnSnapshot?.summary_7d?.total_revenue ? tnSnapshot.summary_7d.total_revenue / 7 : null
  const ventasDelta = revenueToday != null && avgDaily7d && avgDaily7d > 0 ? ((revenueToday - avgDaily7d) / avgDaily7d) * 100 : null

  const cacheKey = () => `faro_actions_${new Date().toISOString().slice(0, 10)}`
  const doneKey = () => `faro_actions_done_${new Date().toISOString().slice(0, 10)}`

  function toggleDone(title: string) {
    setDone((prev) => {
      const next = new Set(prev)
      if (next.has(title)) next.delete(title)
      else next.add(title)
      try { localStorage.setItem(doneKey(), JSON.stringify(Array.from(next))) } catch { /* ignore */ }
      return next
    })
  }

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
    try { const raw = localStorage.getItem(doneKey()); if (raw) setDone(new Set(JSON.parse(raw) as string[])) } catch { /* ignore */ }
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
          <Kpi label="Ventas hoy" value={money(revenueToday)} sub={`${ordersToday} órdenes`} strong delta={mounted ? ventasDelta : null} deltaHint="vs prom. 7d" />
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
              {mounted && actions && actions.length > 0 && (
                <span className="text-micro text-gray-400 dark:text-zinc-600">
                  {actions.filter((a) => done.has(a.title)).length}/{actions.length} hechas
                </span>
              )}
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
              {[...actions]
                .sort((a, b) => (done.has(a.title) ? 1 : 0) - (done.has(b.title) ? 1 : 0))
                .map((a, i) => {
                  const p = PRIORITY[a.priority] || PRIORITY.media
                  const isDone = done.has(a.title)
                  return (
                    <div key={i} className={'flex items-start gap-3 p-3 rounded-lg transition-colors ' + (isDone ? 'opacity-50' : 'hover:bg-gray-50 dark:hover:bg-zinc-800/50')}>
                      <button
                        onClick={() => toggleDone(a.title)}
                        title={isDone ? 'Marcar como pendiente' : 'Marcar como hecha'}
                        className={'mt-0.5 w-5 h-5 rounded-full border shrink-0 flex items-center justify-center transition-colors ' + (isDone ? 'bg-emerald-500 border-emerald-500' : 'border-gray-300 dark:border-zinc-600 hover:border-emerald-400')}
                      >
                        {isDone && <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round"><polyline points="20 6 9 17 4 12" /></svg>}
                      </button>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 flex-wrap">
                          {!isDone && <span className={'w-2 h-2 rounded-full shrink-0 ' + p.dot} />}
                          <span className={'text-sm font-medium text-gray-900 dark:text-zinc-100 ' + (isDone ? 'line-through' : '')}>{a.title}</span>
                          {!isDone && <span className={'text-micro px-1.5 py-0.5 rounded-full font-medium ' + p.chip + ' ' + p.label}>{a.priority}</span>}
                        </div>
                        {!isDone && (
                          <>
                            <p className="text-mini text-gray-500 dark:text-zinc-400 mt-0.5">{a.why}</p>
                            <p className="text-mini text-gray-700 dark:text-zinc-300 mt-1">
                              → {a.action}
                              {a.link && <Link href={a.link} className="text-brand ml-1 hover:underline">ir →</Link>}
                            </p>
                          </>
                        )}
                      </div>
                    </div>
                  )
                })}
            </div>
          )}
        </div>
      </div>
    </div>
  )
}

function Kpi({ label, value, sub, strong, tone, delta, deltaHint }: { label: string; value: string; sub?: string; strong?: boolean; tone?: 'good' | 'warn' | 'bad'; delta?: number | null; deltaHint?: string }) {
  const color = tone === 'good' ? 'text-emerald-600 dark:text-emerald-400' : tone === 'warn' ? 'text-amber-600 dark:text-amber-400' : tone === 'bad' ? 'text-red-500' : 'text-gray-900 dark:text-zinc-100'
  const showDelta = delta != null && isFinite(delta)
  const deltaUp = (delta ?? 0) >= 0
  return (
    <div className="rounded-xl bg-white/70 dark:bg-zinc-900/60 border border-gray-100 dark:border-zinc-800 p-3 backdrop-blur">
      <p className="text-micro uppercase tracking-wide text-gray-400 dark:text-zinc-500">{label}</p>
      <p className={'font-bold mt-0.5 ' + (strong ? 'text-2xl ' : 'text-xl ') + color}>{value}</p>
      <div className="flex items-center gap-1.5 mt-0.5">
        {sub && <p className="text-micro text-gray-400 dark:text-zinc-600">{sub}</p>}
        {showDelta && (
          <span className={'text-micro font-medium ' + (deltaUp ? 'text-emerald-600 dark:text-emerald-400' : 'text-red-500')}>
            {deltaUp ? '↑' : '↓'} {Math.abs(delta as number).toFixed(0)}% {deltaHint || ''}
          </span>
        )}
      </div>
    </div>
  )
}

function roas7d(snapshot: Snapshot | null, tn: TNSnapshot | null): string {
  const rev = tn?.summary_7d?.total_revenue
  const spend = snapshot?.summary?.total_spend_7d
  if (!rev || !spend) return '—'
  return (rev / spend).toFixed(2) + 'x'
}
