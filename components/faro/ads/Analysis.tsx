'use client'

import { useState } from 'react'
import Link from 'next/link'
import { Panel, Empty } from '../ui'
import { money, int } from '@/lib/faro/format'
import { simulate, type Saturation } from '@/lib/faro/insights'

/** Curva de saturación: gasto diario contra costo por compra, con los 6 niveles de gasto promediados. */
export function SaturationChart({ sat, maxCpa }: { sat: Saturation; maxCpa: number | null }) {
  if (!sat.bins.length) return <Empty title="Faltan días con gasto y compras (mínimo 8)" />
  const W = 720, H = 260, L = 64, B = 36, T = 14, R = 16
  const xs = sat.points.map((p) => p.spend), ys = sat.points.map((p) => p.cpa)
  const xMin = Math.min(...xs) * 0.92, xMax = Math.max(...xs) * 1.04, yMax = Math.max(...ys, maxCpa || 0) * 1.1
  const X = (v: number) => L + ((v - xMin) / (xMax - xMin)) * (W - L - R), Y = (v: number) => T + (1 - v / yMax) * (H - T - B)
  const ticks = (max: number, n = 4, min = 0) => Array.from({ length: n + 1 }, (_, i) => min + ((max - min) / n) * i)
  const line = sat.bins.map((b, i) => `${i ? 'L' : 'M'}${X(b.spend).toFixed(1)},${Y(b.cpa).toFixed(1)}`).join(' ')
  const short = (v: number) => (v >= 1e6 ? `${(v / 1e6).toFixed(1)}M` : v >= 1e3 ? `${Math.round(v / 1e3)}k` : String(Math.round(v)))
  return (
    <figure>
      <svg viewBox={`0 0 ${W} ${H}`} className="w-full h-auto" role="img" aria-label="Costo por compra según el gasto diario">
        {ticks(yMax).map((t) => <g key={`y${t}`}><line x1={L} x2={W - R} y1={Y(t)} y2={Y(t)} stroke="rgb(var(--f-line))" /><text x={L - 6} y={Y(t) + 4} textAnchor="end" fontSize="11" fill="rgb(var(--f-mute))">$ {short(t)}</text></g>)}
        {ticks(xMax, 4, xMin).map((t) => <text key={`x${t}`} x={X(t)} y={H - B + 16} textAnchor="middle" fontSize="11" fill="rgb(var(--f-mute))">$ {short(t)}</text>)}
        <text x={(L + W - R) / 2} y={H - 4} textAnchor="middle" fontSize="11" fill="rgb(var(--f-faint))">gasto por día</text>
        {maxCpa != null && <g><line x1={L} x2={W - R} y1={Y(maxCpa)} y2={Y(maxCpa)} stroke="rgb(var(--f-bad))" strokeDasharray="5 4" /><text x={W - R} y={Y(maxCpa) - 4} textAnchor="end" fontSize="11" fill="rgb(var(--f-bad))">máximo rentable {money(maxCpa)}</text></g>}
        {sat.points.map((p, i) => <circle key={i} cx={X(p.spend)} cy={Y(p.cpa)} r="3" fill="rgb(var(--f-ink) / 0.25)" />)}
        <path d={line} fill="none" stroke="rgb(var(--f-beacon))" strokeWidth="2.5" />
        {sat.bins.map((b, i) => <circle key={`b${i}`} cx={X(b.spend)} cy={Y(b.cpa)} r="5" fill="rgb(var(--f-beacon))" stroke="rgb(var(--f-surface))" strokeWidth="2"><title>{`Gastando ~${money(b.spend)}/día: costo por compra ${money(b.cpa)} (${b.n} días)`}</title></circle>)}
        {sat.knee != null && <g><line x1={X(sat.knee)} x2={X(sat.knee)} y1={T} y2={H - B} stroke="rgb(var(--f-warn))" strokeDasharray="3 3" /><text x={X(sat.knee) + 4} y={T + 12} fontSize="11" fill="rgb(var(--f-warn))">acá empieza a encarecerse</text></g>}
      </svg>
      <figcaption className="text-[12.5px] text-mute mt-1">
        Puntos grises: cada día de los últimos 90. Línea: promedio por nivel de gasto.
        {sat.knee != null ? ` Hasta unos ${money(sat.knee)} por día el costo por compra se mantiene; más arriba sube.` : ' El costo por compra no se dispara en el rango que probaste: hay espacio para subir.'}
        {sat.maxUseful != null && maxCpa != null ? ` El mayor nivel de gasto que sigue debajo de tu máximo rentable es ~${money(sat.maxUseful)} por día.` : ''}
      </figcaption>
    </figure>
  )
}

/** Simulador: qué pasa con compras y ganancia si cambio el gasto diario. */
export function Simulator({ sat, current, contributionPerOrder, adTaxPct }: { sat: Saturation; current: { spend: number; purchases: number }; contributionPerOrder: number | null; adTaxPct: number }) {
  const [pct, setPct] = useState(20)
  if (!sat.bins.length || contributionPerOrder == null) return <Empty title="Necesita la curva de saturación y tu margen por orden" />
  const r = simulate(sat.bins, current, pct, contributionPerOrder, adTaxPct)
  if (!r) return <Empty title="Sin gasto reciente para simular" />
  const sign = (v: number) => (v >= 0 ? '+' : '−')
  return (
    <div className="flex flex-col gap-4 text-[13.5px]">
      <label className="flex flex-col gap-2">
        <span className="flex justify-between"><span>Cambio del gasto diario</span><span className="num font-medium text-ink">{sign(pct)}{Math.abs(pct)}%</span></span>
        <input type="range" min={-50} max={100} step={5} value={pct} onChange={(e) => setPct(Number(e.target.value))} className="accent-[rgb(var(--f-beacon))]" />
      </label>
      <dl className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        {[
          ['Gasto por día', money(r.spend), `${sign(r.delta.spend)}${money(Math.abs(r.delta.spend))}`],
          ['Compras por día', r.purchases.toLocaleString('es-AR', { maximumFractionDigits: 1 }), `${sign(r.delta.purchases)}${Math.abs(r.delta.purchases).toLocaleString('es-AR', { maximumFractionDigits: 1 })}`],
          ['Costo por compra', money(r.cpa), ''],
          ['Ganancia por día', money(r.profit), `${sign(r.delta.profit)}${money(Math.abs(r.delta.profit))}`],
        ].map(([l, v, d]) => <div key={l} className="rounded-lg border border-line p-3"><dt className="text-mute text-[12.5px]">{l}</dt><dd className="num text-[18px] font-semibold text-ink leading-tight">{v}</dd>{d && <dd className={`num text-[12px] ${String(d).startsWith('−') ? 'text-bad' : 'text-good'}`}>{d}</dd>}</div>)}
      </dl>
      <p className="text-[12.5px] text-mute">Estimación a partir de cómo respondieron las compras a los distintos niveles de gasto en tus últimos 90 días, con tu margen actual de {money(contributionPerOrder)} por orden. Hoy: {money(current.spend)} por día y {current.purchases.toLocaleString('es-AR', { maximumFractionDigits: 1 })} compras por día. Un cambio mayor a 20% de una vez suele reiniciar el aprendizaje: mejor en dos pasos.</p>
    </div>
  )
}

export function ExperimentsLink({ count }: { count: number }) {
  return (
    <Panel title="Experimentos registrados" description="Anotá cada cambio que probás y Faro compara el antes y el después solo.">
      <p className="text-[13.5px] text-mute">{count ? `${int(count)} anotados.` : 'Todavía no anotaste ninguno.'} <Link href="/finanzas?tab=objetivos" className="underline text-ink">Ver y anotar en Objetivos y promos</Link>.</p>
    </Panel>
  )
}
