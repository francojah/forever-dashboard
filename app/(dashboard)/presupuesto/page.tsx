import { getLatestSnapshot } from '@/lib/supabase'
import PresupuestoClient from '@/components/Presupuesto/PresupuestoClient'

export const revalidate = 3600

export default async function PresupuestoPage() {
  const snapshot = await getLatestSnapshot()

  return (
    <div className="p-6">
      <PresupuestoClient snapshot={snapshot} />
    </div>
  )
}
