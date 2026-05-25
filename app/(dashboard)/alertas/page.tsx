import { createClientServer } from '@/lib/supabase'
import AlertasClient from '@/components/Alertas/AlertasClient'

export default async function AlertasPage() {
  const supabase = createClientServer()
  const { data: alerts } = await supabase
    .from('alerts')
    .select('*')
    .order('created_at', { ascending: false })
    .limit(100)

  return (
    <div className="p-6 max-w-4xl mx-auto">
      <div className="mb-6">
        <h1 className="text-xl font-semibold text-gray-900">Alertas</h1>
        <p className="text-sm text-gray-500 mt-0.5">Generadas automáticamente cada día por el sistema</p>
      </div>
      <AlertasClient alerts={alerts || []} />
    </div>
  )
}
