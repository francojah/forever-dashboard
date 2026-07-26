'use client'

import { useEffect, useState } from 'react'
import { LOCALE } from '@/lib/config'
import { Skeleton } from '@/components/ui/Skeleton'

interface Signal { key: string; label: string; value: string; score: number; hint: string }
interface Data {
  health: number
  signals: Signal[]
  diagnosis: string
  kpis: { revenue_30d: number; meta_spend_30d: number; real_roas: number | null; net_margin_30d: number; customers_30d: number }
}

const money = (n: number | null | undefined) => (n == null ? '—' : '$' + Math.round(n).toLocaleString(LOCALE))

function band(score: number) {
  if (score >= 70) return { text: 'text-emerald-600 dark:text-emerald-400', bar: 'bg-emerald-500', dot: 'bg-emerald-500' }
  if (score >= 45) return { text: 'text-amber-600 dark:text-amber-400', bar: 'bg-amber-500', dot: 'bg-amber-500' }
  return { text: 'text-red-500', bar: 'bg-red-500', dot: 'bg-red-500' }
}

export default function BusinessHealth() {
  const [data, setData] = useState<Data | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    fetch('/api/analytics/overview', { cache: 'no-store' })
      .then((r) => r.json()).then(setData).catch(() => setData(null)).finally(() => setLoading(false))
  }, [])

  if (loading) return <div className="bg-white dark:bg-zinc-900 rounded-2xl border border-gray-200 dark:border-zinc-800 p-6"><Skeleton className="h-40 w-full" /></div>
  if (!data || !data.signals) return <div className="bg-white dark:bg-zinc-900 rounded-2xl border border-gray-200 dark:border-zinc-800 p-6 text-sm text-gray-400 dark:text-zinc-500">Sin datos suficientes todavía. Corré los syncs.</div>

  const hb = band(data.health)

  return (
    <div className="bg-white dark:bg-zinc-900 rounded-2xl border border-gray-200 dark:border-zinc-800 shadow-sm overflow-hidden">
      <div className="p-6 grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Score */}
        <div className="flex flex-col items-center justify-center text-center lg:border-r border-gray-100 dark:border-zinc-800 lg:pr-6">
          <div className="relative w-32 h-32">
            <svg viewBox="0 0 36 36" className="w-32 h-32 -rotate-90">
              <circle cx="18" cy="18" r="15.9" fill="none" className="stroke-gray-100 dark:stroke-zinc-800" strokeWidth="3" />
              <circle cx="18" cy="18" r="15.9" fill="none" className={hb.bar.replace('bg-', 'stroke-')} strokeWidth="3" strokeLinecap="round" strokeDasharray={`${data.health}, 100`} />
            </svg>
            <div className="absolute inset-0 flex flex-col items-center justify-center">
              <span className={'text-3xl font-bold ' + hb.text}>{data.health}</span>
              <span className="text-micro text-gray-400 dark:text-zinc-500">/ 100</span>
            </div>
          </div>
          <p className="text-sm font-semibold text-gray-900 dark:text-zinc-100 mt-3">Salud del negocio</p>
          <p className="text-mini text-gray-400 dark:text-zinc-500">últimos 30 días</p>
        </div>

        {/* Signals */}
        <div className="lg:col-span-2 space-y-3">
          {data.signals.map((s) => {
            const b = band(s.score)
            return (
              <div key={s.key}>
                <div className="flex items-center justify-between text-sm mb-1">
                  <span className="flex items-center gap-2 text-gray-700 dark:text-zinc-300">
                    <span className={'w-1.5 h-1.5 rounded-full ' + b.dot} />{s.label}
                  </span>
                  <span className={'font-semibold tabular-nums ' + b.text}>{s.value}</span>
                </div>
                <div className="h-1.5 rounded-full bg-gray-100 dark:bg-zinc-800 overflow-hidden">
                  <div className={'h-full rounded-full ' + b.bar} style={{ width: s.score + '%' }} />
                </div>
                <p className="text-micro text-gray-400 dark:text-zinc-600 mt-0.5">{s.hint}</p>
              </div>
            )
          })}
        </div>
      </div>

      {/* Diagnóstico + KPIs */}
      <div className="px-6 py-4 bg-brand-soft/50 border-t border-gray-100 dark:border-zinc-800">
        <p className="text-mini font-semibold uppercase tracking-wide text-brand mb-1">Diagnóstico estructural · IA</p>
        <p className="text-sm text-gray-700 dark:text-zinc-300 leading-relaxed">{data.diagnosis}</p>
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mt-4">
          <Kpi label="Revenue 30d" value={money(data.kpis.revenue_30d)} />
          <Kpi label="Margen neto 30d" value={money(data.kpis.net_margin_30d)} tone={data.kpis.net_margin_30d >= 0 ? 'good' : 'bad'} />
          <Kpi label="ROAS real" value={data.kpis.real_roas == null ? '—' : data.kpis.real_roas + 'x'} />
          <Kpi label="Clientes 30d" value={String(data.kpis.customers_30d)} />
        </div>
      </div>
    </div>
  )
}

function Kpi({ label, value, tone }: { label: string; value: string; tone?: 'good' | 'bad' }) {
  const c = tone === 'good' ? 'text-emerald-600 dark:text-emerald-400' : tone === 'bad' ? 'text-red-500' : 'text-gray-900 dark:text-zinc-100'
  return (
    <div>
      <p className="text-micro uppercase tracking-wide text-gray-400 dark:text-zinc-500">{label}</p>
      <p className={'text-base font-bold mt-0.5 ' + c}>{value}</p>
    </div>
  )
}
