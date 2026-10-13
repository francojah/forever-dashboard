import { apiContext } from '@/lib/faro/context'
import { svc } from '@/lib/faro/db'
import { normalizePhone, sendWhatsApp, whatsappConfigured } from '@/lib/faro/whatsapp'
import { dailySummary } from '@/lib/faro/notify'

export const dynamic = 'force-dynamic'
export const maxDuration = 60
const MISSING = 'Falta correr la migración 20261014_whatsapp.sql'
const errMsg = (m: string) => (/does not exist|Could not find/i.test(m) ? MISSING : m)

/** Mi número y preferencias de avisos en este negocio. */
export async function GET() {
  const ctx = await apiContext()
  if (ctx instanceof Response) return ctx
  const { data, error } = await svc().from('notify_contacts').select('phone,daily,alerts').eq('workspace_id', ctx.workspace.id).eq('user_id', ctx.user.id).maybeSingle()
  if (error) return Response.json({ contact: null, missing: /does not exist|Could not find/i.test(error.message), configured: whatsappConfigured() })
  return Response.json({ contact: data, configured: whatsappConfigured() })
}

/** Guardar: { phone, daily, alerts }. phone vacío borra. */
export async function PUT(req: Request) {
  const ctx = await apiContext()
  if (ctx instanceof Response) return ctx
  const b = await req.json().catch(() => ({})) as { phone?: string; daily?: boolean; alerts?: boolean }
  const raw = String(b.phone || '').trim()
  if (!raw) {
    const { error } = await svc().from('notify_contacts').delete().eq('workspace_id', ctx.workspace.id).eq('user_id', ctx.user.id)
    return error ? Response.json({ error: errMsg(error.message) }, { status: 500 }) : Response.json({ ok: true, phone: null })
  }
  const phone = normalizePhone(raw)
  if (!phone) return Response.json({ error: 'Número inválido. Escribilo con código de área, por ejemplo 11 2345 6789.' }, { status: 400 })
  const { error } = await svc().from('notify_contacts').upsert({ workspace_id: ctx.workspace.id, user_id: ctx.user.id, phone, daily: b.daily !== false, alerts: b.alerts !== false, updated_at: new Date().toISOString() }, { onConflict: 'workspace_id,user_id' })
  if (error) return Response.json({ error: errMsg(error.message) }, { status: 500 })
  return Response.json({ ok: true, phone })
}

/** Envío de prueba: el resumen de ayer a mi número. */
export async function POST() {
  const ctx = await apiContext()
  if (ctx instanceof Response) return ctx
  if (!whatsappConfigured()) return Response.json({ error: 'WhatsApp todavía no está configurado en Faro.' }, { status: 400 })
  const { data } = await svc().from('notify_contacts').select('phone').eq('workspace_id', ctx.workspace.id).eq('user_id', ctx.user.id).maybeSingle()
  if (!data?.phone) return Response.json({ error: 'Primero guardá tu número.' }, { status: 400 })
  const d = await dailySummary(ctx.workspace.id)
  const r = await sendWhatsApp(data.phone, ctx.workspace.name, d?.text || 'Prueba de avisos de Faro. Todo listo.')
  return r.ok ? Response.json({ ok: true, preview: d?.text }) : Response.json({ error: r.error }, { status: 500 })
}
