'use client'

import { useRouter, useSearchParams } from 'next/navigation'
import { monthLabel } from '@/lib/faro/dates'

function shift(m: string, n: number) {
  const [y, mo] = m.split('-').map(Number)
  const d = new Date(Date.UTC(y, mo - 1 + n, 1))
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}`
}

export default function MonthPicker({ value, max }: { value: string; max: string }) {
  const router = useRouter()
  const sp = useSearchParams()
  const go = (m: string) => { const n = new URLSearchParams(sp.toString()); n.set('m', m); router.push(`?${n.toString()}`, { scroll: false }) }
  const next = shift(value, 1)
  return (
    <div className="flex items-center gap-1 rounded-lg border border-line bg-surface p-0.5">
      <button onClick={() => go(shift(value, -1))} className="px-2.5 py-1.5 rounded-md text-mute hover:text-ink" aria-label="Mes anterior">‹</button>
      <span className="px-2 text-[14px] font-medium text-ink min-w-[130px] text-center">{monthLabel(value)}</span>
      <button onClick={() => go(next)} disabled={next > max} className="px-2.5 py-1.5 rounded-md text-mute hover:text-ink disabled:opacity-30" aria-label="Mes siguiente">›</button>
    </div>
  )
}
