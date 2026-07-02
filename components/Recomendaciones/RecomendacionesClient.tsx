'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { Skeleton } from '@/components/ui/Skeleton'

interface Rec {
  area: string
  priority: 'alta' | 'media' | 'baja'
  title: string
  why: string
  action: string
  impact?: string
  link?: string
}

const AREA_STYLE: Record<string, { ic: string; color: string }> = {
  Marketing: { ic: 'M3 3v18h18M7 15l3-4 3 3 4-6', color: 'text-blue-500' },
  Stock: { ic: 'M16 11V7a4 4 0 00-8 0v4M5 11h14v10H5z', color: 'text-amber-500' },
  Clientes: { ic: 'M17 21v-2a4 4 0 00-4-4H5a4 4 0 00-4 4v2M9 11a4 4 0 100-8 4 4 0 000 8z', color: 'text-emerald-500' },
  Producto: { ic: 'M20 7l-8-4-8 4m16 0l-8 4m8-4v10l-8 4m0-14L4 7m8 4v10M4 7v10l8 4', color: 'text-violet-500' },
  Finanzas: { ic: 'M12 1v22M17 5H9.5a3.5 3.5 0 000 7h5a3.5 3.5 0 010 7H6', color: 'text-fuchsia-500' },
}

const PRIORITY = {
  alta: 'bg-red-100 dark:bg-red-500/15 text-red-600 dark:text-red-400',
  media: 'bg-amber-100 dark:bg-amber-500/15 text-amber-600 dark:text-amber-400',
  baja: 'bg-emerald-100 dark:bg-emerald-500/15 text-emerald-600 dark:text-emerald-400',
}

export default function RecomendacionesClient() {
  const [recs, setRecs] = useState<Rec[] | null>(null)
  const [loading, setLoading] = useState(true)
  const [fallback, setFallback] = useState(false)

  const load = () => {
    setLoading(true)
    fetch('/api/recommendations')
      .then((r) => r.json())
      .then((d) => { setRecs(d.recommendations || []); setFallback(!!d.fallback) })
      .catch(() => setRecs([]))
      .finally(() => setLoading(false))
  }
  useEffect(load, [])

  const order = ['alta', 'media', 'baja']
  const sorted = (recs || []).slice().sort((a, b) => order.indexOf(a.priority) - order.indexOf(b.priority))
  const areas = Array.from(new Set(sorted.map((r) => r.area)))

  return (
    <div className="max-w-5xl mx-auto p-6">
      <div className="flex items-start justify-between gap-4 mb-6">
        <div>
          <h1 className="text-xl font-semibold text-gray-900 dark:text-zinc-100">Recomendaciones</h1>
          <p className="text-sm text-gray-500 dark:text-zinc-500 mt-0.5">
            El copiloto de Faro cruza tus datos y te dice qué hacer, por área.
          </p>
        </div>
        <button onClick={load} className="text-xs rounded-lg border border-gray-200 dark:border-zinc-700 px-3 py-1.5 text-gray-600 dark:text-zinc-300 hover:bg-gray-50 dark:hover:bg-zinc-800">
          Regenerar
        </button>
      </div>

      {loading ? (
        <div className="space-y-3">{Array.from({ length: 5 }).map((_, i) => <Skeleton key={i} className="h-20 w-full" />)}</div>
      ) : !recs || recs.length === 0 ? (
        <p className="text-sm text-gray-400 dark:text-zinc-500">Sin señales suficientes todavía. Corré los syncs de Meta y Tiendanube.</p>
      ) : (
        <div className="space-y-6">
          {fallback && (
            <p className="text-mini text-amber-600 dark:text-amber-400">Mostrando recomendaciones por reglas (la IA no respondió). Regenerá para reintentar.</p>
          )}
          {areas.map((area) => {
            const st = AREA_STYLE[area] || { ic: 'M12 2v20', color: 'text-gray-500' }
            return (
              <div key={area}>
                <div className="flex items-center gap-2 mb-2">
                  <svg width="15" height="15" viewBox="0 0 24 24" fill="none" className={st.color} stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><path d={st.ic} /></svg>
                  <h2 className="text-sm font-semibold text-gray-700 dark:text-zinc-200 uppercase tracking-wide">{area}</h2>
                </div>
                <div className="space-y-2">
                  {sorted.filter((r) => r.area === area).map((r, i) => {
                    const inner = (
                      <div className="flex items-start gap-3 p-4 rounded-xl bg-white dark:bg-zinc-900 border border-gray-200 dark:border-zinc-800 shadow-sm hover:border-gray-300 dark:hover:border-zinc-700 transition-colors">
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2 flex-wrap">
                            <span className="text-sm font-medium text-gray-900 dark:text-zinc-100">{r.title}</span>
                            <span className={'text-micro px-1.5 py-0.5 rounded-full font-medium ' + PRIORITY[r.priority]}>{r.priority}</span>
                            {r.impact && <span className="text-micro px-1.5 py-0.5 rounded-full bg-brand-soft font-medium">{r.impact}</span>}
                          </div>
                          <p className="text-mini text-gray-500 dark:text-zinc-400 mt-1">{r.why}</p>
                          <p className="text-mini text-gray-700 dark:text-zinc-300 mt-1">→ {r.action}</p>
                        </div>
                        {r.link && <svg width="16" height="16" viewBox="0 0 24 24" fill="none" className="text-gray-300 dark:text-zinc-600 mt-1 shrink-0" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M9 18l6-6-6-6" /></svg>}
                      </div>
                    )
                    return r.link ? <Link key={i} href={r.link}>{inner}</Link> : <div key={i}>{inner}</div>
                  })}
                </div>
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}
