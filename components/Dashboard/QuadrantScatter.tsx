'use client'

import {
  ResponsiveContainer, ScatterChart, Scatter, XAxis, YAxis, ZAxis,
  CartesianGrid, Tooltip, ReferenceLine, Cell,
} from 'recharts'
import { LOCALE } from '@/lib/config'

/**
 * QuadrantScatter — Mapa CPA (x) vs ROAS (y) de cada ad set.
 * Tamaño del punto = gasto. Líneas de referencia = breakeven y ROAS mínimo.
 * Cuadrante ideal (abajo-derecha): CPA bajo + ROAS alto → escalar.
 */

interface Item {
  id?: string
  name: string
  cost_per_result: number | null
  roas: number | null
  spend: number | null
  status?: string
}

interface Props {
  items: Item[]
  breakeven?: number
  roasMin?: number
  className?: string
}

export default function QuadrantScatter({ items, breakeven = 30462, roasMin = 1.77, className }: Props) {
  const points = items
    .filter((a) => a.cost_per_result != null && a.roas != null && (a.spend || 0) > 0 && a.status === 'ACTIVE')
    .map((a) => ({
      x: a.cost_per_result as number,
      y: a.roas as number,
      z: a.spend as number,
      name: a.name,
      good: (a.cost_per_result as number) <= breakeven && (a.roas as number) >= roasMin,
    }))

  return (
    <div className={(className ?? '') + ' bg-white dark:bg-zinc-900 rounded-xl border border-gray-200 dark:border-zinc-800 p-5 shadow-sm'}>
      <div className="flex items-center justify-between mb-1">
        <h3 className="text-sm font-semibold text-gray-900 dark:text-zinc-100">Mapa de decisión · CPA vs ROAS</h3>
        <span className="text-mini text-gray-400 dark:text-zinc-500">tamaño = gasto</span>
      </div>
      <p className="text-mini text-gray-400 dark:text-zinc-500 mb-3">
        Abajo-derecha (CPA bajo, ROAS alto) = escalar · arriba-izquierda = revisar/cortar
      </p>

      {points.length === 0 ? (
        <div className="h-64 flex items-center justify-center text-xs text-gray-400 dark:text-zinc-500">
          Sin ad sets activos con datos suficientes.
        </div>
      ) : (
        <ResponsiveContainer width="100%" height={300}>
          <ScatterChart margin={{ top: 10, right: 16, bottom: 10, left: 0 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="currentColor" className="text-gray-100 dark:text-zinc-800" />
            <XAxis
              type="number" dataKey="x" name="CPA"
              tick={{ fontSize: 10 }} stroke="currentColor" className="text-gray-400 dark:text-zinc-600"
              tickFormatter={(v) => '$' + Math.round(Number(v) / 1000) + 'K'}
            />
            <YAxis
              type="number" dataKey="y" name="ROAS"
              tick={{ fontSize: 10 }} stroke="currentColor" className="text-gray-400 dark:text-zinc-600"
              tickFormatter={(v) => v + 'x'} width={36}
            />
            <ZAxis type="number" dataKey="z" range={[40, 500]} name="Gasto" />
            <ReferenceLine x={breakeven} stroke="#ef4444" strokeDasharray="4 4" label={{ value: 'breakeven', fontSize: 9, fill: '#ef4444', position: 'top' }} />
            <ReferenceLine y={roasMin} stroke="#f59e0b" strokeDasharray="4 4" label={{ value: `min ${roasMin}x`, fontSize: 9, fill: '#f59e0b', position: 'right' }} />
            <Tooltip
              cursor={{ strokeDasharray: '3 3' }}
              content={({ payload }) => {
                if (!payload || !payload.length) return null
                const p = payload[0].payload as { name: string; x: number; y: number; z: number }
                return (
                  <div className="bg-white dark:bg-zinc-800 border border-gray-200 dark:border-zinc-700 rounded-lg px-3 py-2 text-xs shadow-lg">
                    <p className="font-medium text-gray-900 dark:text-zinc-100 mb-1 max-w-[200px] truncate">{p.name}</p>
                    <p className="text-gray-600 dark:text-zinc-300">CPA: ${Math.round(p.x).toLocaleString(LOCALE)}</p>
                    <p className="text-gray-600 dark:text-zinc-300">ROAS: {p.y.toFixed(2)}x</p>
                    <p className="text-gray-600 dark:text-zinc-300">Gasto: ${Math.round(p.z).toLocaleString(LOCALE)}</p>
                  </div>
                )
              }}
            />
            <Scatter data={points}>
              {points.map((p, i) => (
                <Cell key={i} fill={p.good ? '#10b981' : '#f43f5e'} fillOpacity={0.65} />
              ))}
            </Scatter>
          </ScatterChart>
        </ResponsiveContainer>
      )}
    </div>
  )
}
