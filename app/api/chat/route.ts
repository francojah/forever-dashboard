import { requireAuth } from '@/lib/auth'
import { NextRequest, NextResponse } from 'next/server'
import Anthropic from '@anthropic-ai/sdk'
import { createClient } from '@supabase/supabase-js'

const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY })

async function getMetaContext() {
  try {
    const supabase = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!
    )
    const { data } = await supabase
      .from('meta_snapshots')
      .select('snapshot_date, summary, adsets')
      .order('snapshot_date', { ascending: false })
      .limit(1)
      .single()

    if (!data) return 'Sin datos de campañas disponibles todavía.'

    const s = data.summary
    const adsets = (data.adsets || []).filter((a: { status: string }) => a.status === 'ACTIVE')
    const adsetLines = adsets
      .map((a: { name: string; spend: number | null; roas: number | null; cost_per_result: number | null; results: number | null; optimization_goal: string; daily_budget: number | null }) =>
        `  • ${a.name}: gasto $${Math.round((a.spend || 0) / 1000)}K, ROAS ${a.roas?.toFixed(2) ?? 'N/A'}x, CPA $${a.cost_per_result ? Math.round(a.cost_per_result / 1000) + 'K' : 'N/A'}, compras ${a.results ?? 0}, budget/día $${a.daily_budget ? Math.round(a.daily_budget / 1000) + 'K' : 'N/A'} [${a.optimization_goal}]`
      )
      .join('\n')

    return `DATOS ACTUALES DE FOREVER BASICS en Meta Ads (${data.snapshot_date}):
  
Resumen últimos 7 días:
  • Gasto total: $${Math.round((s.total_spend_7d || 0) / 1000)}K ARS
  • Budget diario activo: $${Math.round((s.daily_budget_active || 0) / 1000)}K ARS
  • Compras: ${s.total_purchases_7d || 0}
  • CPA blended: $${s.blended_cpa ? Math.round(s.blended_cpa / 1000) + 'K' : 'N/A'} ARS (breakeven: $17.5K)
  • ROAS blended: ${s.blended_roas?.toFixed(2) ?? 'N/A'}x (mínimo rentable: 2.86x, objetivo: 10x)
  • Ad sets activos: ${s.active_adsets || 0}

Ad sets corriendo:
${adsetLines || '  (sin ad sets activos)'}`
  } catch {
    return 'No se pudieron cargar los datos de campañas.'
  }
}

const SYSTEM_PROMPT = `Sos un experto senior en Meta Ads y performance marketing para e-commerce de moda en Argentina. Llevás más de 10 años optimizando campañas de Facebook/Instagram Ads, con especialización en:

- Estrategia de campañas (Awareness, Conversión, Retargeting)
- Optimización de ROAS y CPA para tiendas de ropa
- Estructura de campañas (CBO vs ABO, ad sets, audiencias)
- Creativos de alto impacto para moda
- Pixel de Meta, eventos de conversión, catálogos
- Escalado de campañas sin perder eficiencia
- Análisis de métricas: ROAS, CPA, CTR, CPM, frecuencia
- Estrategias específicas para el mercado argentino
- Manejo de presupuestos en ARS durante inflación

La marca es FOREVER BASICS: ropa básica 100% algodón argentina, principalmente remeras, boxers y prendas esenciales para hombre y mujer. Ticket promedio ~$50.000 ARS. Breakeven CPA: $17.500 ARS. ROAS objetivo: 10x.

Siempre respondés en español argentino. Sos directo, usás números concretos, y dás recomendaciones accionables. Cuando el usuario pregunta algo relacionado con sus campañas, usás los datos reales que tenés disponibles. Si no tenés datos suficientes para responder con certeza, lo aclarás.

{META_CONTEXT}`

export async function POST(req: NextRequest) {
  const auth = await requireAuth()
  if (auth instanceof NextResponse) return auth

  const { messages } = await req.json()
  const metaContext = await getMetaContext()
  const systemWithContext = SYSTEM_PROMPT.replace('{META_CONTEXT}', metaContext)

  const encoder = new TextEncoder()

  const stream = new ReadableStream({
    async start(controller) {
      const response = await client.messages.create({
        model: 'claude-sonnet-4-6',
        max_tokens: 1024,
        system: systemWithContext,
        messages,
        stream: true,
      })

      for await (const event of response) {
        if (event.type === 'content_block_delta' && event.delta.type === 'text_delta') {
          controller.enqueue(encoder.encode(event.delta.text))
        }
      }
      controller.close()
    },
  })

  return new Response(stream, {
    headers: {
      'Content-Type': 'text/plain; charset=utf-8',
      'Transfer-Encoding': 'chunked',
    },
  })
}
