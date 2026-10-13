import { apiContext, canEdit } from '@/lib/faro/context'
import { loadWeekly, renderWeekly, weeklyRecipients, logMail } from '@/lib/faro/weekly'
import { sendMail, mailConfigured } from '@/lib/faro/mailer'
import { svc } from '@/lib/faro/db'

export const dynamic = 'force-dynamic'
export const maxDuration = 120
const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/

/** Vista previa del resumen (HTML). ?week=YYYY-MM-DD elige el último día de la semana. ?log=1 devuelve el historial de envíos. */
export async function GET(req: Request) {
  const ctx = await apiContext()
  if (ctx instanceof Response) return ctx
  const q = new URL(req.url).searchParams
  if (q.get('log')) {
    const { data, error } = await svc().from('mail_log').select('kind,week_to,recipients,ok,error,sent_by,sent_at').eq('workspace_id', ctx.workspace.id).order('sent_at', { ascending: false }).limit(20)
    const team = await weeklyRecipients(ctx.workspace.id)
    return Response.json({ log: error ? [] : data, missing: !!error && /does not exist|Could not find/i.test(error.message), team, configured: mailConfigured() })
  }
  const d = await loadWeekly(ctx.workspace.id, new Date(), q.get('week') || undefined)
  if (!d) return new Response('Conectá tu tienda o tu cuenta de Meta para ver el resumen.', { status: 404 })
  return new Response(renderWeekly(d, new URL(req.url).origin).html, { headers: { 'Content-Type': 'text/html; charset=utf-8' } })
}

/** Envío manual: { to: 'me' | 'team' | string[], week?: 'YYYY-MM-DD' } */
export async function POST(req: Request) {
  const ctx = await apiContext()
  if (ctx instanceof Response) return ctx
  if (!mailConfigured()) return Response.json({ error: 'El envío de mails todavía no está configurado en Faro. Podés ver la vista previa.' }, { status: 400 })
  const b = await req.json().catch(() => ({})) as { to?: 'me' | 'team' | string[]; week?: string }
  let to: string[]
  if (Array.isArray(b.to)) {
    if (!canEdit(ctx)) return Response.json({ error: 'Tu rol es de solo lectura: solo podés enviártelo a vos.' }, { status: 403 })
    to = Array.from(new Set(b.to.map((e) => String(e).trim().toLowerCase()).filter((e) => EMAIL.test(e)))).slice(0, 20)
    if (!to.length) return Response.json({ error: 'Escribí al menos un mail válido.' }, { status: 400 })
  } else if (b.to === 'team') {
    if (!canEdit(ctx)) return Response.json({ error: 'Tu rol es de solo lectura: solo podés enviártelo a vos.' }, { status: 403 })
    to = await weeklyRecipients(ctx.workspace.id)
    if (!to.length) return Response.json({ error: 'No hay dueños ni editores con mail en este negocio.' }, { status: 400 })
  } else to = [ctx.user.email]
  const d = await loadWeekly(ctx.workspace.id, new Date(), b.week)
  if (!d) return Response.json({ error: 'Conectá tu tienda o tu cuenta de Meta primero.' }, { status: 400 })
  const r = await sendMail({ to, ...renderWeekly(d, new URL(req.url).origin) })
  await logMail(ctx.workspace.id, { kind: b.to === 'team' ? 'semanal-equipo' : Array.isArray(b.to) ? 'semanal-otros' : 'semanal-prueba', week_to: d.to, recipients: to, ok: r.ok, error: r.error, by: ctx.user.email })
  return r.ok ? Response.json({ ok: true, to, week: { from: d.from, to: d.to } }) : Response.json({ error: r.error }, { status: 500 })
}
