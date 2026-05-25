import { NextResponse } from 'next/server'
import { createClientServer } from '@/lib/supabase'
import { analyzeCompetitor } from '@/lib/claude'

export async function POST(req: Request) {
  try {
    const supabase = createClientServer()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })

    const { name, url, notes } = await req.json()
    if (!name) return NextResponse.json({ error: 'Nombre requerido' }, { status: 400 })

    const adsContext = [
      url ? `URL: ${url}` : '',
      notes ? `Info adicional:\n${notes}` : 'Sin información adicional provista.',
    ].filter(Boolean).join('\n')

    const result = await analyzeCompetitor(name, adsContext)
    return NextResponse.json(result)

  } catch (e: unknown) {
    const message = e instanceof Error ? e.message : 'Error interno'
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
