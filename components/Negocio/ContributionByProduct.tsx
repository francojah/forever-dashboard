'use client'

import { useEffect, useState } from 'react'
import { LOCALE } from '@/lib/config'
import { Skeleton } from '@/components/ui/Skeleton'

interface Product { name: string; revenue: number; margin: number | null; margin_pct: number | null; has_cost: boolean }
interface Data { empty?: boolean; message?: string; products?: Product[]; products_without_cost?: number }

const money = (n: number) => '$' + Math.round(n).toLocaleString(LOCALE)

export default function ContributionByProduct() {
  const [data, setData] = useState<Data | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    fetch('/api/analytics/products?days=30', { cache: 'no-store' })
      .then((r) => r.json()).then(setData).catch(() => setData(null)).finally(() => setLoading(false))
  }, [])

  return (
    <div className="bg-white dark:bg-zinc-900 rounded-xl border border-gray-200 dark:border-zinc-800 p-5 shadow-sm">
      <h3 className="text-sm font-semibold text-gray-900 dark:text-zinc-100 mb-1">Contribución por producto · 30d</h3>
      <p className="text-mini text-gray-400 dark:text-zinc-500 mb-4">Verde = margen que deja · gris = costo. Ordenado por margen.</p>

      {loading ? (
        <div className="space-y-3">{Array.from({ length: 5 }).map((_, i) => <Skeleton key={i} className="h-8 w-full" />)}</div>
      ) : !data || data.empty || !data.products || data.products.length === 0 ? (
        <p className="text-mini text-gray-400 dark:text-zinc-500">{data?.message || 'Sin datos de producto todavía.'}</p>
      ) : (() => {
        const withCost = data.products.filter((p) => p.margin != null) as (Product & { margin: number })[]
        const sorted = [...withCost].sort((a, b) => b.margin - a.margin)
        const maxRev = Math.max(...sorted.map((p) => p.revenue), 1)
        return (
          <div className="space-y-3">
            {sorted.slice(0, 10).map((p, i) => {
              const marginW = (Math.max(p.margin, 0) / maxRev) * 100
              const costW = (Math.max(p.revenue - p.margin, 0) / maxRev) * 100
              return (
                <div key={i}>
                  <div className="flex items-center justify-between text-mini mb-1">
                    <span className="text-gray-700 dark:text-zinc-300 truncate max-w-[60%]" title={p.name}>{p.name}</span>
                    <span className="tabular-nums text-gray-500 dark:text-zinc-400">{money(p.revenue)} · <span className={p.margin >= 0 ? 'text-emerald-600 dark:text-emerald-400' : 'text-red-500'}>{p.margin_pct}%</span></span>
                  </div>
                  <div className="flex h-5 rounded-md overflow-hidden bg-gray-50 dark:bg-zinc-800/50">
                    <div className="bg-emerald-500 h-full" style={{ width: marginW + '%' }} title={'Margen ' + money(p.margin)} />
                    <div className="bg-gray-300 dark:bg-zinc-700 h-full" style={{ width: costW + '%' }} title={'Costo ' + money(p.revenue - p.margin)} />
                  </div>
                </div>
              )
            })}
            {(data.products_without_cost || 0) > 0 && (
              <p className="text-mini text-amber-600 dark:text-amber-400 pt-1">
                {data.products_without_cost} producto(s) sin costo cargado no se muestran. Cargalos en Configuración.
              </p>
            )}
          </div>
        )
      })()}
    </div>
  )
}
