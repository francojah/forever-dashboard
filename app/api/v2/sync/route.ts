import { apiContext } from '@/lib/faro/context'
import { syncWorkspace } from '@/lib/faro/sync'

export const dynamic = 'force-dynamic'
export const maxDuration = 60

/** Sincronización incremental del espacio activo. Si se sincronizó hace < 2 min, no hace nada (salvo force). */
export async function POST(req: Request) {
  const ctx = await apiContext()
  if (ctx instanceof Response) return ctx
  let force = false
  try { force = !!(await req.json())?.force } catch { /* sin body */ }
  const results = await syncWorkspace(ctx.workspace.id, { budgetMs: 35000, minAgeMs: force ? 0 : 120000, forceEntities: force })
  return Response.json({ ok: results.every((r) => r.ok), results, at: new Date().toISOString() })
}
