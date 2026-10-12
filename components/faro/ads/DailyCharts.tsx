'use client'

import { useState } from 'react'
import { money, int } from '@/lib/faro/format'

export interface DayPoint { date: string; spend: number; purchases: number; value: number }

const short = (d: string) => `${Number(d.slice(8))}/${Number(d.slice(5, 7))}`
const compact = (v: number) => (v >= 1e6 ? `$${(v / 1e6).toLocaleString('es-AR', { maximumFractionDigits: 1 })}M` : v >= 1e3 ? `$${Math.round(v / 1e3)}k` : `$${Math.round(v)}`)
function niceMax(v: number) {
  if (v <= 0) return 1
  const p = 10 ** Math.floor(Math.log10(v))
  const n = v / p
  return (n <= 1 ? 1 : n <= 2 ? 2 : n <= 5 ? 5 : 10) * p
}

const W = 600
const PAD = { l: 44, r: 8, t: 10, b: 22 }

/** Un gráfico, una medida, un eje. Tooltip al pasar el mouse o tocar. */
function Chart({ title, days, kind, value, fmt, refLine, refLabel, height }: {
  title: string; days: DayPoint[]; kind: 'bar' | 'line'; value: (d: DayPoint) => number | null; fmt: (v: number) => string
  refLine?: number | null; refLabel?: string; height: number
}) {
  const [hover, setHover] = useState<number | null>(null)
  const vals = days.map(value)
  const max = niceMax(Math.max(refLine || 0, ...vals.map((v) => v ?? 0)) * 1.08)
  const innerW = W - PAD.l - PAD.r, innerH = height - PAD.t - PAD.b
  const x = (i: number) => PAD.l + (days.length <= 1 ? innerW / 2 : (i + 0.5) * (innerW / days.length))
  const y = (v: number) => PAD.t + innerH - (v / max) * innerH
  const band = innerW / Math.max(1, days.length)
  const ticks = [0, max / 2, max]
  const labelEvery = Math.ceil(days.length / 7)
  // Tramos de línea sin cortar en días sin dato
  const segs: string[] = []
  let cur = ''
  vals.forEach((v, i) => { if (v == null) { if (cur) segs.push(cur); cur = '' } else cur += `${cur ? 'L' : 'M'}${x(i)},${y(v)}` })
  if (cur) segs.push(cur)
  const h = hover != null ? days[hover] : null
  const hv = hover != null ? vals[hover] : null

  return (
    <figure className="min-w-0">
      <figcaption className="flex items-baseline justify-between gap-2 text-[12.5px] text-mute mb-1">
        <span className="text-ink font-medium">{title}</span>
        {refLine != null && refLabel && <span className="flex items-center gap-1.5"><span className="inline-block w-4 border-t-2 border-dashed border-[rgb(var(--f-bad))]" />{refLabel} {fmt(refLine)}</span>}
      </figcaption>
      <div className="relative">
        <svg viewBox={`0 0 ${W} ${height}`} className="w-full" style={{ height }} role="img" aria-label={title}
          onMouseLeave={() => setHover(null)}>
          {ticks.map((t) => (
            <g key={t}>
              <line x1={PAD.l} x2={W - PAD.r} y1={y(t)} y2={y(t)} className="stroke-[rgb(var(--f-line))]" strokeWidth={1} />
              <text x={PAD.l - 6} y={y(t) + 4} textAnchor="end" className="fill-[rgb(var(--f-faint))] text-[11px]">{compact(t)}</text>
            </g>
          ))}
          {days.map((d, i) => (i % labelEvery === 0 || i === days.length - 1) && (
            <text key={d.date} x={x(i)} y={height - 6} textAnchor="middle" className="fill-[rgb(var(--f-faint))] text-[11px]">{short(d.date)}</text>
          ))}
          {kind === 'bar' && vals.map((v, i) => v != null && v > 0 && (
            <rect key={i} x={x(i) - Math.min(18, band * 0.62) / 2} width={Math.min(18, band * 0.62)} y={y(v)} height={Math.max(1, PAD.t + innerH - y(v))} rx={3}
              className={hover === i ? 'fill-[rgb(var(--f-ink)/0.7)]' : 'fill-[rgb(var(--f-ink)/0.35)]'} />
          ))}
          {kind === 'line' && <>
            {segs.map((p, i) => <path key={i} d={p} fill="none" className="stroke-[rgb(var(--f-ink))]" strokeWidth={2} strokeLinejoin="round" />)}
            {vals.map((v, i) => v != null && <circle key={i} cx={x(i)} cy={y(v)} r={hover === i ? 5 : 3.5}
              className={refLine != null && v > refLine ? 'fill-[rgb(var(--f-bad))] stroke-[rgb(var(--f-surface))]' : 'fill-[rgb(var(--f-ink))] stroke-[rgb(var(--f-surface))]'} strokeWidth={2} />)}
          </>}
          {refLine != null && <line x1={PAD.l} x2={W - PAD.r} y1={y(refLine)} y2={y(refLine)} className="stroke-[rgb(var(--f-bad))]" strokeDasharray="5 4" strokeWidth={1.5} />}
          {hover != null && <line x1={x(hover)} x2={x(hover)} y1={PAD.t} y2={PAD.t + innerH} className="stroke-[rgb(var(--f-mute))]" strokeWidth={1} />}
          {days.map((_, i) => (
            <rect key={`h${i}`} x={x(i) - band / 2} width={band} y={0} height={height} fill="transparent"
              onMouseEnter={() => setHover(i)} onTouchStart={() => setHover(i)} />
          ))}
        </svg>
        {h && (
          <div className="pointer-events-none absolute top-0 z-10 rounded-lg border border-line bg-surface px-2.5 py-1.5 text-[12px] shadow-lg"
            style={{ left: `${Math.min(70, Math.max(0, (x(hover!) / W) * 100 - 15))}%` }}>
            <p className="text-mute">{short(h.date)}</p>
            <p className="num text-ink font-medium">{hv != null ? fmt(hv) : 'sin compras'}</p>
            <p className="num text-mute">{money(h.spend)} · {int(h.purchases)} compras</p>
          </div>
        )}
      </div>
    </figure>
  )
}

/**
 * Dos gráficos chicos, cada uno con su eje: cuánto se invirtió por día y cuánto costó cada compra
 * contra el máximo rentable. Reemplaza el gráfico combinado anterior (dos medidas en un mismo eje).
 */
export default function DailyCharts({ days, maxCpa, height = 150, stacked = false }: { days: DayPoint[]; maxCpa: number | null; height?: number; stacked?: boolean }) {
  if (!days.length) return <p className="py-6 text-center text-[13px] text-faint">Sin datos diarios en este período</p>
  const over = maxCpa ? days.filter((d) => d.purchases > 0 && d.spend / d.purchases > maxCpa).length : 0
  const noSales = days.filter((d) => d.spend > 0 && d.purchases === 0).length
  return (
    <div className="flex flex-col gap-2">
      <div className={`grid gap-5 ${stacked ? '' : 'md:grid-cols-2'}`}>
        <Chart title="Inversión por día" days={days} kind="bar" value={(d) => d.spend} fmt={(v) => money(v)} height={height} />
        <Chart title="Costo por compra por día" days={days} kind="line" value={(d) => (d.purchases > 0 ? d.spend / d.purchases : null)} fmt={(v) => money(v)}
          refLine={maxCpa} refLabel="máximo rentable" height={height} />
      </div>
      {(over > 0 || noSales > 0) && (
        <p className="text-[12.5px] text-mute">
          {over > 0 && <>{over} {over === 1 ? 'día' : 'días'} con el costo por compra sobre el máximo. </>}
          {noSales > 0 && <>{noSales} {noSales === 1 ? 'día' : 'días'} con inversión y sin compras.</>}
        </p>
      )}
    </div>
  )
}
