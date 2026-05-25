import { NextResponse } from 'next/server'
import { createClientServer } from '@/lib/supabase'
import { generateCreativeIdeas } from '@/lib/claude'

export async function POST() {
  try {
    const supabase = createClientServer()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })

    // Obtener último snapshot
    const { data: snapshot } = await supabase
      .from('meta_snapshots')
      .select('*')
      .order('snapshot_date', { ascending: false })
      .limit(1)
      .single()

    if (!snapshot) {
      return NextResponse.json({ error: 'No hay datos de Meta todavía. Esperá el primer sync.' }, { status: 400 })
    }

    const result = await generateCreativeIdeas(snapshot)
    return NextResponse.json(result)

  } catch (e: unknown) {
    const message = e instanceof Error ? e.message : 'Error interno'
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
