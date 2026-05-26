import { NextResponse } from 'next/server'
import Anthropic from '@anthropic-ai/sdk'
import { createClientServer } from '@/lib/supabase'

const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY })

export async function POST() {
  try {
    const supabase = createClientServer()

    // Fetch latest snapshot
    const { data: snapshot } = await supabase
      .from('meta_snapshots')
      .select('snapshot_date, summary, adsets')
      .order('snapshot_date', { ascending: false })
      .limit(1)
      .single()

    if (!snapshot) {
      return NextResponse.json({ error: 'Sin datos de sync todavía' }, { status: 404 })
    }

    const s = snapshot.summary
    const adsets = snapshot.adsets || []

    // Build context for Claude
    const activeAdsets = adsets.filter((a: { status: string }) => a.status === 'ACTIVE')
    const adsetLines = activeAdsets
      .map((a: { name: string; spend: number | null; roas: number | null; cost_per_result: number | null; results: number | null; optimization_goal: string }) =>
        `- ${a.name}: gasto $${Math.round((a.spend || 0) / 1000)}K, ROAS ${a.roas?.toFixed(2) ?? 'N/A'}x, CPA $${a.cost_per_result ? Math.round(a.cost_per_result / 1000) + 'K' : 'N/A'}, compras ${a.results ?? 0} [${a.optimization_goal}]`
      )
      .join('\n')

    const prompt = `Sos el analista de performance de FOREVER BASICS, una marca argentina de ropa básica 100% algodón. Analizá los datos de Meta Ads de los últimos 7 días y generá un resumen ejecutivo claro y accionable.

MÉTRICAS GENERALES (últimos 7 días):
- Gasto total: $${Math.round((s.total_spend_7d || 0) / 1000)}K ARS
- Budget diario activo: $${Math.round((s.daily_budget_active || 0) / 1000)}K ARS
- Compras totales: ${s.total_purchases_7d || 0}
- CPA blended: $${s.blended_cpa ? Math.round(s.blended_cpa / 1000) + 'K' : 'N/A'} ARS (breakeven: $17.5K)
- ROAS blended: ${s.blended_roas?.toFixed(2) ?? 'N/A'}x (mínimo rentable: 2.86x, objetivo: 10x)
- Ad sets activos: ${s.active_adsets || 0}

AD SETS ACTIVOS:
${adsetLines || '(sin ad sets activos)'}

Generá un resumen en español con este formato exacto:

## Resumen del día — ${snapshot.snapshot_date}

**📊 Situación general**
[1-2 oraciones sobre el estado general de la cuenta. ¿Está rentable? ¿Preocupante?]

**✅ Lo que está funcionando**
[Máximo 3 puntos concretos sobre ad sets o métricas positivas]

**⚠️ Alertas y riesgos**
[Máximo 3 puntos sobre lo que hay que atender hoy]

**🎯 Acciones recomendadas**
[Máximo 3 acciones concretas y específicas para hoy]

**💡 Insight clave**
[1 observación estratégica importante]

Sé directo, usa números concretos, y enfocate en decisiones accionables. No repitas datos que ya están en el dashboard.`

    const message = await client.messages.create({
      model: 'claude-haiku-4-5-20251001',
      max_tokens: 800,
      messages: [{ role: 'user', content: prompt }],
    })

    const text = (message.content[0] as { type: string; text: string }).text

    // Save to Supabase for caching
    await supabase
      .from('ai_resumenes')
      .upsert({
        resumen_date: snapshot.snapshot_date,
        content: text,
        created_at: new Date().toISOString(),
      }, { onConflict: 'resumen_date' })

    return NextResponse.json({ content: text, date: snapshot.snapshot_date })
  } catch (err) {
    console.error('ai-resumen error:', err)
    return NextResponse.json({ error: 'Error generando resumen' }, { status: 500 })
  }
}

export async function GET() {
  try {
    const supabase = createClientServer()

    // Try to get today's cached resumen
    const { data } = await supabase
      .from('ai_resumenes')
      .select('*')
      .order('resumen_date', { ascending: false })
      .limit(1)
      .single()

    if (data) {
      return NextResponse.json({ content: data.content, date: data.resumen_date, cached: true })
    }

    return NextResponse.json({ content: null })
  } catch {
    return NextResponse.json({ content: null })
  }
}
