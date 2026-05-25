import { createClientServer } from '@/lib/supabase'
import CompetenciaClient from '@/components/Competencia/CompetenciaClient'

export default async function CompetenciaPage() {
  const supabase = createClientServer()
  const { data: analyses } = await supabase
    .from('competitor_analyses')
    .select('*')
    .order('created_at', { ascending: false })
    .limit(20)

  return (
    <div className="p-6 max-w-5xl mx-auto">
      <div className="mb-6">
        <h1 className="text-xl font-semibold text-gray-900">Análisis de competencia</h1>
        <p className="text-sm text-gray-500 mt-0.5">Analizá los anuncios de competidores con IA</p>
      </div>
      <CompetenciaClient savedAnalyses={analyses || []} />
    </div>
  )
}
