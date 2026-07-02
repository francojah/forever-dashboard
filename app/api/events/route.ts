import { NextResponse } from 'next/server'
import { createClientServer } from '@/lib/supabase'

export const dynamic = 'force-dynamic'

/**
 * GET /api/events?days=30
 * Eventos/cambios para anotar sobre los gráficos (líneas verticales).
 * Fuente: ad_change_log (pausas, activaciones, cambios de budget, etc.).
 */

type LogRow = {
  entity_type: string | null
  entity_name: string | null
  action: string | null
  created_at: string
}

const ACTION_LABEL: Record<string, string> = {
  pause: 'Pausa',
  activate: 'Activación',
  set_budget: 'Cambio budget',
  duplicate: 'Duplicado',
  create: 'Nuevo',
}

export async function GET(req: Request) {
  const { searchParams } = new URL(req.url)
  const days = Math.min(Math.max(parseInt(searchParams.get('days') || '30', 10), 1), 365)
  const since = new Date()
  since.setDate(since.getDate() - days)

  const supabase = createClientServer()
  const { data, error } = await supabase
    .from('ad_change_log')
    .select('entity_type, entity_name, action, created_at')
    .gte('created_at', since.toISOString())
    .order('created_at', { ascending: true })

  if (error) {
    // Tabla puede no existir; devolvemos vacío en vez de romper el gráfico.
    return NextResponse.json({ events: [] })
  }

  const rows = (data || []) as unknown as LogRow[]
  const events = rows.map((r) => ({
    date: r.created_at.slice(0, 10),
    action: r.action || 'change',
    label: `${ACTION_LABEL[r.action || ''] || r.action || 'Cambio'}${r.entity_name ? ' · ' + r.entity_name : ''}`,
  }))

  return NextResponse.json({ events })
}
