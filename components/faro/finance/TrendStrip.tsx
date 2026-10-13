import { money, pct, int } from '@/lib/faro/format'
import type { PnL } from '@/lib/faro/pnl'

/** Tendencia de 12 meses de los indicadores clave, con el mismo mes del año anterior al lado. */
export default function TrendStrip({ months, selected, currency = 'ARS' }: { months: PnL[]; selected: string; currency?: string }) {
  const last12 = months.slice(-12)
  const sel = months.find((m) => m.month === selected)
  const yearAgo = sel ? months.find((m) => m.month === `${Number(selected.slice(0, 4)) - 1}${selected.slice(4)}`) : undefined
  const series: { key: string; label: string; v: (p: PnL) => number | null; fmt: (v: number | null) => string; better: 'up' | 'down' }[] = [
    { key: 'net', label: 'Ventas netas', v: (p) => p.sales.netSales, fmt: (v) => money(v, { currency }), better: 'up' },
    { key: 'orders', label: 'Órdenes', v: (p) => p.sales.orders, fmt: (v) => int(v ?? 0), better: 'up' },
    { key: 'cm', label: 'Margen de contribución', v: (p) => (p.sales.netSales ? p.contribution / p.sales.netSales : null), fmt: (v) => pct(v, 1), better: 'up' },
    { key: 'cpa', label: 'Costo por compra', v: (p) => (p.ads.purchases ? p.ads.spend / p.ads.purchases : null), fmt: (v) => money(v, { currency }), better: 'down' },
    { key: 'res', label: 'Resultado operativo', v: (p) => p.operatingResult, fmt: (v) => money(v, { currency }), better: 'up' },
  ]
  return (
    <div className="grid gap-3 sm:grid-cols-3 lg:grid-cols-5">
      {series.map((s) => {
        const vals = last12.map((p) => s.v(p))
        const nums = vals.filter((v): v is number => v != null && isFinite(v))
        const min = Math.min(0, ...nums), max = Math.max(...nums, 1)
        const W = 160, H = 40
        const pts = vals.map((v, i) => (v == null ? null : [8 + (i / Math.max(1, vals.length - 1)) * (W - 16), H - 4 - ((v - min) / (max - min || 1)) * (H - 8)] as const))
        const d = pts.map((p, i) => (p ? `${i === 0 || !pts[i - 1] ? 'M' : 'L'}${p[0].toFixed(1)},${p[1].toFixed(1)}` : '')).join(' ')
        const cur = sel ? s.v(sel) : null, ago = yearAgo ? s.v(yearAgo) : null
        const ch = cur != null && ago != null && ago !== 0 ? (cur - ago) / Math.abs(ago) : null
        const good = ch == null ? null : s.better === 'up' ? ch >= 0 : ch <= 0
        const selIdx = last12.findIndex((p) => p.month === selected)
        return (
          <div key={s.key} className="rounded-panel border border-line bg-surface p-3">
            <p className="text-[12.5px] text-mute">{s.label}</p>
            <p className="num text-[18px] font-semibold text-ink leading-tight mt-0.5">{s.fmt(cur)}</p>
            <svg viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="none" className="w-full h-10 mt-1" aria-hidden>
              <path d={d} fill="none" stroke="rgb(var(--f-ink) / 0.6)" strokeWidth="1.5" />
              {selIdx >= 0 && pts[selIdx] && <circle cx={pts[selIdx]![0]} cy={pts[selIdx]![1]} r="3" fill="rgb(var(--f-beacon))" />}
            </svg>
            <p className={`text-[12px] num ${good == null ? 'text-faint' : good ? 'text-good' : 'text-bad'}`}>
              {ch == null ? 'sin el año anterior' : `${ch >= 0 ? '+' : '−'}${Math.abs(Math.round(ch * 100))}% vs mismo mes ${Number(selected.slice(0, 4)) - 1}`}
            </p>
          </div>
        )
      })}
    </div>
  )
}
