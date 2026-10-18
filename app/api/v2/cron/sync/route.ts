import { syncAll } from '@/lib/faro/sync'
import { rotateStoredTokens } from '@/lib/faro/tokens'

export const dynamic = 'force-dynamic'
export const maxDuration = 60

/** Llamado cada 30 minutos por GitHub Actions y una vez por día por Vercel Cron, con el CRON_SECRET. */
export async function GET(req: Request) {
  const secret = process.env.CRON_SECRET
  const auth = (req.headers.get('authorization') || '').replace(/^Bearer\s+/i, '')
  const key = new URL(req.url).searchParams.get('key') || req.headers.get('x-cron-secret') || auth
  if (!secret || key !== secret) return Response.json({ error: 'No autorizado' }, { status: 401 })
  // Si hay una clave de cifrado nueva, re-cifra los tokens guardados antes de usarlos
  const keys = await rotateStoredTokens().catch(() => null)
  const results = await syncAll(35000)
  return Response.json({ ok: true, results, keys, at: new Date().toISOString() })
}

export const POST = GET
