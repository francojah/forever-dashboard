import { getLatestSnapshot, getLatestTNSnapshot } from '@/lib/supabase'
import AssistantClient from '@/components/Assistant/AssistantClient'

export const revalidate = 0
export const dynamic = 'force-dynamic'

export default async function AssistantPage() {
  const [snapshot, tnSnapshot] = await Promise.all([
    getLatestSnapshot().catch(() => null),
    getLatestTNSnapshot().catch(() => null),
  ])

  return (
    <div className="p-6">
      <AssistantClient snapshot={snapshot} tnSnapshot={tnSnapshot} />
    </div>
  )
}
