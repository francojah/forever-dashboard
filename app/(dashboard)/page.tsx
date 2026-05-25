import { getLatestSnapshot, getSnapshotDates } from '@/lib/supabase'
import DashboardClient from '@/components/Dashboard/DashboardClient'

export const revalidate = 3600 // revalidar cada hora

export default async function DashboardPage() {
  const [snapshot, dates] = await Promise.all([
    getLatestSnapshot(),
    getSnapshotDates(),
  ])

  return (
    <div className="p-6">
      <DashboardClient snapshot={snapshot} availableDates={dates} />
    </div>
  )
}
