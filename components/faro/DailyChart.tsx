'use client'

import { ResponsiveContainer, ComposedChart, Bar, Line, XAxis, YAxis, CartesianGrid, Tooltip, ReferenceLine } from 'recharts'
import type { DayPoint } from '@/lib/faro/metrics'
import { money, moneyAxis } from '@/lib/faro/format'

const INK = 'rgb(var(--f-ink))'
const MUTE = 'rgb(var(--f-mute))'
const LINE = 'rgb(var(--f-line))'

function Tip({ active, payload }: { active?: boolean; payload?: { payload: DayPoint }[] }) {
  if (!active || !payload?.length) return null
  const p = payload[0].payload
  const [y, m, d] = p.date.split('-')
  return (
    <div className="rounded-lg border border-line bg-surface px-3 py-2 text-[12.5px] shadow-lg">
      <p className="font-semibold text-ink mb-1">{`${d}/${m}/${y}`}</p>
      <p className="text-mute">Ventas netas <span className="num text-ink">{money(p.netSales)}</span> · {p.orders} órdenes</p>
      <p className="text-mute">Inversión <span className="num text-ink">{money(p.spend)}</span></p>
      <p className="text-mute">Ganancia después de publicidad <span className={`num ${p.profit < 0 ? 'text-bad' : 'text-good'}`}>{money(p.profit)}</span></p>
    </div>
  )
}

export default function DailyChart({ data }: { data: DayPoint[] }) {
  const tick = (v: string) => { const [, m, d] = v.split('-'); return `${Number(d)}/${Number(m)}` }
  return (
    <div className="h-[260px] -ml-2">
      <ResponsiveContainer width="100%" height="100%">
        <ComposedChart data={data} margin={{ top: 8, right: 8, bottom: 0, left: 0 }} barCategoryGap="22%">
          <CartesianGrid vertical={false} stroke={LINE} />
          <XAxis dataKey="date" tickFormatter={tick} tick={{ fontSize: 12, fill: MUTE }} axisLine={false} tickLine={false} minTickGap={12} />
          <YAxis tickFormatter={moneyAxis} tick={{ fontSize: 12, fill: MUTE }} axisLine={false} tickLine={false} width={72} />
          <Tooltip content={<Tip />} cursor={{ fill: 'rgb(var(--f-ink) / 0.05)' }} />
          <ReferenceLine y={0} stroke={MUTE} />
          <Bar dataKey="netSales" name="Ventas netas" fill="rgb(var(--f-ink) / 0.16)" radius={[4, 4, 0, 0]} />
          <Line dataKey="spend" name="Inversión" stroke={MUTE} strokeWidth={1.5} strokeDasharray="4 3" dot={false} />
          <Line dataKey="profit" name="Ganancia" stroke="rgb(var(--f-beacon))" strokeWidth={2.25} dot={false} />
        </ComposedChart>
      </ResponsiveContainer>
      <div className="flex flex-wrap gap-4 pl-2 mt-1 text-[12.5px] text-mute">
        <span className="flex items-center gap-1.5"><span className="w-3 h-3 rounded-sm" style={{ background: 'rgb(var(--f-ink) / 0.16)' }} />Ventas netas</span>
        <span className="flex items-center gap-1.5"><span className="w-4 border-t-2 border-dashed" style={{ borderColor: MUTE }} />Inversión en anuncios</span>
        <span className="flex items-center gap-1.5"><span className="w-4 border-t-2" style={{ borderColor: 'rgb(var(--f-beacon))' }} />Ganancia después de publicidad</span>
      </div>
    </div>
  )
}
