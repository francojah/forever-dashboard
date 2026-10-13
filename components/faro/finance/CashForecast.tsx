import Link from 'next/link'
import { Panel } from '../ui'
import { money, int } from '@/lib/faro/format'
import type { CashWeek } from '@/lib/faro/insights'

const dd = (d: string) => `${d.slice(8, 10)}/${d.slice(5, 7)}`

/** Cuánta plata entra cada semana, según los días de acreditación de cada medio de pago. */
export default function CashForecast({ weeks, configured, fixedMonthly }: { weeks: CashWeek[]; configured: boolean; fixedMonthly: number }) {
  const max = Math.max(1, ...weeks.map((w) => w.amount))
  const total = weeks.reduce((a, w) => a + w.amount, 0)
  const weeklyFixed = fixedMonthly / 4.33
  return (
    <Panel title="Caja proyectada" description="Lo ya vendido que todavía no se acreditó, semana por semana, descontando comisiones. Sirve para saber cuándo pagar proveedores.">
      {!configured && <p className="mb-3 rounded-lg border border-warn/40 bg-warn/5 px-3 py-2 text-[13px] text-ink">Para que sea real, cargá los días de acreditación de cada medio de pago en <Link href="/ajustes?tab=costos" className="underline">Costos y comisiones</Link>. Mientras tanto se asume que todo se acredita el mismo día.</p>}
      {weeks.length === 0 ? <p className="text-[13.5px] text-mute">No hay cobros pendientes de acreditar.</p> : (
        <>
          <p className="text-[13.5px] text-mute mb-3">Por acreditar: <span className="num text-ink font-medium">{money(total)}</span>{fixedMonthly > 0 ? ` · tus fijos son ${money(weeklyFixed)} por semana (línea punteada)` : ''}</p>
          <ul className="flex flex-col gap-2">
            {weeks.map((w) => (
              <li key={w.week} className="text-[13.5px]">
                <div className="flex items-baseline justify-between gap-3"><span className="text-ink">Semana del {dd(w.week)}</span><span className="num text-mute">{money(w.amount)} · {int(w.orders)} órdenes</span></div>
                <div className="relative mt-1 h-2 rounded-full bg-sunken">
                  <div className={`h-full rounded-full ${fixedMonthly > 0 && w.amount < weeklyFixed ? 'bg-warn' : 'bg-ink/40'}`} style={{ width: `${(w.amount / max) * 100}%` }} />
                  {fixedMonthly > 0 && weeklyFixed <= max && <div className="absolute -top-0.5 h-3 w-0.5 bg-ink/60" style={{ left: `${(weeklyFixed / max) * 100}%` }} aria-hidden />}
                </div>
              </li>
            ))}
          </ul>
        </>
      )}
    </Panel>
  )
}
