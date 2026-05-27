import { getLatestSnapshot, getLatestTNSnapshot } from '@/lib/supabase'
import DashboardClient from '@/components/Dashboard/DashboardClient'

export const revalidate = 0
export const dynamic = 'force-dynamic'

export default async function DashboardPage() {
  const [snapshot, tnSnapshot] = await Promise.all([
    getLatestSnapshot().catch(() => null),
    getLatestTNSnapshot().catch(() => null),
  ])

  return (
    <div className="p-6">
      <DashboardClient snapshot={snapshot} tnSnapshot={tnSnapshot} />
    </div>
  )
}
