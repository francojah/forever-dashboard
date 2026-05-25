import { createClientServer } from '@/lib/supabase'
import LeadsClient from '@/components/Leads/LeadsClient'

export default async function LeadsPage() {
  const supabase = createClientServer()
  const { data: leads } = await supabase
    .from('leads')
    .select('*')
    .order('created_at', { ascending: false })
    .limit(200)

  return (
    <div className="p-6 max-w-6xl mx-auto">
      <div className="mb-6">
        <h1 className="text-xl font-semibold text-gray-900">Leads</h1>
        <p className="text-sm text-gray-500 mt-0.5">Contactos captados desde Meta Lead Ads</p>
      </div>
      <LeadsClient leads={leads || []} />
    </div>
  )
}
