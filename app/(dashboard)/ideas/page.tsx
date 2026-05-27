import { getLatestSnapshot } from '@/lib/supabase'
import IdeasClient from '@/components/Ideas/IdeasClient'

export const dynamic = 'force-dynamic'

export default async function IdeasPage() {
  const snapshot = await getLatestSnapshot().catch(() => null)

  return (
    <div className="p-6">
      <IdeasClient snapshot={snapshot} />
    </div>
  )
}
