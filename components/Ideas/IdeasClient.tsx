'use client'

import { useState } from 'react'
import type { Snapshot } from '@/lib/supabase'
import type { CreativeAnalysis } from '@/lib/claude'

const FORMAT_EMOJI: Record<string, string> = {
  video: '🎬', image: '🖼️', reel: '🎞️', carousel: '🎠', story: '📱'
}
const FORMAT_LABEL: Record<string, string> = {
  video: 'Video', image: 'Imagen', reel: 'Reel', carousel: 'Carrusel', story: 'Story'
}
const PRIORITY_CONFIG: Record<string, { label: string; bg: string; text: string; dot: string }> = {
  high:   { label: 'Alta prioridad',  bg: 'bg-red-50 dark:bg-red-900/20',    text: 'text-red-700 dark:text-red-400',    dot: 'bg-red-500'   },
  medium: { label: 'Media prioridad', bg: 'bg-amber-50 dark:bg-amber-900/20', text: 'text-amber-700 dark:text-amber-400', dot: 'bg-amber-500' },
  low:    { label: 'Baja prioridad',  bg: 'bg-gray-50 dark:bg-zinc-800',      text: 'text-gray-500 dark:text-zinc-400',  dot: 'bg-gray-400'  },
}

interface Props { snapshot: Snapshot | null }

export default function IdeasClient({ snapshot }: Props) {
  const [analysis, setAnalysis] = useState<CreativeAnalysis | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [expanded, setExpanded] = useState<number | null>(null)

  async function generate() {
    setLoading(true)
    setError('')
    try {
      const res = await fetch('/api/ai/ideas', { method: 'POST' })
      const text = await res.text()
      let data: Record<string, unknown>
      try {
        data = JSON.parse(text)
      } catch {
        throw new Error('Error del servidor. Verificá que la API key de Anthropic esté configurada en Vercel.')
      }
      if (!res.ok) throw new Error((data.error as string) || 'Error al generar')
      setAnalysis(data as unknown as import('@/lib/claude').CreativeAnalysis)
      setExpanded(null)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Error desconocido')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="max-w-5xl mx-auto space-y-6">
      {/* Header */}
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-xl font-semibold text-gray-900 dark:text-zinc-100">Ideas IA</h1>
          <p className="text-sm text-gray-500 dark:text-zinc-500 mt-0.5">
            Analisis de creativos + recomendaciones basadas en tu performance real
          </p>
        </div>
        <button
          onClick={generate}
          disabled={loading || !snapshot}
          className="flex items-center gap-2 bg-gray-900 dark:bg-white text-white dark:text-gray-900 px-4 py-2 rounded-lg text-sm font-medium hover:bg-gray-700 dark:hover:bg-gray-100 disabled:opacity-50 disabled:cursor-not-allowed transition-all shrink-0"
        >
          {loading ? (
            <>
              <svg className="animate-spin w-4 h-4" viewBox="0 0 24 24" fill="none">
                <circle cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="3" strokeOpacity=".25"/>
                <path d="M12 2a10 10 0 0 1 10 10" stroke="currentColor" strokeWidth="3" strokeLinecap="round"/>
              </svg>
              Analizando...
            </>
          ) : (
            <span>{analysis ? 'Regenerar analisis' : 'Generar analisis'}</span>
          )}
        </button>
      </div>

      {!snapshot && (
        <div className="flex items-center gap-2 text-sm text-amber-600 dark:text-amber-400 bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-900/40 rounded-xl px-4 py-3">
          Esperando el primer sync de datos de Meta Ads.
        </div>
      )}
      {error && (
        <div className="text-sm text-red-600 dark:text-red-400 bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-900/40 rounded-xl px-4 py-3">
          Error: {error}
        </div>
      )}

      {!analysis && !loading && (
        <div className="flex flex-col items-center justify-center py-20 text-center">
          <div className="text-5xl mb-4">💡</div>
          <h2 className="text-lg font-semibold text-gray-800 dark:text-zinc-200 mb-2">Analisis de creativos con IA</h2>
          <p className="text-sm text-gray-500 dark:text-zinc-500 max-w-sm">
            Analizamos tus top performers y creativos sin conversion para identificar patrones y recomendarte que filmar a continuacion.
          </p>
        </div>
      )}

      {analysis && (
        <div className="space-y-4">
          {/* What works / What fails */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="bg-emerald-50 dark:bg-emerald-900/15 border border-emerald-200 dark:border-emerald-900/40 rounded-xl p-4">
              <div className="flex items-center gap-2 mb-2">
                <span className="text-lg">OK</span>
                <h3 className="text-sm font-semibold text-emerald-800 dark:text-emerald-300">Que esta funcionando</h3>
              </div>
              <p className="text-sm text-emerald-700 dark:text-emerald-400 leading-relaxed">{analysis.what_works}</p>
            </div>
            <div className="bg-red-50 dark:bg-red-900/15 border border-red-200 dark:border-red-900/40 rounded-xl p-4">
              <div className="flex items-center gap-2 mb-2">
                <span className="text-lg">X</span>
                <h3 className="text-sm font-semibold text-red-800 dark:text-red-300">Que no esta funcionando</h3>
              </div>
              <p className="text-sm text-red-700 dark:text-red-400 leading-relaxed">{analysis.what_fails}</p>
            </div>
          </div>

          {/* Patterns + Top products */}
          {(analysis.patterns?.length > 0 || analysis.top_products?.length > 0) && (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {analysis.patterns?.length > 0 && (
                <div className="bg-white dark:bg-zinc-900 border border-gray-200 dark:border-zinc-800 rounded-xl p-4 shadow-sm">
                  <h3 className="text-xs font-semibold text-gray-500 dark:text-zinc-400 uppercase tracking-wide mb-3">Patrones detectados</h3>
                  <ul className="space-y-1.5">
                    {analysis.patterns.map((p, i) => (
                      <li key={i} className="flex items-start gap-2 text-sm text-gray-700 dark:text-zinc-300">
                        <span className="text-indigo-500 mt-0.5 shrink-0">-</span>
                        {p}
                      </li>
                    ))}
                  </ul>
                </div>
              )}
              {analysis.top_products?.length > 0 && (
                <div className="bg-white dark:bg-zinc-900 border border-gray-200 dark:border-zinc-800 rounded-xl p-4 shadow-sm">
                  <h3 className="text-xs font-semibold text-gray-500 dark:text-zinc-400 uppercase tracking-wide mb-3">Productos estrella (TN 30d)</h3>
                  <ul className="space-y-1.5">
                    {analysis.top_products.map((p, i) => (
                      <li key={i} className="flex items-start gap-2 text-sm text-gray-700 dark:text-zinc-300">
                        <span className="text-amber-500 mt-0.5 shrink-0">*</span>
                        {p}
                      </li>
                    ))}
                  </ul>
                </div>
              )}
            </div>
          )}

          {/* Ideas */}
          <div>
            <h2 className="text-sm font-semibold text-gray-700 dark:text-zinc-300 mb-3">
              {analysis.ideas?.length ?? 0} ideas de contenido recomendadas
            </h2>
            <div className="space-y-3">
              {(analysis.ideas || []).map((idea, i) => {
                const pCfg = PRIORITY_CONFIG[idea.priority] || PRIORITY_CONFIG.medium
                const isOpen = expanded === i
                return (
                  <div key={i} className="bg-white dark:bg-zinc-900 border border-gray-200 dark:border-zinc-800 rounded-xl shadow-sm overflow-hidden">
                    <button
                      onClick={() => setExpanded(isOpen ? null : i)}
                      className="w-full flex items-start gap-4 p-4 text-left hover:bg-gray-50 dark:hover:bg-zinc-800/40 transition-colors"
                    >
                      <div className="text-2xl shrink-0 mt-0.5">{FORMAT_EMOJI[idea.format] || '📝'}</div>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 flex-wrap mb-1">
                          <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-mini font-semibold ${pCfg.bg} ${pCfg.text}`}>
                            <span className={`w-1.5 h-1.5 rounded-full ${pCfg.dot}`} />
                            {pCfg.label}
                          </span>
                          <span className="text-mini text-gray-400 dark:text-zinc-500 bg-gray-100 dark:bg-zinc-800 px-2 py-0.5 rounded-full">
                            {FORMAT_LABEL[idea.format] || idea.format}
                          </span>
                        </div>
                        <h3 className="font-semibold text-gray-900 dark:text-zinc-100 text-sm">{idea.title}</h3>
                        <p className="text-xs text-gray-500 dark:text-zinc-500 mt-0.5 line-clamp-2">{idea.hook}</p>
                      </div>
                      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"
                        className={`w-4 h-4 text-gray-400 shrink-0 mt-1 transition-transform ${isOpen ? 'rotate-180' : ''}`}>
                        <path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7"/>
                      </svg>
                    </button>

                    {isOpen && (
                      <div className="border-t border-gray-100 dark:border-zinc-800 px-4 pb-4 pt-3 space-y-3">
                        <div>
                          <p className="text-mini font-semibold text-gray-400 dark:text-zinc-500 uppercase tracking-wide mb-1">Hook (primeros 3 seg)</p>
                          <p className="text-sm text-gray-700 dark:text-zinc-300 leading-relaxed">{idea.hook}</p>
                        </div>
                        <div>
                          <p className="text-mini font-semibold text-gray-400 dark:text-zinc-500 uppercase tracking-wide mb-1">Descripcion completa</p>
                          <p className="text-sm text-gray-700 dark:text-zinc-300 leading-relaxed">{idea.description}</p>
                        </div>
                        <div className="flex flex-wrap gap-3">
                          <div className="flex-1 min-w-[180px]">
                            <p className="text-mini font-semibold text-gray-400 dark:text-zinc-500 uppercase tracking-wide mb-1">Basado en</p>
                            <p className="text-xs text-gray-600 dark:text-zinc-400 italic">{idea.based_on}</p>
                          </div>
                          <div>
                            <p className="text-mini font-semibold text-gray-400 dark:text-zinc-500 uppercase tracking-wide mb-1">CTA sugerido</p>
                            <span className="text-xs font-medium bg-gray-900 dark:bg-white text-white dark:text-gray-900 px-3 py-1 rounded-full">{idea.cta}</span>
                          </div>
                        </div>
                      </div>
                    )}
                  </div>
                )
              })}
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
