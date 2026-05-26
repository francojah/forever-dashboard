import { getLatestSnapshot } from '@/lib/supabase'
import DashboardClient from '@/components/Dashboard/DashboardClient'

export const revalidate = 3600

export default async function DashboardPage() {
  const snapshot = await getLatestSnapshot()

  return (
    <div className="p-6">
      <DashboardClient snapshot={snapshot} />
    </div>
  )
}
