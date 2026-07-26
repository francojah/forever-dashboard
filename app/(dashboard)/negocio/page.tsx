import BusinessHealth from '@/components/Negocio/BusinessHealth'
import ContributionByProduct from '@/components/Negocio/ContributionByProduct'
import PnlTrend from '@/components/Negocio/PnlTrend'

export const dynamic = 'force-dynamic'

export default function NegocioPage() {
  return (
    <div className="max-w-6xl mx-auto p-6 space-y-6">
      <div>
        <h1 className="text-xl font-semibold text-gray-900 dark:text-zinc-100">Negocio</h1>
        <p className="text-sm text-gray-500 dark:text-zinc-500 mt-0.5">
          Análisis estructural: salud, rentabilidad por producto y trayectoria.
        </p>
      </div>

      <BusinessHealth />

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <ContributionByProduct />
        <PnlTrend />
      </div>
    </div>
  )
}
