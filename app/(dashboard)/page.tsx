import { getLatestSnapshot, getLatestTNSnapshot } from '@/lib/supabase'
import DashboardClient from '@/components/Dashboard/DashboardClient'
import TiendanubeWidget from '@/components/Dashboard/TiendanubeWidget'

export const revalidate = 3600

export default async function DashboardPage() {
  const [snapshot, tnSnapshot] = await Promise.all([
    getLatestSnapshot(),
    getLatestTNSnapshot().catch(() => null), // graceful fallback if table doesn't exist yet
  ])

  return (
    <div className="p-6 space-y-8">
      <DashboardClient snapshot={snapshot} />
      <TiendanubeWidget snapshot={tnSnapshot} />
    </div>
  )
}
