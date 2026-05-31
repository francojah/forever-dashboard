import { getLatestSnapshot } from '@/lib/supabase'
import CampaniasClient from '@/components/Campanias/CampaniasClient'

export const revalidate = 0
export const dynamic = 'force-dynamic'

export default async function CampaniasPage() {
  const snapshot = await getLatestSnapshot().catch(() => null)

  return (
    <div className="p-6">
      <CampaniasClient snapshot={snapshot} />
    </div>
  )
}
