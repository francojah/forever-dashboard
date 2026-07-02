import { NextResponse } from 'next/server'
import Anthropic from '@anthropic-ai/sdk'
import { createClientServer } from '@/lib/supabase'

const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY })

export async function POST() {
  try {
    const supabase = createClientServer()

    // Fetch latest snapshot with all period data
    const { data: snapshot } = await supabase
      .from('meta_snapshots')
      .select('snapshot_date, summary, adsets, periods')
      .order('snapshot_date', { ascending: false })
      .limit(1)
      .single()

    if (!snapshot) {
      return NextResponse.json({ error: 'Sin datos de sync todavía' }, { status: 404 })
    }

    const s7d  = snapshot.summary                           // last_7d (always available)
    const sHoy = snapshot.periods?.today?.summary ?? null
    const s30d = snapshot.periods?.last_30d?.summary ?? null
    const adsets = snapshot.adsets || []

    // Active adsets with 7d metrics
    const activeAdsets = adsets.filter((a: { status: string }) => a.status === 'ACTIVE')
    const adsetLines = activeAdsets
      .map((a: { name: string; spend: number | null; roas: number | null; cost_per_result: number | null; results: number | null; optimization_goal: string }) =>
        `- ${a.name}: gasto $${Math.round((a.spend || 0) / 1000)}K, ROAS ${a.roas?.toFixed(2) ?? 'N/A'}x, CPA $${a.cost_per_result ? Math.round(a.cost_per_result / 1000) + 'K' : 'N/A'}, compras ${a.results ?? 0} [${a.optimization_goal}]`
      )
      .join('\n')

    const todayBlock = sHoy
      ? `HOY (parcial, datos de Meta con ventana de atribución):
- Gasto: $${Math.round((sHoy.total_spend_7d || 0) / 1000)}K ARS
- Compras atribuidas: ${sHoy.total_purchases_7d || 0}
- ROAS: ${sHoy.blended_roas?.toFixed(2) ?? 'N/A'}x
- CPA: $${sHoy.blended_cpa ? Math.round(sHoy.blended_cpa / 1000) + 'K' : 'N/A'}`
      : 'HOY: sin datos (ejecutá un sync para obtenerlos)'

    const thirtyDayBlock = s30d
      ? `ÚLTIMOS 30 DÍAS:
- Gasto: $${Math.round((s30d.total_spend_7d || 0) / 1000)}K ARS
- Compras: ${s30d.total_purchases_7d || 0}
- ROAS blend: ${s30d.blended_roas?.toFixed(2) ?? 'N/A'}x
- CPA blend: $${s30d.blended_cpa ? Math.round(s30d.blended_cpa / 1000) + 'K' : 'N/A'}`
      : 'ÚLTIMOS 30 DÍAS: sin datos'

    const prompt = `Sos el analista de performance de FOREVER BASICS, una marca argentina de ropa básica 100% algodón. Analizá los datos de Meta Ads y generá un resumen ejecutivo integral que cubra hoy, la semana y el mes.

━━━ DATOS META ADS ━━━

${todayBlock}

ÚLTIMOS 7 DÍAS:
- Gasto total: $${Math.round((s7d.total_spend_7d || 0) / 1000)}K ARS
- Budget diario activo: $${Math.round((s7d.daily_budget_active || 0) / 1000)}K ARS
- Compras: ${s7d.total_purchases_7d || 0}
- CPA blended: $${s7d.blended_cpa ? Math.round(s7d.blended_cpa / 1000) + 'K' : 'N/A'} ARS (breakeven: $30.5K)
- ROAS blended: ${s7d.blended_roas?.toFixed(2) ?? 'N/A'}x (mínimo: 1.77x · objetivo: 10x)
- Ad sets activos: ${s7d.active_adsets || 0}

${thirtyDayBlock}

AD SETS ACTIVOS (datos 7d):
${adsetLines || '(sin ad sets activos)'}

━━━━━━━━━━━━━━━━━━━━━━━

Generá un resumen en español con este formato exacto:

## Resumen — ${snapshot.snapshot_date}

**📅 Hoy**
[2-3 oraciones sobre la performance del día. Si el ROAS de hoy parece muy alto, aclará que puede deberse a la ventana de atribución de Meta.]

**📊 Semana (7 días)**
[2-3 oraciones sobre tendencia semanal. ¿Está mejorando o empeorando vs el mes?]

**📈 Mes (30 días)**
[1-2 oraciones de contexto mensual. ¿El negocio está escalando? ¿Estable?]

**✅ Lo que está funcionando**
[Máximo 3 puntos concretos con números]

**⚠️ Alertas y riesgos**
[Máximo 3 puntos sobre lo que hay que atender]

**🎯 Acciones para hoy**
[Máximo 3 acciones concretas y específicas]

Sé directo, usá números reales, evitá generalidades.`

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
