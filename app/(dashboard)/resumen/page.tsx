import ResumenClient from '@/components/Resumen/ResumenClient'
import { createClientServer } from '@/lib/supabase'

export const revalidate = 0 // always dynamic

export default async function ResumenPage() {
  // Try to get cached resumen
  const supabase = createClientServer()
  const { data } = await supabase
    .from('ai_resumenes')
    .select('content, resumen_date')
    .order('resumen_date', { ascending: false })
    .limit(1)
    .single()

  return (
    <div className="p-6">
      <ResumenClient
        initialContent={data?.content ?? null}
        initialDate={data?.resumen_date ?? null}
      />
    </div>
  )
}
