'use client'

import { ResponsiveContainer, ComposedChart, Bar, Line, XAxis, YAxis, CartesianGrid, Tooltip, Cell, ReferenceLine } from 'recharts'
import { money, moneyAxis } from '@/lib/faro/format'
import { monthLabel } from '@/lib/faro/dates'

interface P { month: string; result: number; net: number; closed: boolean }
const SHORT = ['Ene', 'Feb', 'Mar', 'Abr', 'May', 'Jun', 'Jul', 'Ago', 'Sep', 'Oct', 'Nov', 'Dic']

export default function ResultChart({ data, selected }: { data: P[]; selected: string }) {
  return (
    <div className="h-[220px] -ml-2">
      <ResponsiveContainer width="100%" height="100%">
        <ComposedChart data={data} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
          <CartesianGrid vertical={false} stroke="rgb(var(--f-line))" />
          <XAxis dataKey="month" tickFormatter={(m: string) => SHORT[Number(m.slice(5)) - 1]} tick={{ fontSize: 12, fill: 'rgb(var(--f-mute))' }} axisLine={false} tickLine={false} />
          <YAxis tickFormatter={moneyAxis} tick={{ fontSize: 12, fill: 'rgb(var(--f-mute))' }} axisLine={false} tickLine={false} width={70} />
          <ReferenceLine y={0} stroke="rgb(var(--f-mute))" />
          <Tooltip
            cursor={{ fill: 'rgb(var(--f-ink) / 0.05)' }}
            content={({ active, payload }) => {
              if (!active || !payload?.length) return null
              const p = payload[0].payload as P
              return (
                <div className="rounded-lg border border-line bg-surface px-3 py-2 text-[12.5px] shadow-lg">
                  <p className="font-semibold text-ink">{monthLabel(p.month)}{p.closed ? ' · cerrado' : ''}</p>
                  <p className="text-mute">Resultado <span className={`num ${p.result < 0 ? 'text-bad' : 'text-ink'}`}>{money(p.result)}</span></p>
                  <p className="text-mute">Ventas netas <span className="num text-ink">{money(p.net)}</span></p>
                </div>
              )
            }}
          />
          <Bar dataKey="result" radius={[3, 3, 0, 0]}>
            {data.map((d) => (
              <Cell key={d.month} fill={d.result < 0 ? 'rgb(var(--f-bad) / 0.75)' : d.month === selected ? 'rgb(var(--f-beacon))' : 'rgb(var(--f-ink) / 0.3)'} />
            ))}
          </Bar>
          <Line dataKey="net" stroke="rgb(var(--f-mute))" strokeWidth={1.5} dot={false} strokeDasharray="4 3" />
        </ComposedChart>
      </ResponsiveContainer>
    </div>
  )
}
