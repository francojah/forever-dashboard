import { apiContext } from '@/lib/faro/context'
import { ask } from '@/lib/faro/ask'
import { aiConfigured } from '@/lib/faro/ai'

export const dynamic = 'force-dynamic'
export const maxDuration = 120

export async function POST(req: Request) {
  const ctx = await apiContext()
  if (ctx instanceof Response) return ctx
  if (!aiConfigured()) return Response.json({ error: 'La IA no está configurada en Faro.' }, { status: 400 })
  const b = await req.json().catch(() => ({})) as { question?: string }
  const q = String(b.question || '').trim()
  if (q.length < 3) return Response.json({ error: 'Escribí una pregunta.' }, { status: 400 })
  try { return Response.json(await ask(ctx, q)) } catch (e) { return Response.json({ error: e instanceof Error ? e.message : 'No se pudo responder' }, { status: 500 }) }
}
