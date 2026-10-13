'use client'

import { useRouter, useSearchParams } from 'next/navigation'
import type { MoneyMode as Mode } from '@/lib/faro/macro'

const OPTS: { key: Mode; label: string; title: string }[] = [
  { key: 'nominal', label: 'Pesos', title: 'Pesos de cada mes, sin ajustar' },
  { key: 'real', label: 'Pesos de hoy', title: 'Ajustado por inflación para comparar meses' },
  { key: 'usd', label: 'Dólar MEP', title: 'Convertido al dólar MEP promedio de cada mes' },
]

/** Selector de moneda: pesos corrientes, ajustados por inflación o en dólares. */
export default function MoneyMode({ value }: { value: Mode }) {
  const router = useRouter()
  const sp = useSearchParams()
  const go = (m: Mode) => { const n = new URLSearchParams(sp.toString()); if (m === 'nominal') n.delete('moneda'); else n.set('moneda', m); router.push(`?${n.toString()}`, { scroll: false }) }
  return (
    <div className="inline-flex rounded-lg border border-line bg-surface p-0.5 text-[13px]" role="group" aria-label="Moneda">
      {OPTS.map((o) => (
        <button key={o.key} onClick={() => go(o.key)} title={o.title} aria-pressed={value === o.key}
          className={`rounded-md px-2.5 py-1.5 ${value === o.key ? 'bg-ink text-bg font-medium' : 'text-mute hover:text-ink'}`}>{o.label}</button>
      ))}
    </div>
  )
}
