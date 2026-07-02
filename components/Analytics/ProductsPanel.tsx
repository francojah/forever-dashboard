'use client'

import { useEffect, useState } from 'react'
import { LOCALE } from '@/lib/config'
import EmptyState from '@/components/ui/EmptyState'
import { Skeleton } from '@/components/ui/Skeleton'

/**
 * ProductsPanel — Ventas por producto + margen real + revenue neto.
 * Consume /api/analytics/products. Requiere tn_orders + product_costs.
 */

interface Product {
  name: string
  units: number
  revenue: number
  cost: number
  margin: number | null
  margin_pct: number | null
  has_cost: boolean
}
interface Data {
  empty?: boolean
  message?: string
  days?: number
  gross_revenue?: number
  net_revenue?: number
  cancelled_revenue?: number
  cancelled_count?: number
  blended_margin_pct?: number | null
  products_without_cost?: number
  products?: Product[]
}

export default function ProductsPanel() {
  const [data, setData] = useState<Data | null>(null)
  const [loading, setLoading] = useState(true)
  const [days, setDays] = useState(30)

  useEffect(() => {
    setLoading(true)
    fetch(`/api/analytics/products?days=${days}`)
      .then((r) => r.json())
      .then(setData)
      .catch(() => setData({ empty: true, message: 'Error cargando datos.' }))
      .finally(() => setLoading(false))
  }, [days])

  const money = (n?: number | null) => (n == null ? '—' : '$' + Math.round(n).toLocaleString(LOCALE))

  return (
    <div className="bg-white dark:bg-zinc-900 rounded-xl border border-gray-200 dark:border-zinc-800 p-5 shadow-sm">
      <div className="flex items-center justify-between mb-4">
        <h3 className="text-sm font-semibold text-gray-900 dark:text-zinc-100">Producto · ventas y margen real</h3>
        <select
          value={days}
          onChange={(e) => setDays(Number(e.target.value))}
          className="text-[11px] rounded-md border border-gray-200 dark:border-zinc-700 bg-white dark:bg-zinc-900 px-2 py-1 text-gray-700 dark:text-zinc-200"
        >
          <option value={7}>7d</option>
          <option value={30}>30d</option>
          <option value={90}>90d</option>
          <option value={365}>1 año</option>
        </select>
      </div>

      {loading ? (
        <div className="space-y-2">
          {Array.from({ length: 6 }).map((_, i) => <Skeleton key={i} className="h-8 w-full" />)}
        </div>
      ) : !data || data.empty ? (
        <EmptyState
          title="Sin datos de producto todavía"
          description={data?.message || 'Corré el sync de Tiendanube para ver ventas y margen por producto.'}
          action={{ label: 'Ir a Configuración', href: '/settings' }}
        />
      ) : (
        <>
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-4">
            <Kpi label="Revenue bruto" value={money(data.gross_revenue)} />
            <Kpi label="Revenue neto" value={money(data.net_revenue)} sub={data.cancelled_count ? `${data.cancelled_count} canceladas` : undefined} />
            <Kpi label="Margen blended" value={data.blended_margin_pct != null ? data.blended_margin_pct + '%' : '—'} accent />
            <Kpi label="Sin costo cargado" value={String(data.products_without_cost || 0)} warn={(data.products_without_cost || 0) > 0} />
          </div>

          {(data.products_without_cost || 0) > 0 && (
            <p className="text-[11px] text-amber-600 dark:text-amber-400 mb-3">
              Cargá el costo de esos productos en Configuración para ver su margen real.
            </p>
          )}

          <div className="overflow-x-auto">
            <table className="w-full text-xs">
              <thead>
                <tr className="text-left text-gray-400 dark:text-zinc-500 border-b border-gray-100 dark:border-zinc-800">
                  <th className="py-2 pr-3 font-medium">Producto</th>
                  <th className="py-2 px-2 text-right font-medium">Unid.</th>
                  <th className="py-2 px-2 text-right font-medium">Revenue</th>
                  <th className="py-2 px-2 text-right font-medium">Margen</th>
                  <th className="py-2 pl-2 text-right font-medium">%</th>
                </tr>
              </thead>
              <tbody>
                {data.products!.map((p, i) => (
                  <tr key={i} className="border-b border-gray-50 dark:border-zinc-800/50">
                    <td className="py-2 pr-3 text-gray-800 dark:text-zinc-200 truncate max-w-[200px]">{p.name}</td>
                    <td className="py-2 px-2 text-right tabular-nums text-gray-600 dark:text-zinc-300">{p.units}</td>
                    <td className="py-2 px-2 text-right tabular-nums text-gray-800 dark:text-zinc-200">{money(p.revenue)}</td>
                    <td className="py-2 px-2 text-right tabular-nums">
                      {p.margin == null ? (
                        <span className="text-gray-300 dark:text-zinc-600">sin costo</span>
                      ) : (
                        <span className={p.margin >= 0 ? 'text-emerald-600 dark:text-emerald-400' : 'text-red-500'}>{money(p.margin)}</span>
                      )}
                    </td>
                    <td className="py-2 pl-2 text-right tabular-nums text-gray-500 dark:text-zinc-400">
                      {p.margin_pct == null ? '—' : p.margin_pct + '%'}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      )}
    </div>
  )
}

function Kpi({ label, value, sub, accent, warn }: { label: string; value: string; sub?: string; accent?: boolean; warn?: boolean }) {
  const color = warn ? 'text-amber-600 dark:text-amber-400' : accent ? 'text-emerald-600 dark:text-emerald-400' : 'text-gray-900 dark:text-zinc-100'
  return (
    <div>
      <p className="text-[11px] uppercase tracking-wide text-gray-400 dark:text-zinc-500">{label}</p>
      <p className={'text-lg font-semibold mt-0.5 ' + color}>{value}</p>
      {sub && <p className="text-[10px] text-gray-400 dark:text-zinc-500">{sub}</p>}
    </div>
  )
}
