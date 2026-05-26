import { getLatestTNSnapshot, getLatestSnapshot } from '@/lib/supabase'
import TiendanubeClient from '@/components/Tiendanube/TiendanubeClient'

export const revalidate = 0   // always fetch fresh from Supabase
export const dynamic = 'force-dynamic'

export default async function TiendanubePage() {
  const [tnSnapshot, metaSnapshot] = await Promise.all([
    getLatestTNSnapshot().catch(() => null),
    getLatestSnapshot().catch(() => null),
  ])

  return (
    <div className="p-6">
      <TiendanubeClient tnSnapshot={tnSnapshot} metaSnapshot={metaSnapshot} />
    </div>
  )
}
