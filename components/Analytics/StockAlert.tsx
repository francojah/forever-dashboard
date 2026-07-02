'use client'

import { useEffect, useState } from 'react'
import { Skeleton } from '@/components/ui/Skeleton'

/**
 * StockAlert — Cruza stock actual (tn-stock) con velocidad de venta
 * (analytics/velocity) para estimar días de stock restante y avisar quiebres.
 * Clave para ropa: evita seguir gastando en algo que se va a agotar.
 */

interface StockRow { id: string | number; name: string; total_units: number }
interface VelRow { product_id: string; name: string; units_sold: number; units_per_day: number }

interface Combined {
  name: string
  stock: number
  perDay: number
  daysLeft: number | null
}

const THRESHOLD_DAYS = 10

export default function StockAlert() {
  const [rows, setRows] = useState<Combined[] | null>(null)
  const [loading, setLoading] = useState(true)
  const [note, setNote] = useState<string | null>(null)

  useEffect(() => {
    Promise.all([
      fetch('/api/tn-stock').then((r) => r.json()),
      fetch('/api/analytics/velocity?days=14').then((r) => r.json()),
    ])
      .then(([stock, vel]) => {
        if (stock.error) { setNote('No se pudo leer el stock de Tiendanube.'); return }
        if (vel.empty) { setNote('Sin ventas recientes persistidas para calcular velocidad.'); return }
        const velMap = new Map<string, VelRow>()
        ;(vel.products as VelRow[]).forEach((v) => velMap.set(String(v.product_id), v))
        const combined: Combined[] = (stock.products as StockRow[]).map((s) => {
          const v = velMap.get(String(s.id))
          const perDay = v?.units_per_day || 0
          return {
            name: s.name,
            stock: s.total_units,
            perDay,
            daysLeft: perDay > 0 ? Math.round((s.total_units / perDay) * 10) / 10 : null,
          }
        })
        // Solo productos que se venden y con riesgo, ordenados por urgencia
        const atRisk = combined
          .filter((c) => c.perDay > 0 && c.daysLeft != null && c.daysLeft <= THRESHOLD_DAYS)
          .sort((a, b) => (a.daysLeft || 0) - (b.daysLeft || 0))
        setRows(atRisk)
      })
      .catch(() => setNote('Error cargando datos de stock.'))
      .finally(() => setLoading(false))
  }, [])

  return (
    <div className="bg-white dark:bg-zinc-900 rounded-xl border border-gray-200 dark:border-zinc-800 p-5 shadow-sm">
      <div className="flex items-center gap-2 mb-1">
        <span className="w-2 h-2 rounded-full bg-amber-400" />
        <h3 className="text-sm font-semibold text-gray-900 dark:text-zinc-100">Alerta de stock</h3>
      </div>
      <p className="text-mini text-gray-400 dark:text-zinc-500 mb-4">
        Productos que se agotan en ≤ {THRESHOLD_DAYS} días al ritmo de venta actual
      </p>

      {loading ? (
        <div className="space-y-2">
          {Array.from({ length: 4 }).map((_, i) => <Skeleton key={i} className="h-7 w-full" />)}
        </div>
      ) : note ? (
        <p className="text-xs text-gray-400 dark:text-zinc-500">{note}</p>
      ) : !rows || rows.length === 0 ? (
        <p className="text-xs text-emerald-600 dark:text-emerald-400">Todo con stock sano. Sin quiebres inminentes. ✓</p>
      ) : (
        <div className="space-y-2">
          {rows.map((r, i) => (
            <div key={i} className="flex items-center justify-between gap-3 py-1.5 border-b border-gray-50 dark:border-zinc-800/50 last:border-0">
              <span className="text-xs text-gray-800 dark:text-zinc-200 truncate max-w-[220px]" title={r.name}>{r.name}</span>
              <div className="flex items-center gap-3 shrink-0 text-mini tabular-nums">
                <span className="text-gray-400 dark:text-zinc-500">{r.stock} u · {r.perDay}/día</span>
                <span
                  className={
                    'font-semibold px-2 py-0.5 rounded-full ' +
                    ((r.daysLeft || 0) <= 4
                      ? 'bg-red-100 dark:bg-red-500/15 text-red-600 dark:text-red-400'
                      : 'bg-amber-100 dark:bg-amber-500/15 text-amber-600 dark:text-amber-400')
                  }
                >
                  {r.daysLeft}d
                </span>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
