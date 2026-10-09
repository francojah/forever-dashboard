'use client'

import { useRouter, useSearchParams, usePathname } from 'next/navigation'
import { useState } from 'react'
import { delta as fmtDelta } from '@/lib/faro/format'

export function PageHeader({ title, description, children }: { title: string; description?: React.ReactNode; children?: React.ReactNode }) {
  return (
    <div className="flex flex-col gap-4 md:flex-row md:items-end md:justify-between mb-6">
      <div className="min-w-0">
        <h1 className="text-[26px] leading-tight font-semibold tracking-tight text-ink">{title}</h1>
        {description && <p className="mt-1 text-[14.5px] text-mute max-w-[70ch]">{description}</p>}
      </div>
      {children && <div className="flex flex-wrap items-center gap-2">{children}</div>}
    </div>
  )
}

const PERIODS: { key: string; label: string }[] = [
  { key: 'today', label: 'Hoy' },
  { key: 'yesterday', label: 'Ayer' },
  { key: '7d', label: '7 días' },
  { key: '30d', label: '30 días' },
  { key: 'mtd', label: 'Este mes' },
  { key: 'lastmonth', label: 'Mes pasado' },
]

/** Selector de período que vive en la URL (?p=7d o ?p=custom&from=&to=). */
export function PeriodPicker({ value, from, to }: { value: string; from: string; to: string }) {
  const router = useRouter()
  const pathname = usePathname()
  const sp = useSearchParams()
  const [custom, setCustom] = useState(value === 'custom')
  const [f, setF] = useState(from)
  const [t, setT] = useState(to)

  const go = (params: Record<string, string | null>) => {
    const next = new URLSearchParams(sp.toString())
    Object.entries(params).forEach(([k, v]) => (v == null ? next.delete(k) : next.set(k, v)))
    router.push(`${pathname}?${next.toString()}`, { scroll: false })
  }

  return (
    <div className="flex flex-wrap items-center gap-2">
      <div role="group" aria-label="Período" className="flex flex-wrap rounded-lg border border-line bg-surface p-0.5">
        {PERIODS.map((p) => (
          <button
            key={p.key}
            onClick={() => { setCustom(false); go({ p: p.key, from: null, to: null }) }}
            aria-pressed={value === p.key}
            className={`px-3 py-1.5 rounded-md text-[13.5px] ${value === p.key ? 'bg-beacon/20 text-ink font-semibold' : 'text-mute hover:text-ink'}`}
          >
            {p.label}
          </button>
        ))}
        <button
          onClick={() => setCustom((c) => !c)}
          aria-pressed={value === 'custom'}
          className={`px-3 py-1.5 rounded-md text-[13.5px] ${value === 'custom' ? 'bg-beacon/20 text-ink font-semibold' : 'text-mute hover:text-ink'}`}
        >
          Rango
        </button>
      </div>
      {custom && (
        <form
          className="flex items-center gap-1.5"
          onSubmit={(e) => { e.preventDefault(); go({ p: 'custom', from: f, to: t }) }}
        >
          <input type="date" value={f} onChange={(e) => setF(e.target.value)} className="rounded-md border border-line bg-surface px-2 py-1.5 text-[13px] text-ink" aria-label="Desde" />
          <span className="text-mute text-[13px]">a</span>
          <input type="date" value={t} onChange={(e) => setT(e.target.value)} className="rounded-md border border-line bg-surface px-2 py-1.5 text-[13px] text-ink" aria-label="Hasta" />
          <button className="rounded-md bg-ink text-surface px-3 py-1.5 text-[13px] font-medium">Ver</button>
        </form>
      )}
    </div>
  )
}

export function Panel({ title, description, actions, children, className = '', padded = true }: {
  title?: React.ReactNode; description?: React.ReactNode; actions?: React.ReactNode; children: React.ReactNode; className?: string; padded?: boolean
}) {
  return (
    <section className={`rounded-panel border border-line bg-surface ${className}`}>
      {(title || actions) && (
        <div className="flex items-start justify-between gap-3 px-5 pt-4 pb-3">
          <div className="min-w-0">
            {title && <h2 className="text-[15.5px] font-semibold text-ink">{title}</h2>}
            {description && <p className="text-[13px] text-mute mt-0.5">{description}</p>}
          </div>
          {actions && <div className="shrink-0 flex items-center gap-2">{actions}</div>}
        </div>
      )}
      <div className={padded ? 'px-5 pb-5' : ''}>{children}</div>
    </section>
  )
}

/** Variación coloreada según si subir es bueno o malo. */
export function Delta({ value, goodWhenUp = true, hint }: { value: number | null; goodWhenUp?: boolean; hint?: string }) {
  if (value == null || !isFinite(value)) return <span className="text-faint text-[12.5px]">sin comparación</span>
  const flat = Math.abs(value) < 0.02
  const good = flat ? null : goodWhenUp ? value > 0 : value < 0
  return (
    <span className={`text-[12.5px] num ${good == null ? 'text-mute' : good ? 'text-good' : 'text-bad'}`} title={hint}>
      {fmtDelta(value)} <span className="text-faint">{hint}</span>
    </span>
  )
}

/** Explicación de una métrica: muestra la fórmula con los valores usados. */
export function Explain({ children, label = 'Cómo se calcula' }: { children: React.ReactNode; label?: string }) {
  const [open, setOpen] = useState(false)
  return (
    <span className="relative inline-block">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        onBlur={() => setTimeout(() => setOpen(false), 150)}
        aria-label={label}
        aria-expanded={open}
        className="w-[18px] h-[18px] rounded-full border border-line text-[11px] leading-none text-mute hover:text-ink hover:border-mute grid place-items-center"
      >
        ?
      </button>
      {open && (
        <span role="tooltip" className="absolute z-20 left-1/2 -translate-x-1/2 top-6 w-72 rounded-lg border border-line bg-surface p-3 text-[12.5px] leading-relaxed text-ink shadow-lg">
          {children}
        </span>
      )}
    </span>
  )
}

export function Badge({ tone = 'neutral', children, title }: { tone?: 'neutral' | 'good' | 'bad' | 'warn' | 'beacon'; children: React.ReactNode; title?: string }) {
  const cls = {
    neutral: 'bg-sunken text-mute',
    good: 'bg-good/10 text-good',
    bad: 'bg-bad/10 text-bad',
    warn: 'bg-warn/15 text-warn',
    beacon: 'bg-beacon/20 text-beacon-ink',
  }[tone]
  return <span title={title} className={`inline-flex items-center rounded-md px-1.5 py-0.5 text-[11.5px] font-medium whitespace-nowrap ${cls}`}>{children}</span>
}

export function Empty({ title, children }: { title: string; children?: React.ReactNode }) {
  return (
    <div className="py-10 text-center">
      <p className="font-medium text-ink">{title}</p>
      {children && <div className="mt-1 text-[13.5px] text-mute">{children}</div>}
    </div>
  )
}

export function Tabs({ tabs, value, param = 'tab' }: { tabs: { key: string; label: string; badge?: React.ReactNode }[]; value: string; param?: string }) {
  const router = useRouter()
  const pathname = usePathname()
  const sp = useSearchParams()
  return (
    <div role="tablist" className="flex gap-1 border-b border-line mb-6 overflow-x-auto">
      {tabs.map((t) => (
        <button
          key={t.key}
          role="tab"
          aria-selected={value === t.key}
          onClick={() => {
            const next = new URLSearchParams(sp.toString())
            next.set(param, t.key)
            router.push(`${pathname}?${next.toString()}`, { scroll: false })
          }}
          className={`-mb-px px-3 py-2.5 text-[14px] border-b-2 whitespace-nowrap flex items-center gap-1.5 ${value === t.key ? 'border-beacon text-ink font-semibold' : 'border-transparent text-mute hover:text-ink'}`}
        >
          {t.label}{t.badge}
        </button>
      ))}
    </div>
  )
}
