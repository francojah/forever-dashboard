import { runNotifications } from '@/lib/faro/notify'

export const dynamic = 'force-dynamic'
export const maxDuration = 120

/** Avisos por WhatsApp. ?kind=daily (mañana) o ?kind=alerts (cada media hora, después del sync). */
export async function GET(req: Request) {
  const secret = process.env.CRON_SECRET
  const auth = (req.headers.get('authorization') || '').replace(/^Bearer\s+/i, '')
  if (!secret || auth !== secret) return Response.json({ error: 'No autorizado' }, { status: 401 })
  const kind = new URL(req.url).searchParams.get('kind') === 'daily' ? 'daily' : 'alerts'
  const results = await runNotifications(kind)
  return Response.json({ ok: true, kind, results })
}
