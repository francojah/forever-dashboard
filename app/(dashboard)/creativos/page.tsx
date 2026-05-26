import { getLatestSnapshot } from '@/lib/supabase'
import CreativosClient from '@/components/Creativos/CreativosClient'

export const revalidate = 3600

export default async function CreativosPage() {
  const snapshot = await getLatestSnapshot()
  return (
    <div className="p-6">
      <CreativosClient snapshot={snapshot} />
    </div>
  )
}
