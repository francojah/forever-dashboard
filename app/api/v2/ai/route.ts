import { apiContext } from '@/lib/faro/context'
import { runAdvisor, aiConfigured } from '@/lib/faro/ai'

export const dynamic = 'force-dynamic'
export const maxDuration = 60

/** Analiza la cuenta y la tienda con IA y devuelve un plan de acción. */
export async function POST() {
  const ctx = await apiContext()
  if (ctx instanceof Response) return ctx
  if (!aiConfigured()) return Response.json({ error: 'Falta configurar ANTHROPIC_API_KEY en Vercel' }, { status: 400 })
  try {
    const out = await runAdvisor(ctx, ctx.user.id)
    return Response.json(out)
  } catch (e) {
    return Response.json({ error: e instanceof Error ? e.message : 'Error' }, { status: 500 })
  }
}
