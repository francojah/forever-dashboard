import Anthropic from '@anthropic-ai/sdk'
import type { Snapshot } from './supabase'

const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY })

const BRAND_CONTEXT = `
Sos el asistente de publicidad de FOREVER BASICS, marca argentina de básicos 100% algodón.
Datos clave del negocio:
- AOV: ~$50,000 ARS
- Breakeven CPA: $17,500 ARS
- ROAS target: 10x (actual: ~4-5x)
- Audiencia: hombres y mujeres 18-35 Argentina
- Productos: remeras, boxers, básicos oversize, mix & match
- Estética: minimalista, calidad visible, precio justo
- Plataforma: Meta Ads (Instagram + Facebook)
`.trim()

// ── Generador de ideas de contenido (rebuild) ─────────────────
export interface CreativeAnalysis {
  what_works: string          // análisis de qué está funcionando
  what_fails: string          // análisis de qué no está funcionando
  patterns: string[]          // patrones detectados en los top performers
  top_products: string[]      // productos que más venden (de TN)
  ideas: Array<{
    title: string
    description: string       // qué filmar exactamente
    hook: string              // los primeros 3 segundos
    format: 'video' | 'image' | 'reel' | 'carousel' | 'story'
    priority: 'high' | 'medium' | 'low'
    based_on: string          // insight de los datos
    cta: string               // llamado a la acción sugerido
  }>
}

export async function generateCreativeIdeas(
  snapshot: Snapshot,
  tnData?: {
    top_products: { name: string; quantity: number; revenue: number }[]
    aov: number
    total_orders: number
  } | null
): Promise<CreativeAnalysis> {
  const { summary, ads } = snapshot

  const topAds = [...ads]
    .filter(a => a.roas && a.spend && a.status === 'ACTIVE')
    .sort((a, b) => (b.roas || 0) - (a.roas || 0))
    .slice(0, 6)

  const worstAds = [...ads]
    .filter(a => a.spend && a.spend > 3000 && a.status === 'ACTIVE' && (!a.results || a.results === 0))
    .sort((a, b) => (b.spend || 0) - (a.spend || 0))
    .slice(0, 4)

  const goodAds = [...ads]
    .filter(a => a.roas && (a.roas >= 3) && a.status === 'ACTIVE')
    .sort((a, b) => (b.spend || 0) - (a.spend || 0))

  const topProductsStr = tnData?.top_products
    ? tnData.top_products.slice(0, 5).map(p => `${p.name} (${p.quantity} uds, $${p.revenue.toLocaleString('es-AR')})`).join(', ')
    : 'sin datos de Tiendanube'

  const prompt = `${BRAND_CONTEXT}

MÉTRICAS META ADS — ÚLTIMOS 7 DÍAS:
- Gasto: $${summary.total_spend_7d?.toLocaleString('es-AR')} ARS
- Compras atribuidas: ${summary.total_purchases_7d}
- CPA blended: $${summary.blended_cpa?.toLocaleString('es-AR') ?? 'N/A'} ARS
- ROAS blended: ${summary.blended_roas ?? 'N/A'}x

TOP CREATIVOS ACTIVOS (mayor ROAS):
${topAds.length > 0 ? topAds.map(a => `- "${a.name}": ROAS ${a.roas}x, CPA $${a.cost_per_result ? Math.round(a.cost_per_result / 1000) : '?'}K, ${a.results || 0} compras, $${Math.round((a.spend || 0) / 1000)}K gastado`).join('\n') : '- Sin creativos con ROAS disponible'}

CREATIVOS ACTIVOS SIN CONVERSIÓN (quemando plata):
${worstAds.length > 0 ? worstAds.map(a => `- "${a.name}": $${Math.round((a.spend || 0) / 1000)}K gastado, 0 compras`).join('\n') : '- Ninguno'}

CREATIVOS CON ROAS POSITIVO:
${goodAds.length > 0 ? goodAds.map(a => `- "${a.name}": ROAS ${a.roas}x`).join('\n') : '- Ninguno'}

TOP PRODUCTOS MÁS VENDIDOS (Tiendanube 30d):
${topProductsStr}
AOV promedio: $${tnData?.aov?.toLocaleString('es-AR') ?? 'N/A'} ARS

Tu tarea es:
1. Analizar qué está funcionando y qué no
2. Identificar patrones en los creativos ganadores
3. Proponer 6 ideas de nuevos creativos muy específicas y accionables

Pensá como director creativo de una marca de básicos argentina. Sé CONCRETO: qué se filma, cómo arranca, quién aparece, qué dice.

Respondé SOLO en JSON (sin texto adicional):
{
  "what_works": "análisis de 2-3 oraciones de qué está funcionando en los creativos con mejor ROAS",
  "what_fails": "análisis de 2-3 oraciones de por qué los creativos sin conversión están fallando",
  "patterns": ["patrón detectado 1", "patrón detectado 2", "patrón detectado 3"],
  "top_products": ["producto estrella 1", "producto estrella 2", "producto estrella 3"],
  "ideas": [
    {
      "title": "Nombre corto y memorable del creativo",
      "description": "Descripción detallada de todo el creativo: escena, personas, contexto, diálogo o texto en pantalla, duración, ritmo",
      "hook": "Exactamente qué pasa en los primeros 3 segundos para captar la atención",
      "format": "video|image|reel|carousel|story",
      "priority": "high|medium|low",
      "based_on": "El dato concreto que llevó a esta idea (ej: 'Remera básica es el top seller con $280K en 30d')",
      "cta": "Texto exacto del botón o llamado a la acción"
    }
  ]
}`

  const message = await client.messages.create({
    model: 'claude-sonnet-4-6',
    max_tokens: 2500,
    messages: [{ role: 'user', content: prompt }],
  })

  const text = message.content[0].type === 'text' ? message.content[0].text : ''

  // Strip markdown code fences if present
  const stripped = text.replace(/^```(?:json)?\s*/i, '').replace(/\s*```\s*$/, '').trim()
  const jsonMatch = stripped.match(/\{[\s\S]*\}/)
  if (!jsonMatch) {
    throw new Error(`Claude no devolvio JSON valido. Respuesta: ${stripped.slice(0, 300)}`)
  }
  return JSON.parse(jsonMatch[0]) as CreativeAnalysis
}

// ── Análisis de competencia ────────────────────────────────────
export async function analyzeCompetitor(
  competitorName: string,
  adsData: string
): Promise<{
  summary: string
  positioning: string
  messaging_themes: string[]
  creative_patterns: string[]
  opportunities: string[]
  threats: string[]
}> {
  const prompt = `${BRAND_CONTEXT}

Analiza los anuncios del competidor "${competitorName}":

${adsData}

Haz un analisis estrategico de posicionamiento y mensajeria. Responde en JSON:
{
  "summary": "resumen ejecutivo de 2-3 oraciones",
  "positioning": "como se posicionan vs FOREVER BASICS",
  "messaging_themes": ["tema 1", "tema 2", "..."],
  "creative_patterns": ["patron visual/creativo que usan", "..."],
  "opportunities": ["gap que podemos explotar", "..."],
  "threats": ["en que nos estan ganando", "..."]
}`

  const message = await client.messages.create({
    model: 'claude-opus-4-6',
    max_tokens: 1500,
    messages: [{ role: 'user', content: prompt }],
  })

  const text = message.content[0].type === 'text' ? message.content[0].text : ''

  try {
    const jsonMatch = text.match(/\{[\s\S]*\}/)
    if (!jsonMatch) throw new Error('No JSON found')
    return JSON.parse(jsonMatch[0])
  } catch {
    return {
      summary: 'No se pudo analizar',
      positioning: '',
      messaging_themes: [],
      creative_patterns: [],
      opportunities: [],
      threats: [],
    }
  }
}
