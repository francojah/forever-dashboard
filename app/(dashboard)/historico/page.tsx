import { getHistoricalSnapshots } from '@/lib/supabase'
import HistoricoClient from '@/components/Historico/HistoricoClient'

export const revalidate = 3600

export default async function HistoricoPage() {
  const data = await getHistoricalSnapshots(30)

  return (
    <div className="p-6">
      <HistoricoClient data={data} />
    </div>
  )
}
