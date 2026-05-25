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

// ── Generador de ideas de contenido ───────────────────────────
export async function generateCreativeIdeas(snapshot: Snapshot): Promise<{
  ideas: Array<{
    title: string
    description: string
    format: string
    priority: string
    based_on: string
  }>
}> {
  const { summary, adsets, ads } = snapshot

  // Top performers
  const topAds = [...ads]
    .filter(a => a.roas && a.spend)
    .sort((a, b) => (b.roas || 0) - (a.roas || 0))
    .slice(0, 5)

  // Problem performers
  const problemAds = [...ads]
    .filter(a => a.spend && a.spend > 5000 && (!a.results || a.results === 0))
    .sort((a, b) => (b.spend || 0) - (a.spend || 0))
    .slice(0, 3)

  const prompt = `${BRAND_CONTEXT}

DATOS DE PERFORMANCE ÚLTIMOS 7 DÍAS:
- Gasto total: $${summary.total_spend_7d?.toLocaleString('es-AR')} ARS
- Compras: ${summary.total_purchases_7d}
- CPA blended: $${summary.blended_cpa?.toLocaleString('es-AR')} ARS
- ROAS blended: ${summary.blended_roas}x

TOP CREATIVOS (mejores ROAS):
${topAds.map(a => `- "${a.name}": ROAS ${a.roas}x, $${a.spend?.toLocaleString('es-AR')} gastado, ${a.results || 0} compras`).join('\n')}

CREATIVOS SIN CONVERSIÓN (gastando sin resultados):
${problemAds.map(a => `- "${a.name}": $${a.spend?.toLocaleString('es-AR')} gastado, 0 compras`).join('\n')}

Generá 6 ideas específicas de nuevos creativos para mejorar el ROAS. Para cada idea indicá:
- Qué filmar/crear exactamente (descripción detallada de los primeros 3 segundos y el concepto)
- Formato (video/imagen/reel/carrusel)
- Prioridad (alta/media/baja)
- En qué métrica o patrón te basás para recomendarla

Respondé en JSON con este formato:
{
  "ideas": [
    {
      "title": "nombre corto del creativo",
      "description": "descripción detallada de qué filmar y cómo",
      "format": "video|image|reel|carousel|story",
      "priority": "high|medium|low",
      "based_on": "qué insight de los datos llevó a esta idea"
    }
  ]
}`

  const message = await client.messages.create({
    model: 'claude-opus-4-6',
    max_tokens: 2000,
    messages: [{ role: 'user', content: prompt }],
  })

  const text = message.content[0].type === 'text' ? message.content[0].text : ''

  try {
    const jsonMatch = text.match(/\{[\s\S]*\}/)
    if (!jsonMatch) throw new Error('No JSON found')
    return JSON.parse(jsonMatch[0])
  } catch {
    return { ideas: [] }
  }
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

Analizá los anuncios del competidor "${competitorName}":

${adsData}

Hacé un análisis estratégico de posicionamiento y mensajería. Respondé en JSON:
{
  "summary": "resumen ejecutivo de 2-3 oraciones",
  "positioning": "cómo se posicionan vs FOREVER BASICS",
  "messaging_themes": ["tema 1", "tema 2", "..."],
  "creative_patterns": ["patrón visual/creativo que usan", "..."],
  "opportunities": ["gap que podemos explotar", "..."],
  "threats": ["en qué nos están ganando", "..."]
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

// ── Chat asistente con contexto de métricas ────────────────────
export async function chatWithContext(
  userMessage: string,
  snapshot: Snapshot | null,
  history: Array<{ role: 'user' | 'assistant'; content: string }>
): Promise<string> {
  const contextMsg = snapshot
    ? `\nDATOS ACTUALES (${snapshot.snapshot_date}):
- Gasto 7d: $${snapshot.summary.total_spend_7d?.toLocaleString('es-AR')} ARS
- Compras: ${snapshot.summary.total_purchases_7d}
- ROAS: ${snapshot.summary.blended_roas}x
- CPA: $${snapshot.summary.blended_cpa?.toLocaleString('es-AR')} ARS
- Budget diario activo: $${snapshot.summary.daily_budget_active?.toLocaleString('es-AR')} ARS`
    : ''

  const message = await client.messages.create({
    model: 'claude-opus-4-6',
    max_tokens: 1000,
    system: `${BRAND_CONTEXT}${contextMsg}\n\nSos conciso y accionable. Respondés en español rioplatense.`,
    messages: [
      ...history,
      { role: 'user', content: userMessage },
    ],
  })

  return message.content[0].type === 'text' ? message.content[0].text : ''
}
