import type { TNSnapshot } from '@/lib/supabase'

interface Props {
  snapshot: TNSnapshot | null
}

function MetricCard({ label, value, sub }: { label: string; value: string; sub?: string }) {
  return (
    <div className="bg-white dark:bg-zinc-900 rounded-xl border border-gray-200 dark:border-zinc-800 p-4 shadow-sm">
      <p className="text-xs text-gray-400 dark:text-zinc-500 font-medium uppercase tracking-wide mb-1">{label}</p>
      <p className="text-2xl font-semibold text-gray-900 dark:text-zinc-100">{value}</p>
      {sub && <p className="text-xs text-gray-400 dark:text-zinc-600 mt-1">{sub}</p>}
    </div>
  )
}

export default function TiendanubeWidget({ snapshot }: Props) {
  if (!snapshot) {
    return (
      <div className="bg-white dark:bg-zinc-900 rounded-xl border border-dashed border-gray-300 dark:border-zinc-700 p-5 text-center">
        <p className="text-sm text-gray-400 dark:text-zinc-500 mb-1">🛍️ Tiendanube sin conectar</p>
        <p className="text-xs text-gray-400 dark:text-zinc-600">
          Agregá <code className="bg-gray-100 dark:bg-zinc-800 px-1 rounded">TIENDANUBE_USER_ID</code> y <code className="bg-gray-100 dark:bg-zinc-800 px-1 rounded">TIENDANUBE_ACCESS_TOKEN</code> a tus variables de entorno
        </p>
      </div>
    )
  }

  const s = snapshot.summary_7d
  if (!s) return null

  const topProducts = (s.top_products || []).slice(0, 5)

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h2 className="text-sm font-semibold text-gray-700 dark:text-zinc-300 uppercase tracking-wide">
          Tiendanube · últimos 7d
        </h2>
        <span className="text-xs text-gray-400 dark:text-zinc-600">{snapshot.snapshot_date}</span>
      </div>

      {/* KPIs */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <MetricCard
          label="Ventas"
          value={`$${Math.round(s.total_revenue / 1000)}K`}
          sub="ARS total"
        />
        <MetricCard
          label="Órdenes"
          value={String(s.total_orders)}
          sub={`~${(s.total_orders / 7).toFixed(1)}/día`}
        />
        <MetricCard
          label="Ticket promedio"
          value={`$${Math.round(s.aov / 1000)}K`}
          sub="ARS por orden"
        />
        <MetricCard
          label="Clientes únicos"
          value={String(s.unique_customers)}
          sub="en el período"
        />
      </div>

      {/* Top productos */}
      {topProducts.length > 0 && (
        <div className="bg-white dark:bg-zinc-900 rounded-xl border border-gray-200 dark:border-zinc-800 overflow-hidden shadow-sm">
          <div className="px-4 py-3 border-b border-gray-100 dark:border-zinc-800">
            <h3 className="text-xs font-semibold text-gray-500 dark:text-zinc-500 uppercase tracking-wide">Top productos</h3>
          </div>
          <div className="divide-y divide-gray-100 dark:divide-zinc-800">
            {topProducts.map((p, i) => {
              const pct = s.total_revenue > 0 ? (p.revenue / s.total_revenue) * 100 : 0
              return (
                <div key={i} className="flex items-center gap-3 px-4 py-2.5">
                  <span className="text-xs text-gray-400 dark:text-zinc-600 w-4 shrink-0">{i + 1}</span>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm text-gray-700 dark:text-zinc-300 truncate">{p.name}</p>
                    <div className="mt-1 h-1 bg-gray-100 dark:bg-zinc-800 rounded-full overflow-hidden">
                      <div
                        className="h-full bg-indigo-500 dark:bg-indigo-400 rounded-full"
                        style={{ width: `${pct}%` }}
                      />
                    </div>
                  </div>
                  <div className="text-right shrink-0">
                    <p className="text-xs font-medium text-gray-700 dark:text-zinc-300">${Math.round(p.revenue / 1000)}K</p>
                    <p className="text-xs text-gray-400 dark:text-zinc-600">{p.quantity} uds</p>
                  </div>
                </div>
              )
            })}
          </div>
        </div>
      )}
    </div>
  )
}
