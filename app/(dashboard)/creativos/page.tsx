import { createClientServer } from '@/lib/supabase'
import CreativosClient from '@/components/Creativos/CreativosClient'

export default async function CreativosPage() {
  const supabase = createClientServer()
  const [{ data: creatives }, snapshot] = await Promise.all([
    supabase.from('creatives').select('*').order('created_at', { ascending: false }).limit(100),
    supabase.from('meta_snapshots').select('adsets').order('snapshot_date', { ascending: false }).limit(1).single(),
  ])

  const adsets = snapshot.data?.adsets || []

  return (
    <div className="p-6 max-w-6xl mx-auto">
      <div className="mb-6">
        <h1 className="text-xl font-semibold text-gray-900">Creativos</h1>
        <p className="text-sm text-gray-500 mt-0.5">Registrá y seguí el rendimiento de tus imágenes y videos</p>
      </div>
      <CreativosClient creatives={creatives || []} adsets={adsets} />
    </div>
  )
}
