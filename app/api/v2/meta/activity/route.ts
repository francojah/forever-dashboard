import { apiContext } from '@/lib/faro/context'
import { loadActivities } from '@/lib/faro/activity'

export const dynamic = 'force-dynamic'
export const maxDuration = 60

/** Cambios hechos en Meta por cualquier usuario o app (Ads Manager incluido). */
export async function GET(req: Request) {
  const ctx = await apiContext()
  if (ctx instanceof Response) return ctx
  const days = Math.min(90, Math.max(1, Number(new URL(req.url).searchParams.get('days')) || 14))
  return Response.json(await loadActivities(ctx, days))
}
