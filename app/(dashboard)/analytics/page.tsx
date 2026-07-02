import { getLatestTNSnapshot } from '@/lib/supabase'
import CustomersPanel from '@/components/Analytics/CustomersPanel'
import ProductsPanel from '@/components/Analytics/ProductsPanel'
import StockAlert from '@/components/Analytics/StockAlert'
import MarginWaterfall from '@/components/Balance/MarginWaterfall'

export const revalidate = 0
export const dynamic = 'force-dynamic'

export default async function AnalyticsPage() {
  const tn = await getLatestTNSnapshot().catch(() => null)
  const s = tn?.summary_30d ?? null

  return (
    <div className="max-w-6xl mx-auto p-6 space-y-6">
      <div>
        <h1 className="text-xl font-semibold text-gray-900 dark:text-zinc-100">Analítica de negocio</h1>
        <p className="text-sm text-gray-500 dark:text-zinc-500 mt-0.5">
          Clientes, producto, margen real y stock · basado en tus órdenes de Tiendanube
        </p>
      </div>

      {s && (
        <MarginWaterfall
          revenue={s.total_revenue || 0}
          orders={s.total_orders || 0}
          units={s.total_units_sold || 0}
          installmentsCost={s.total_installments_cost || 0}
        />
      )}

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <CustomersPanel />
        <StockAlert />
      </div>

      <ProductsPanel />
    </div>
  )
}
