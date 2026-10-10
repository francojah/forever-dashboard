import { syncAll } from '@/lib/faro/sync'

export const dynamic = 'force-dynamic'
export const maxDuration = 60

/** Llamado cada 30 minutos por GitHub Actions y una vez por día por Vercel Cron, con el CRON_SECRET. */
export async function GET(req: Request) {
  const secret = process.env.CRON_SECRET
  const auth = (req.headers.get('authorization') || '').replace(/^Bearer\s+/i, '')
  const key = new URL(req.url).searchParams.get('key') || req.headers.get('x-cron-secret') || auth
  if (!secret || key !== secret) return Response.json({ error: 'No autorizado' }, { status: 401 })
  const results = await syncAll(35000)
  return Response.json({ ok: true, results, at: new Date().toISOString() })
}

export const POST = GET
