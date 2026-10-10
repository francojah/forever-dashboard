'use client'

import { useMemo, useState } from 'react'
import { Panel, Explain } from '../ui'
import { money, int, pct, ratio } from '@/lib/faro/format'

export interface BreakEvenBase {
  fixedMonthly: number
  fixedItems: { name: string; amount: number }[]
  aov: number | null
  contributionPct: number | null
  adSpend: number
  netSales30: number
  orders30: number
  adTaxPct: number
}

function Field({ label, value, onChange, suffix, hint, step = 1000 }: { label: string; value: number; onChange: (v: number) => void; suffix?: string; hint?: React.ReactNode; step?: number }) {
  return (
    <label className="flex flex-col gap-1 text-[13.5px]">
      <span className="text-mute">{label}</span>
      <span className="flex items-center gap-2">
        <input type="number" inputMode="decimal" step={step} value={Number.isFinite(value) ? value : 0} onChange={(e) => onChange(Number(e.target.value) || 0)} className="w-full rounded-lg border border-line bg-surface px-3 py-2 num text-right" />
        {suffix && <span className="text-mute w-6">{suffix}</span>}
      </span>
      {hint && <span className="text-[12px] text-faint">{hint}</span>}
    </label>
  )
}

/**
 * Punto de equilibrio: cuánto hay que vender por mes para cubrir fijos y publicidad,
 * con los números reales de los últimos 30 días como punto de partida.
 */
export default function BreakEven({ base }: { base: BreakEvenBase }) {
  const [fixed, setFixed] = useState(Math.round(base.fixedMonthly))
  const [ticket, setTicket] = useState(Math.round(base.aov || 0))
  const [margin, setMargin] = useState(Math.round((base.contributionPct || 0) * 1000) / 10)
  const [ads, setAds] = useState(Math.round(base.adSpend))
  const [target, setTarget] = useState(0)

  const r = useMemo(() => {
    const m = margin / 100
    if (m <= 0 || ticket <= 0) return null
    const need = (fixed + ads + target) / m
    const orders = need / ticket
    const noAds = (fixed + target) / m
    const perOrder = ticket * m
    return {
      need, orders, perDay: orders / 30, noAds,
      mer: ads > 0 ? need / ads : null,
      maxCpa: orders > 0 ? ads / orders : null,
      perOrder,
      gap: base.netSales30 - need,
      ticketUp: (fixed + ads + target) / m / (ticket * 1.1),
      marginUp: (fixed + ads + target) / (m + 0.05) / ticket,
    }
  }, [fixed, ticket, margin, ads, target, base.netSales30])

  return (
    <div className="grid lg:grid-cols-[360px_1fr] gap-5 items-start">
      <Panel title="Supuestos" description="Arranca con tus últimos 30 días. Cambiá cualquier número para simular.">
        <div className="flex flex-col gap-4">
          <Field label="Costos fijos por mes" value={fixed} onChange={setFixed} hint={base.fixedItems.length ? `${base.fixedItems.length} cargados en Finanzas → Costos fijos` : 'Cargalos en Finanzas → Costos fijos'} />
          <Field label="Ticket promedio (sin envío)" value={ticket} onChange={setTicket} hint={`${int(base.orders30)} órdenes en 30 días`} />
          <Field label="Margen de contribución" value={margin} onChange={setMargin} suffix="%" step={0.5} hint="Lo que queda de cada venta después de mercadería, envío, comisiones y packaging" />
          <Field label="Inversión en publicidad por mes" value={ads} onChange={setAds} hint={base.adTaxPct > 0 ? `Incluye ${base.adTaxPct}% de impuestos no recuperables` : undefined} />
          <Field label="Ganancia que querés por mes" value={target} onChange={setTarget} hint="Dejalo en 0 para ver el equilibrio puro" />
        </div>
      </Panel>

      {!r ? (
        <Panel><p className="text-mute text-[14px]">Cargá un ticket y un margen mayores a cero.</p></Panel>
      ) : (
        <div className="flex flex-col gap-5">
          <div className="rounded-panel border border-line bg-surface p-5">
            <p className="text-[13px] text-mute">Ventas netas necesarias por mes {target > 0 ? 'para ganar lo que querés' : 'para no perder plata'}</p>
            <p className="num mt-2 text-[34px] font-semibold leading-none text-ink">{money(r.need)}</p>
            <p className="mt-2 text-[13.5px] text-mute"><span className="num text-ink">{int(Math.ceil(r.orders))}</span> órdenes por mes · <span className="num text-ink">{r.perDay.toLocaleString('es-AR', { maximumFractionDigits: 1 })}</span> por día</p>
            <p className={`mt-3 text-[14px] ${r.gap >= 0 ? 'text-good' : 'text-bad'}`}>
              Últimos 30 días: {money(base.netSales30)} → {r.gap >= 0 ? `superás el objetivo por ${money(r.gap)}` : `te faltan ${money(-r.gap)} (${int(Math.ceil(-r.gap / ticket))} órdenes)`}.
            </p>
          </div>

          <div className="grid grid-cols-2 lg:grid-cols-4 rounded-panel border border-line bg-surface">
            {[
              { l: 'Sin publicidad', v: money(r.noAds), s: 'ventas para cubrir fijos', e: 'Costos fijos (+ ganancia objetivo) ÷ margen de contribución.' },
              { l: 'MER mínimo', v: ratio(r.mer), s: 'ventas ÷ inversión en anuncios', e: 'Con esta inversión, cada peso en anuncios tiene que traer al menos esto en ventas netas (orgánicas incluidas).' },
              { l: 'Costo por compra máximo', v: money(r.maxCpa), s: 'para llegar al equilibrio', e: 'Inversión en anuncios ÷ órdenes necesarias. Si cada compra cuesta más, no alcanza con este presupuesto.' },
              { l: 'Ganancia por orden', v: money(r.perOrder), s: 'antes de publicidad y fijos', e: 'Ticket × margen de contribución.' },
            ].map((k, i) => (
              <div key={k.l} className={`p-4 ${i % 2 === 1 ? 'border-l border-line' : ''} ${i >= 2 ? 'border-t lg:border-t-0 border-line' : ''} ${i === 2 ? 'lg:border-l' : ''}`}>
                <p className="text-[13px] text-mute flex items-center gap-1.5">{k.l}<Explain>{k.e}</Explain></p>
                <p className="num mt-2 text-[22px] font-semibold leading-none text-ink">{k.v}</p>
                <p className="mt-2 text-[12.5px] text-mute">{k.s}</p>
              </div>
            ))}
          </div>

          <Panel title="Qué mueve la aguja">
            <ul className="flex flex-col gap-2 text-[13.5px]">
              <li>Subir el ticket 10% ({money(ticket * 1.1)}): necesitás <span className="num text-ink">{int(Math.ceil(r.ticketUp))}</span> órdenes en vez de {int(Math.ceil(r.orders))}.</li>
              <li>Mejorar el margen 5 puntos ({pct(margin / 100 + 0.05, 1)}): necesitás <span className="num text-ink">{int(Math.ceil(r.marginUp))}</span> órdenes.</li>
              <li>Cada {money(100000)} más de publicidad pide {money(100000 / (margin / 100))} más de ventas netas para no perder.</li>
            </ul>
          </Panel>
        </div>
      )}
    </div>
  )
}
