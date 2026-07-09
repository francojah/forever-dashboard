import CustomersPanel from '@/components/Analytics/CustomersPanel'
import ProductsPanel from '@/components/Analytics/ProductsPanel'
import StockAlert from '@/components/Analytics/StockAlert'

export const revalidate = 0
export const dynamic = 'force-dynamic'

export default function AnalyticsPage() {
  return (
    <div className="max-w-6xl mx-auto p-6 space-y-6">
      <div>
        <h1 className="text-xl font-semibold text-gray-900 dark:text-zinc-100">Analítica de negocio</h1>
        <p className="text-sm text-gray-500 dark:text-zinc-500 mt-0.5">
          Clientes, producto y stock · basado en tus órdenes de Tiendanube. El P&amp;L está en Balance.
        </p>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <CustomersPanel />
        <StockAlert />
      </div>

      <ProductsPanel />
    </div>
  )
}
