import { getLatestSnapshot, createClientServer } from '@/lib/supabase'
import IdeasClient from '@/components/Ideas/IdeasClient'

export default async function IdeasPage() {
  const supabase = createClientServer()
  const [snapshot, { data: ideas }] = await Promise.all([
    getLatestSnapshot(),
    supabase.from('creative_ideas').select('*').order('created_at', { ascending: false }).limit(50),
  ])

  return (
    <div className="p-6 max-w-5xl mx-auto">
      <div className="mb-6">
        <h1 className="text-xl font-semibold text-gray-900">Ideas de contenido</h1>
        <p className="text-sm text-gray-500 mt-0.5">Generadas por IA basándose en tu performance actual</p>
      </div>
      <IdeasClient snapshot={snapshot} savedIdeas={ideas || []} />
    </div>
  )
}
