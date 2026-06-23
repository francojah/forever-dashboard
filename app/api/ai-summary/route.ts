import { NextRequest, NextResponse } from 'next/server'
import Anthropic from '@anthropic-ai/sdk'

// Node.js runtime required — Anthropic SDK uses Node-only APIs
export const revalidate = 0

// Claude Haiku daily dashboard summary
// POST body: { spend, purchases, roas, cpa, tnRevenue, topAdset, alerts, period }
export async function POST(req: NextRequest) {
  try {
    const body = await req.json() as {
      spend?: number
      purchases?: number
      roas?: number | null
      cpa?: number | null
      tnRevenue?: number | null
      topAdset?: string | null
      alerts?: { message: string; severity: string }[]
      period?: string
      breakeven?: number
      dailyBudget?: number
      activeAdsets?: number
    }

    const apiKey = process.env.ANTHROPIC_API_KEY
    if (!apiKey) {
      return NextResponse.json({ error: 'No ANTHROPIC_API_KEY' }, { status: 500 })
    }

    const client = new Anthropic({ apiKey })

    const {
      spend = 0, purchases = 0, roas = null, cpa = null,
      tnRevenue = null, topAdset = null,
      alerts = [], period = '7d',
      breakeven = 17500, dailyBudget = 0, activeAdsets = 0,
    } = body

    const roasStr   = roas ? roas.toFixed(2) + 'x' : 'sin datos'
    const cpaStr    = cpa ? '$' + Math.round(cpa).toLocaleString('es-AR') : 'sin datos'
    const revStr    = tnRevenue ? '$' + Math.round(tnRevenue).toLocaleString('es-AR') : 'sin datos'
    const spendStr  = '$' + Math.round(spend).toLocaleString('es-AR')
    const alertsStr = alerts.length > 0 ? alerts.map(a => `- ${a.message} (${a.severity})`).join('\n') : 'ninguna'

    const prompt = `Sos el asistente de Forever Basics, una marca de ropa (remeras y lencería) en Argentina.
Analiza estos datos del período "${period}" y generá un resumen ejecutivo en 2-3 oraciones en español.
Sé concreto, usa los números, y terminá con una recomendación accionable para hoy.

DATOS:
- Gasto Meta: ${spendStr} ARS
- ROAS real: ${roasStr}
- Ventas Tiendanube: ${revStr} ARS
- Compras pixel: ${purchases}
- CPA blended: ${cpaStr} (breakeven: $${Math.round(breakeven).toLocaleString('es-AR')})
- Budget/día activo: $${Math.round(dailyBudget).toLocaleString('es-AR')}
- Ad sets activos: ${activeAdsets}
- Mejor ad set: ${topAdset ?? 'sin datos'}
- Alertas activas:
${alertsStr}

IMPORTANTE: Máximo 3 oraciones. Sé directo y accionable. No uses markdown, listas ni bullets.`

    const message = await client.messages.create({
      model: 'claude-haiku-4-5-20251001',
      max_tokens: 200,
      messages: [{ role: 'user', content: prompt }],
    })

    const text = message.content[0].type === 'text' ? message.content[0].text : ''
    return NextResponse.json({ summary: text })
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'Error'
    return NextResponse.json({ error: msg }, { status: 500 })
  }
}
