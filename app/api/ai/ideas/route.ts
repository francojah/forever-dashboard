import { NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { generateCreativeIdeas } from '@/lib/claude'

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL!
const SUPABASE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY!

export async function POST() {
  try {
    const supabase = createClient(SUPABASE_URL, SUPABASE_KEY)

    const { data: snapshot } = await supabase
      .from('meta_snapshots')
      .select('*')
      .order('snapshot_date', { ascending: false })
      .limit(1)
      .single()

    if (!snapshot) {
      return NextResponse.json({ error: 'No hay datos de Meta. Ejecuta un sync primero.' }, { status: 400 })
    }

    const { data: tnSnap } = await supabase
      .from('tiendanube_snapshots')
      .select('summary_30d')
      .order('snapshot_date', { ascending: false })
      .limit(1)
      .single()

    const tnData = tnSnap?.summary_30d ? {
      top_products: tnSnap.summary_30d.top_products || [],
      aov:          tnSnap.summary_30d.aov || 0,
      total_orders: tnSnap.summary_30d.total_orders || 0,
    } : null

    const result = await generateCreativeIdeas(snapshot, tnData)
    return NextResponse.json(result)

  } catch (e: unknown) {
    const message = e instanceof Error ? e.message : 'Error interno'
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
