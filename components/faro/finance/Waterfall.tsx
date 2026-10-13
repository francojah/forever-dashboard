import { money } from '@/lib/faro/format'
import type { PnL } from '@/lib/faro/pnl'

/** Cascada de la ganancia: de la facturación al resultado, un escalón por cada costo. SVG puro, legible en claro y oscuro. */
export default function Waterfall({ p, currency = 'ARS' }: { p: PnL; currency?: string }) {
  const s = p.sales
  const steps: { label: string; v: number; kind: 'total' | 'cost' | 'income' }[] = [
    { label: 'Facturación', v: s.netSales + s.shippingCustomer, kind: 'total' },
    { label: 'Mercadería', v: -s.cogs, kind: 'cost' },
    { label: 'Envíos', v: -s.shippingOwner, kind: 'cost' },
    { label: 'Comisiones', v: -(s.platformFee + s.paymentFees), kind: 'cost' },
    { label: 'Packaging e IIBB', v: -(s.packaging + s.iibb), kind: 'cost' },
    { label: 'Publicidad', v: -(p.ads.spend + p.adTax), kind: 'cost' },
    { label: 'Fijos y del mes', v: -(p.fixedTotal + p.extraTotal), kind: 'cost' },
    { label: 'Resultado', v: p.operatingResult, kind: 'total' },
  ]
  const W = 760, H = 240, padL = 8, padB = 44, top = 18
  const n = steps.length, slot = (W - padL * 2) / n, bw = slot * 0.62
  let run = 0
  const bars = steps.map((st, i) => {
    const start = st.kind === 'total' ? 0 : run
    const end = st.kind === 'total' ? st.v : run + st.v
    if (st.kind !== 'total') run = end
    else run = st.v
    return { ...st, i, y0: start, y1: end }
  })
  const maxV = Math.max(...bars.map((b) => Math.max(b.y0, b.y1)), 1)
  const minV = Math.min(...bars.map((b) => Math.min(b.y0, b.y1)), 0)
  const scale = (H - top - padB) / (maxV - minV || 1)
  const y = (v: number) => top + (maxV - v) * scale
  const fmt = (v: number) => money(v, { currency })
  return (
    <figure className="w-full">
      <svg viewBox={`0 0 ${W} ${H}`} className="w-full h-auto" role="img" aria-label="Cascada de la facturación al resultado">
        <line x1={padL} x2={W - padL} y1={y(0)} y2={y(0)} stroke="rgb(var(--f-mute))" strokeWidth="1" />
        {bars.map((b) => {
          const x = padL + b.i * slot + (slot - bw) / 2
          const yTop = y(Math.max(b.y0, b.y1)), h = Math.max(1.5, Math.abs(b.y1 - b.y0) * scale)
          const fill = b.kind === 'total' ? (b.v < 0 ? 'rgb(var(--f-bad))' : 'rgb(var(--f-ink))') : 'rgb(var(--f-bad) / 0.55)'
          const prev = bars[b.i - 1]
          return (
            <g key={b.label}>
              {prev && b.kind !== 'total' && <line x1={padL + prev.i * slot + (slot + bw) / 2} x2={x} y1={y(b.y0)} y2={y(b.y0)} stroke="rgb(var(--f-line))" strokeDasharray="3 3" />}
              <rect x={x} y={yTop} width={bw} height={h} rx="3" fill={fill} />
              <text x={x + bw / 2} y={yTop - 5} textAnchor="middle" fontSize="11" fill="rgb(var(--f-ink))" className="num">{b.kind === 'total' ? fmt(b.v) : `−${fmt(Math.abs(b.v)).replace(/^[−-]/, '')}`}</text>
              <text x={x + bw / 2} y={H - padB + 16} textAnchor="middle" fontSize="11" fill="rgb(var(--f-mute))">{b.label}</text>
              {s.netSales > 0 && b.kind !== 'total' && <text x={x + bw / 2} y={H - padB + 30} textAnchor="middle" fontSize="10.5" fill="rgb(var(--f-faint))" className="num">{Math.round((Math.abs(b.v) / s.netSales) * 100)}%</text>}
            </g>
          )
        })}
      </svg>
      <figcaption className="text-[12.5px] text-mute mt-1">Porcentajes sobre ventas netas de productos. Los fijos se cuentan completos aunque el mes no haya terminado.</figcaption>
    </figure>
  )
}
