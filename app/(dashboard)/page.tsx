import { getLatestSnapshot, getLatestTNSnapshot, getSnapshotByDate, getHistoricalSnapshots } from '@/lib/supabase'
import DashboardClient from '@/components/Dashboard/DashboardClient'

export const revalidate = 0
export const dynamic = 'force-dynamic'

export default async function DashboardPage() {
  const [snapshot, tnSnapshot, historicalSnapshots] = await Promise.all([
    getLatestSnapshot().catch(() => null),
    getLatestTNSnapshot().catch(() => null),
    getHistoricalSnapshots(30).catch(() => []),
  ])

  // Snapshot de 7 dias atras para comparativa WoW
  let prevSnapshot = null
  if (snapshot?.snapshot_date) {
    const d = new Date(snapshot.snapshot_date)
    d.setDate(d.getDate() - 7)
    const prevDate = d.toISOString().split('T')[0]
    prevSnapshot = await getSnapshotByDate(prevDate).catch(() => null)
  }

  return (
    <div className="p-6">
      <DashboardClient
        snapshot={snapshot}
        tnSnapshot={tnSnapshot}
        prevSnapshot={prevSnapshot}
        historicalSnapshots={historicalSnapshots}
      />
    </div>
  )
}
