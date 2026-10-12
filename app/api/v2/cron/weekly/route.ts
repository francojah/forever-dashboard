import { svc } from '@/lib/faro/db'
import { normalizeSettings } from '@/lib/faro/settings'
import { loadWeekly, renderWeekly, weeklyRecipients } from '@/lib/faro/weekly'
import { sendMail, mailConfigured } from '@/lib/faro/mailer'

export const dynamic = 'force-dynamic'
export const maxDuration = 300

const APP = process.env.FARO_URL || 'https://forever-dashboard.vercel.app'

/** Lunes a la mañana: manda el resumen semanal a cada negocio que lo tenga prendido. */
export async function GET(req: Request) {
  const secret = process.env.CRON_SECRET
  const auth = (req.headers.get('authorization') || '').replace(/^Bearer\s+/i, '')
  if (!secret || auth !== secret) return Response.json({ error: 'No autorizado' }, { status: 401 })
  if (!mailConfigured()) return Response.json({ ok: false, error: 'Mail sin configurar' })
  const { data: ws } = await svc().from('workspaces').select('id,name,settings')
  const results: { workspace: string; ok: boolean; error?: string }[] = []
  for (const w of ws || []) {
    if (!normalizeSettings(w.settings).weekly_email) continue
    try {
      const d = await loadWeekly(w.id)
      if (!d || (d.cur.sales.orders === 0 && d.cur.ads.spend === 0)) continue
      const to = await weeklyRecipients(w.id)
      const r = await sendMail({ to, ...renderWeekly(d, APP) })
      results.push({ workspace: w.name, ...r })
    } catch (e) { results.push({ workspace: w.name, ok: false, error: e instanceof Error ? e.message : 'Error' }) }
  }
  return Response.json({ ok: true, results })
}
