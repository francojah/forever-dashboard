'use client'

import { useMemo, useState } from 'react'

type Item = { name: string; variant_label: string; quantity: number; reason?: string; new_product_name?: string | null; new_variant_label?: string | null }
type Row = { type: string; status: string; created_at: string; items: Item[] }

const card = 'rounded-xl border border-gray-200 dark:border-zinc-800 bg-white dark:bg-zinc-900'
const SIZES = ['XXS', 'XS', 'S', 'M', 'L', 'XL', 'XXL', '2XL', 'XXXL', '3XL', '4XL']
const sizeOf = (label: string) => (label || '').split('/').map((x) => x.trim()).find((x) => SIZES.includes(x.toUpperCase()))?.toUpperCase() || ''
const short = (name: string) => name.replace(/100%|Algod[oó]n|Premium/gi, '').replace(/\s+/g, ' ').trim()

function Bars({ data, total }: { data: [string, number][]; total: number }) {
  if (!data.length) return <p className="text-xs text-gray-500">Sin datos.</p>
  const max = Math.max(...data.map((d) => d[1]))
  return (
    <ul className="space-y-1.5">
      {data.map(([k, v]) => (
        <li key={k} className="text-xs">
          <div className="flex justify-between gap-3 text-gray-700 dark:text-zinc-300">
            <span className="truncate">{k}</span>
            <span className="tabular-nums shrink-0">{v} <span className="text-gray-400">({Math.round((v / total) * 100)}%)</span></span>
          </div>
          <div className="h-1.5 mt-1 rounded bg-gray-100 dark:bg-zinc-800">
            <div className="h-1.5 rounded bg-[#B8892B]" style={{ width: `${(v / max) * 100}%` }} />
          </div>
        </li>
      ))}
    </ul>
  )
}

/** Qué se cambia, por qué y hacia qué talle: para ajustar la guía de talles y la producción. */
export default function ReasonsReport({ rows, reasons }: { rows: Row[]; reasons: { id: string; label: string }[] }) {
  const [days, setDays] = useState<30 | 90 | 0>(90)

  const stats = useMemo(() => {
    const since = days ? Date.now() - days * 86400000 : 0
    const items: Item[] = []
    let exchanges = 0
    for (const r of rows) {
      if (r.type !== 'cambio' || r.status === 'cancelado' || new Date(r.created_at).getTime() < since) continue
      exchanges++
      for (const it of r.items) items.push(it)
    }
    const units = items.reduce((s, i) => s + (i.quantity || 1), 0)
    const count = (f: (i: Item) => string | null) => {
      const m = new Map<string, number>()
      for (const i of items) { const k = f(i); if (k) m.set(k, (m.get(k) || 0) + (i.quantity || 1)) }
      return Array.from(m.entries()).sort((a, b) => b[1] - a[1])
    }
    const label = (id?: string) => reasons.find((r) => r.id === id)?.label.replace(' (te atendemos por WhatsApp)', '') || id || 'Sin motivo'
    const direction = (i: Item) => {
      const a = SIZES.indexOf(sizeOf(i.variant_label)), b = SIZES.indexOf(sizeOf(i.new_variant_label || ''))
      if (a < 0 || b < 0) return null
      return b > a ? 'Pidió talle más grande' : b < a ? 'Pidió talle más chico' : 'Mismo talle (otro color o modelo)'
    }
    return {
      exchanges, units,
      byReason: count((i) => label(i.reason)),
      byModel: count((i) => short(i.name)),
      bySize: count((i) => (sizeOf(i.variant_label) ? `${short(i.name)} · ${sizeOf(i.variant_label)}` : null)).slice(0, 8),
      byDirection: count(direction),
      moves: count((i) => {
        const a = sizeOf(i.variant_label), b = sizeOf(i.new_variant_label || '')
        if (!a || !b || a === b) return null
        const to = i.new_product_name && i.new_product_name !== i.name ? `${short(i.new_product_name)} ${b}` : b
        return `${short(i.name)}: ${a} → ${to}`
      }).slice(0, 8),
      modelSwitch: count((i) => (i.new_product_name && i.new_product_name !== i.name ? `${short(i.name)} → ${short(i.new_product_name)}` : null)).slice(0, 6),
    }
  }, [rows, reasons, days])

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-2">
        {([[30, 'Últimos 30 días'], [90, 'Últimos 90 días'], [0, 'Todo']] as const).map(([d, l]) => (
          <button key={d} onClick={() => setDays(d)}
            className={`h-8 px-3 rounded-md text-xs font-medium border ${days === d ? 'bg-zinc-900 text-white border-zinc-900 dark:bg-white dark:text-zinc-900' : 'border-gray-200 dark:border-zinc-700'}`}>{l}</button>
        ))}
        <span className="text-xs text-gray-500 ml-auto">{stats.exchanges} cambios · {stats.units} prendas (sin contar cancelados)</span>
      </div>

      {stats.units === 0 ? <p className="text-sm text-gray-500">Todavía no hay cambios en este período.</p> : (
        <div className="grid sm:grid-cols-2 gap-3">
          <section className={card + ' p-4'}><h3 className="text-sm font-semibold mb-3">Por motivo</h3><Bars data={stats.byReason} total={stats.units} /></section>
          <section className={card + ' p-4'}><h3 className="text-sm font-semibold mb-3">Hacia dónde cambian el talle</h3><Bars data={stats.byDirection} total={stats.units} /></section>
          <section className={card + ' p-4'}><h3 className="text-sm font-semibold mb-3">Por modelo</h3><Bars data={stats.byModel} total={stats.units} /></section>
          <section className={card + ' p-4'}><h3 className="text-sm font-semibold mb-3">Modelo y talle que más se devuelve</h3><Bars data={stats.bySize} total={stats.units} /></section>
          <section className={card + ' p-4'}><h3 className="text-sm font-semibold mb-3">Cambios de talle más frecuentes</h3><Bars data={stats.moves} total={stats.units} /></section>
          <section className={card + ' p-4'}><h3 className="text-sm font-semibold mb-3">Cambios a otro modelo</h3><Bars data={stats.modelSwitch} total={stats.units} /></section>
        </div>
      )}
      <p className="text-xs text-gray-500">Si un modelo y talle aparece mucho como &quot;me quedó chica&quot;, conviene revisar la guía de talles de ese modelo o producir más del talle siguiente.</p>
    </div>
  )
}
