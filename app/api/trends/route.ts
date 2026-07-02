import { NextResponse } from 'next/server'
import { createClientServer } from '@/lib/supabase'

export const dynamic = 'force-dynamic'

/**
 * GET /api/trends
 * Series temporales desde metrics_daily (tabla plana).
 *
 * Query params:
 *   entity_type = account | campaign | adset | ad   (default: account)
 *   entity_id   = id específico (opcional; si se omite, agrega todo)
 *   metric      = spend | roas | cost_per_result | results | ctr | impressions | clicks
 *   days        = ventana en días (default 30)
 *   period      = day | last_7d | last_30d (default day)
 *
 * Devuelve: { series: [{ date, value, entity_id?, entity_name? }], metric }
 *
 * Nota: métricas de tasa/ratio (roas, cost_per_result, ctr) se promedian
 * ponderadas por gasto cuando se agregan; los volúmenes se suman.
 */

const RATE_METRICS = new Set(['roas', 'cost_per_result', 'ctr', 'frequency', 'hook_rate', 'view_rate'])
const VALID_METRICS = new Set([
  'spend', 'roas', 'cost_per_result', 'results',
  'ctr', 'impressions', 'clicks', 'frequency', 'hook_rate', 'view_rate',
])

export async function GET(req: Request) {
  const { searchParams } = new URL(req.url)
  const entityType = searchParams.get('entity_type') || 'account'
  const entityId = searchParams.get('entity_id')
  const metric = searchParams.get('metric') || 'spend'
  const period = searchParams.get('period') || 'day'
  const days = Math.min(Math.max(parseInt(searchParams.get('days') || '30', 10), 1), 365)

  if (!VALID_METRICS.has(metric)) {
    return NextResponse.json({ error: `Métrica inválida: ${metric}` }, { status: 400 })
  }

  const since = new Date()
  since.setDate(since.getDate() - days)
  const sinceStr = since.toISOString().split('T')[0]

  const supabase = createClientServer()
  let query = supabase
    .from('metrics_daily')
    .select('metric_date, entity_id, entity_name, spend, ' + metric)
    .eq('period', period)
    .gte('metric_date', sinceStr)
    .order('metric_date', { ascending: true })

  // 'account' = agregado de todos los adsets (evita doble conteo de campaign+adset+ad)
  const typeForQuery = entityType === 'account' ? 'adset' : entityType
  query = query.eq('entity_type', typeForQuery)
  if (entityId) query = query.eq('entity_id', entityId)

  const { data, error } = await query
  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  // Agregación por fecha
  const byDate = new Map<string, { sum: number; weight: number; count: number }>()
  for (const row of (data || []) as unknown as Record<string, number | string>[]) {
    const date = row.metric_date as string
    const val = row[metric] as number | null
    if (val == null) continue
    const spend = (row.spend as number) || 0
    const acc = byDate.get(date) || { sum: 0, weight: 0, count: 0 }
    if (RATE_METRICS.has(metric)) {
      // promedio ponderado por gasto (si no hay gasto, promedio simple)
      acc.sum += val * (spend || 1)
      acc.weight += spend || 1
    } else {
      acc.sum += val
    }
    acc.count += 1
    byDate.set(date, acc)
  }

  const series = Array.from(byDate.entries()).map(([date, acc]) => ({
    date,
    value: RATE_METRICS.has(metric)
      ? parseFloat((acc.sum / (acc.weight || 1)).toFixed(2))
      : Math.round(acc.sum * 100) / 100,
  }))

  return NextResponse.json({ metric, period, entity_type: entityType, entity_id: entityId, days, series })
}
