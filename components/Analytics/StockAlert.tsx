'use client'

import { useEffect, useState } from 'react'
import { Skeleton } from '@/components/ui/Skeleton'

/**
 * StockAlert — Cruza stock actual (tn-stock) con velocidad de venta
 * (analytics/velocity) para estimar días de stock restante y avisar quiebres.
 * Clave para ropa: evita seguir gastando en algo que se va a agotar.
 */

interface StockRow {
  id: string | number
  name: string
  total_units: number
  oos_variants?: string[]
  sold_out?: boolean
}
interface VelRow { product_id: string; name: string; units_sold: number; units_per_day: number }

interface Combined {
  name: string
  stock: number
  perDay: number
  daysLeft: number | null
}
interface Oos {
  name: string
  soldOut: boolean
  variants: string[]
}

const THRESHOLD_DAYS = 10

export default function StockAlert() {
  const [rows, setRows] = useState<Combined[] | null>(null)
  const [oos, setOos] = useState<Oos[]>([])
  const [loading, setLoading] = useState(true)
  const [note, setNote] = useState<string | null>(null)

  useEffect(() => {
    Promise.all([
      fetch('/api/tn-stock', { cache: 'no-store' }).then((r) => r.json()),
      fetch('/api/analytics/velocity?days=14', { cache: 'no-store' }).then((r) => r.json()),
    ])
      .then(([stock, vel]) => {
        if (stock.error) { setNote('No se pudo leer el stock de Tiendanube.'); return }
        const stockRows = (stock.products as StockRow[]) || []

        // Agotados: producto entero (sold_out) o algunos talles (oos_variants)
        const oosList: Oos[] = stockRows
          .filter((s) => s.sold_out || (s.oos_variants && s.oos_variants.length > 0))
          .map((s) => ({ name: s.name, soldOut: !!s.sold_out, variants: s.oos_variants || [] }))
          .sort((a, b) => Number(b.soldOut) - Number(a.soldOut))
        setOos(oosList)

        // Por agotarse: requiere velocidad de venta
        if (vel.empty) { setRows([]); return }
        const velMap = new Map<string, VelRow>()
        ;(vel.products as VelRow[]).forEach((v) => velMap.set(String(v.product_id), v))
        const atRisk: Combined[] = stockRows
          .filter((s) => s.total_units > 0)
          .map((s) => {
            const v = velMap.get(String(s.id))
            const perDay = v?.units_per_day || 0
            return {
              name: s.name,
              stock: s.total_units,
              perDay,
              daysLeft: perDay > 0 ? Math.round((s.total_units / perDay) * 10) / 10 : null,
            }
          })
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
        Agotados y productos que se agotan en ≤ {THRESHOLD_DAYS} días al ritmo actual
      </p>

      {loading ? (
        <div className="space-y-2">
          {Array.from({ length: 4 }).map((_, i) => <Skeleton key={i} className="h-7 w-full" />)}
        </div>
      ) : note ? (
        <p className="text-xs text-gray-400 dark:text-zinc-500">{note}</p>
      ) : oos.length === 0 && (!rows || rows.length === 0) ? (
        <p className="text-xs text-emerald-600 dark:text-emerald-400">Todo con stock sano. Sin quiebres inminentes. ✓</p>
      ) : (
        <div className="space-y-4">
          {oos.length > 0 && (
            <div>
              <p className="text-micro uppercase tracking-wide text-red-500 dark:text-red-400 font-semibold mb-1.5">
                Sin stock · {oos.length}
              </p>
              <div className="space-y-1.5">
                {oos.slice(0, 12).map((o, i) => (
                  <div key={i} className="flex items-start justify-between gap-3 py-1 border-b border-gray-50 dark:border-zinc-800/50 last:border-0">
                    <span className="text-xs text-gray-800 dark:text-zinc-200 truncate max-w-[55%]" title={o.name}>{o.name}</span>
                    <span className="shrink-0 text-mini text-right">
                      {o.soldOut ? (
                        <span className="font-semibold px-2 py-0.5 rounded-full bg-red-100 dark:bg-red-500/15 text-red-600 dark:text-red-400">
                          agotado
                        </span>
                      ) : (
                        <span className="text-gray-500 dark:text-zinc-400" title={o.variants.join(', ')}>
                          sin: <span className="text-amber-600 dark:text-amber-400">{o.variants.slice(0, 4).join(', ')}{o.variants.length > 4 ? ` +${o.variants.length - 4}` : ''}</span>
                        </span>
                      )}
                    </span>
                  </div>
                ))}
                {oos.length > 12 && (
                  <p className="text-micro text-gray-400 dark:text-zinc-500">+{oos.length - 12} más</p>
                )}
              </div>
            </div>
          )}

          {rows && rows.length > 0 && (
            <div>
              <p className="text-micro uppercase tracking-wide text-amber-600 dark:text-amber-400 font-semibold mb-1.5">
                Por agotarse · {rows.length}
              </p>
              <div className="space-y-1.5">
                {rows.map((r, i) => (
                  <div key={i} className="flex items-center justify-between gap-3 py-1 border-b border-gray-50 dark:border-zinc-800/50 last:border-0">
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
            </div>
          )}
        </div>
      )}
    </div>
  )
}
