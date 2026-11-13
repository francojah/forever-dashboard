import { runAudienceSyncs } from '@/lib/faro/audienceSync'
import { apiContext, canEdit } from '@/lib/faro/context'

export const dynamic = 'force-dynamic'
export const maxDuration = 60

/**
 * Actualiza los públicos de clientes en Meta (tabla audience_syncs).
 * Vercel Cron una vez por día con el CRON_SECRET (todos los espacios),
 * o un usuario con permiso de edición desde Faro (solo su espacio).
 */
export async function GET(req: Request) {
  const secret = process.env.CRON_SECRET
  const auth = (req.headers.get('authorization') || '').replace(/^Bearer\s+/i, '')
  const key = new URL(req.url).searchParams.get('key') || req.headers.get('x-cron-secret') || auth
  if (secret && key === secret) return Response.json({ ok: true, results: await runAudienceSyncs(), at: new Date().toISOString() })
  const ctx = await apiContext()
  if (ctx instanceof Response) return ctx
  if (!canEdit(ctx)) return Response.json({ error: 'Tu rol es de solo lectura' }, { status: 403 })
  return Response.json({ ok: true, results: await runAudienceSyncs(ctx.workspace.id), at: new Date().toISOString() })
}

export const POST = GET
