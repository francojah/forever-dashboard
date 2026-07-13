'use client'

import { useEffect, useState } from 'react'
import { LOCALE } from '@/lib/config'
import { Skeleton } from '@/components/ui/Skeleton'

/**
 * ProductCostsCard — Cargar el costo unitario de cada producto.
 * Lista los productos de la tienda (tn-stock) + costos guardados (product_costs)
 * y permite editarlos. Habilita el margen real por producto en Analítica.
 */

interface Product { id: string; name: string }
interface Cost { product_id: string; product_name: string; unit_cost: number }

export default function ProductCostsCard() {
  const [products, setProducts] = useState<Product[]>([])
  const [costs, setCosts] = useState<Record<string, number>>({})
  const [drafts, setDrafts] = useState<Record<string, string>>({})
  const [savingId, setSavingId] = useState<string | null>(null)
  const [savedId, setSavedId] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)
  const [q, setQ] = useState('')
  const [note, setNote] = useState<string | null>(null)

  useEffect(() => {
    Promise.all([
      fetch('/api/tn-stock').then((r) => r.json()),
      fetch('/api/product-costs').then((r) => r.json()),
    ])
      .then(([stock, costList]) => {
        if (stock?.products) setProducts(stock.products.map((p: { id: string | number; name: string }) => ({ id: String(p.id), name: p.name })))
        else setNote('No se pudo leer el listado de productos de Tiendanube.')
        const map: Record<string, number> = {}
        if (Array.isArray(costList)) costList.forEach((c: Cost) => { map[String(c.product_id)] = c.unit_cost })
        setCosts(map)
      })
      .catch(() => setNote('Error cargando productos.'))
      .finally(() => setLoading(false))
  }, [])

  async function save(p: Product) {
    const raw = drafts[p.id]
    const val = Number(raw)
    if (raw == null || raw === '' || isNaN(val) || val < 0) return
    setSavingId(p.id)
    try {
      const res = await fetch('/api/product-costs', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ product_id: p.id, product_name: p.name, unit_cost: val }),
      })
      if (res.ok) {
        setCosts((c) => ({ ...c, [p.id]: val }))
        setDrafts((d) => { const n = { ...d }; delete n[p.id]; return n })
        setSavedId(p.id)
        setTimeout(() => setSavedId((s) => (s === p.id ? null : s)), 1500)
      }
    } finally {
      setSavingId(null)
    }
  }

  const filtered = products.filter((p) => p.name.toLowerCase().includes(q.toLowerCase()))
  const withCost = products.filter((p) => costs[p.id] != null).length

  return (
    <div className="bg-white dark:bg-zinc-900 rounded-xl border border-gray-200 dark:border-zinc-800 shadow-sm">
      <div className="px-5 py-4 border-b border-gray-100 dark:border-zinc-800 flex items-center justify-between gap-3">
        <div>
          <p className="text-sm font-semibold text-gray-800 dark:text-zinc-200">Costos de producto</p>
          <p className="text-mini text-gray-400 dark:text-zinc-500">Costo unitario para calcular el margen real por producto</p>
        </div>
        {!loading && products.length > 0 && (
          <span className="text-mini text-gray-400 dark:text-zinc-500 shrink-0">{withCost}/{products.length} con costo</span>
        )}
      </div>

      <div className="p-4">
        {loading ? (
          <div className="space-y-2">{Array.from({ length: 5 }).map((_, i) => <Skeleton key={i} className="h-9 w-full" />)}</div>
        ) : note ? (
          <p className="text-xs text-gray-400 dark:text-zinc-500">{note}</p>
        ) : (
          <>
            <input
              value={q}
              onChange={(e) => setQ(e.target.value)}
              placeholder="Buscar producto…"
              className="w-full mb-3 px-3 py-2 rounded-lg text-sm border border-gray-200 dark:border-zinc-700 bg-gray-50 dark:bg-zinc-800 text-gray-900 dark:text-zinc-100 focus:outline-none focus:ring-2 ring-brand"
            />
            <div className="max-h-80 overflow-y-auto divide-y divide-gray-50 dark:divide-zinc-800/50">
              {filtered.map((p) => {
                const current = costs[p.id]
                const draft = drafts[p.id]
                const dirty = draft != null && draft !== '' && Number(draft) !== current
                return (
                  <div key={p.id} className="flex items-center gap-3 py-2">
                    <span className="flex-1 text-sm text-gray-800 dark:text-zinc-200 truncate" title={p.name}>{p.name}</span>
                    <div className="flex items-center gap-1.5 shrink-0">
                      <span className="text-xs text-gray-400">$</span>
                      <input
                        type="number"
                        value={draft ?? (current != null ? String(current) : '')}
                        onChange={(e) => setDrafts((d) => ({ ...d, [p.id]: e.target.value }))}
                        onKeyDown={(e) => { if (e.key === 'Enter') save(p) }}
                        placeholder="0"
                        className="w-24 px-2 py-1.5 rounded-lg text-sm text-right tabular-nums border border-gray-200 dark:border-zinc-700 bg-gray-50 dark:bg-zinc-800 text-gray-900 dark:text-zinc-100 focus:outline-none focus:ring-2 ring-brand"
                      />
                      <button
                        onClick={() => save(p)}
                        disabled={!dirty || savingId === p.id}
                        className={'text-mini rounded-md px-2 py-1.5 font-medium transition-colors ' + (savedId === p.id ? 'text-emerald-600 dark:text-emerald-400' : dirty ? 'bg-brand text-white' : 'text-gray-300 dark:text-zinc-600 cursor-default')}
                      >
                        {savingId === p.id ? '…' : savedId === p.id ? '✓' : 'Guardar'}
                      </button>
                    </div>
                  </div>
                )
              })}
              {filtered.length === 0 && <p className="text-xs text-gray-400 dark:text-zinc-500 py-3 text-center">Sin resultados.</p>}
            </div>
            <p className="text-mini text-gray-400 dark:text-zinc-600 mt-3">
              Los costos alimentan el margen real por producto en <span className="text-brand">Analítica</span>. Moneda: {LOCALE === 'es-AR' ? 'ARS' : ''}.
            </p>
          </>
        )}
      </div>
    </div>
  )
}
