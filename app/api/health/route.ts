import { NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

export const dynamic = 'force-dynamic'

/**
 * GET /api/health
 * Estado de salud de la app: última corrida de sync, antigüedad del snapshot
 * y disponibilidad de la base. Pensado para monitoreo (UptimeRobot, etc.) y
 * para la vista de estado en Settings.
 *
 * Devuelve 200 si todo OK, 503 si el último sync falló o el snapshot está viejo.
 */
export async function GET() {
  const startedAt = Date.now()
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY

  const checks: Record<string, unknown> = {}
  let healthy = true
  let snapshotCreatedAt = 0

  if (!url || !key) {
    return NextResponse.json(
      { status: 'error', message: 'Faltan variables de entorno de Supabase', checks },
      { status: 503 }
    )
  }

  const supabase = createClient(url, key)

  // 1) Último snapshot de Meta
  try {
    const { data } = await supabase
      .from('meta_snapshots')
      .select('snapshot_date, created_at')
      .order('snapshot_date', { ascending: false })
      .limit(1)
      .single()
    if (data) {
      snapshotCreatedAt = new Date(data.created_at).getTime()
      const ageHours = (Date.now() - snapshotCreatedAt) / 3_600_000
      const stale = ageHours > 30 // el cron corre cada 24h; margen de 6h
      if (stale) healthy = false
      checks.meta_snapshot = {
        date: data.snapshot_date,
        age_hours: Math.round(ageHours * 10) / 10,
        stale,
      }
    } else {
      healthy = false
      checks.meta_snapshot = { error: 'sin snapshots' }
    }
  } catch (e) {
    healthy = false
    checks.meta_snapshot = { error: (e as Error).message }
  }

  // 2) Última corrida de sync (si existe la tabla)
  try {
    const { data } = await supabase
      .from('sync_runs')
      .select('source, status, duration_ms, error, created_at')
      .order('created_at', { ascending: false })
      .limit(5)
    if (data && data.length) {
      const last = data[0]
      const lastErrorRun = data.find((r) => r.status === 'error')
      // Solo se considera degradado si la última corrida falló Y no hubo un
      // snapshot exitoso posterior (es decir, el sistema NO se recuperó).
      const errorNewerThanSnapshot =
        last.status === 'error' && new Date(last.created_at).getTime() > snapshotCreatedAt
      if (errorNewerThanSnapshot) healthy = false
      checks.last_runs = data
      // Mostramos el último error como informativo, marcando si ya se resolvió
      if (lastErrorRun) {
        const resolved = new Date(lastErrorRun.created_at).getTime() < snapshotCreatedAt
        checks.last_error = resolved ? `(resuelto) ${lastErrorRun.error}` : lastErrorRun.error
      }
    }
  } catch {
    // tabla puede no existir aún; no es fatal
    checks.sync_runs = 'no disponible'
  }

  return NextResponse.json(
    {
      status: healthy ? 'ok' : 'degraded',
      response_ms: Date.now() - startedAt,
      timestamp: new Date().toISOString(),
      checks,
    },
    { status: healthy ? 200 : 503 }
  )
}
