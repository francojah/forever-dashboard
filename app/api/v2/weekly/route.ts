import { apiContext } from '@/lib/faro/context'
import { loadWeekly, renderWeekly } from '@/lib/faro/weekly'
import { sendMail, mailConfigured } from '@/lib/faro/mailer'

export const dynamic = 'force-dynamic'
export const maxDuration = 120

/** Vista previa del resumen semanal (GET devuelve el HTML) o envío de prueba solo a quien lo pide (POST). */
export async function GET(req: Request) {
  const ctx = await apiContext()
  if (ctx instanceof Response) return ctx
  const d = await loadWeekly(ctx.workspace.id)
  if (!d) return new Response('Conectá tu tienda o tu cuenta de Meta para ver el resumen.', { status: 404 })
  return new Response(renderWeekly(d, new URL(req.url).origin).html, { headers: { 'Content-Type': 'text/html; charset=utf-8' } })
}

export async function POST(req: Request) {
  const ctx = await apiContext()
  if (ctx instanceof Response) return ctx
  if (!mailConfigured()) return Response.json({ error: 'El envío de mails todavía no está configurado en Faro. Podés ver la vista previa.' }, { status: 400 })
  const d = await loadWeekly(ctx.workspace.id)
  if (!d) return Response.json({ error: 'Conectá tu tienda o tu cuenta de Meta primero.' }, { status: 400 })
  const r = await sendMail({ to: [ctx.user.email], ...renderWeekly(d, new URL(req.url).origin) })
  return r.ok ? Response.json({ ok: true, to: ctx.user.email }) : Response.json({ error: r.error }, { status: 500 })
}
