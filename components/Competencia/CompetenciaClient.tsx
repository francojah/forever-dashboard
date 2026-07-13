'use client'

import { useState } from 'react'
import { createClientBrowser } from '@/lib/supabase'

interface Analysis {
  id: string
  competitor_name: string
  competitor_url: string | null
  ads_found: number
  analysis: {
    summary: string
    positioning: string
    messaging_themes: string[]
    creative_patterns: string[]
    opportunities: string[]
    threats: string[]
  }
  created_at: string
}

export default function CompetenciaClient({ savedAnalyses }: { savedAnalyses: Analysis[] }) {
  const [analyses, setAnalyses] = useState(savedAnalyses)
  const [name, setName] = useState('')
  const [url, setUrl] = useState('')
  const [notes, setNotes] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [selected, setSelected] = useState<Analysis | null>(savedAnalyses[0] || null)
  const supabase = createClientBrowser()

  async function analyze() {
    if (!name.trim()) { setError('Ingresá el nombre del competidor'); return }
    setLoading(true)
    setError('')
    try {
      const res = await fetch('/api/ai/competencia', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name, url, notes }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error)

      const { data: inserted } = await supabase
        .from('competitor_analyses')
        .insert({
          competitor_name: name,
          competitor_url: url || null,
          ads_found: 0,
          analysis: data,
        })
        .select()
        .single()

      if (inserted) {
        setAnalyses(prev => [inserted, ...prev])
        setSelected(inserted)
        setName(''); setUrl(''); setNotes('')
      }
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'Error')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
      {/* Left: form + history */}
      <div className="md:col-span-1 space-y-4">
        <div className="bg-white rounded-xl border border-gray-200 p-4">
          <h2 className="text-sm font-semibold text-gray-800 mb-3">Analizar competidor</h2>
          <div className="space-y-3">
            <input
              value={name}
              onChange={e => setName(e.target.value)}
              placeholder="Nombre (ej: Bondi FKT)"
              className="w-full px-3 py-2 rounded-lg border border-gray-200 text-sm focus:outline-none focus:ring-2 focus:ring-black"
            />
            <input
              value={url}
              onChange={e => setUrl(e.target.value)}
              placeholder="URL Instagram o web (opcional)"
              className="w-full px-3 py-2 rounded-lg border border-gray-200 text-sm focus:outline-none focus:ring-2 focus:ring-black"
            />
            <textarea
              value={notes}
              onChange={e => setNotes(e.target.value)}
              placeholder="Pegá textos de sus anuncios, copys que viste, o describí su estilo..."
              rows={4}
              className="w-full px-3 py-2 rounded-lg border border-gray-200 text-sm focus:outline-none focus:ring-2 focus:ring-black resize-none"
            />
            {error && <p className="text-xs text-red-600">{error}</p>}
            <button
              onClick={analyze}
              disabled={loading}
              className="w-full bg-black text-white py-2 rounded-lg text-sm font-medium hover:bg-gray-800 transition-colors disabled:opacity-50"
            >
              {loading ? 'Analizando...' : '🔍 Analizar con IA'}
            </button>
          </div>
        </div>

        {/* History */}
        {analyses.length > 0 && (
          <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
            <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide px-4 py-2.5 border-b border-gray-100">
              Análisis anteriores
            </p>
            {analyses.map(a => (
              <button
                key={a.id}
                onClick={() => setSelected(a)}
                className={`w-full text-left px-4 py-2.5 hover:bg-gray-50 border-b border-gray-50 last:border-0 transition-colors ${
                  selected?.id === a.id ? 'bg-gray-50' : ''
                }`}
              >
                <p className="text-sm font-medium text-gray-800">{a.competitor_name}</p>
                <p className="text-xs text-gray-400">{new Date(a.created_at).toLocaleDateString('es-AR')}</p>
              </button>
            ))}
          </div>
        )}
      </div>

      {/* Right: analysis result */}
      <div className="md:col-span-2">
        {!selected ? (
          <div className="flex items-center justify-center h-64 text-center text-gray-400 dark:text-zinc-500">
            <div>
              <p className="text-4xl mb-3">🔍</p>
              <p className="text-sm">Ingresá un competidor y hacé clic en Analizar</p>
            </div>
          </div>
        ) : (
          <div className="bg-white dark:bg-zinc-900 rounded-xl border border-gray-200 dark:border-zinc-800 p-5 space-y-4">
            <div className="flex items-center justify-between gap-3">
              <div>
                <div className="flex items-center gap-2">
                  <h2 className="text-lg font-semibold text-gray-900 dark:text-zinc-100">{selected.competitor_name}</h2>
                  <span className="text-micro px-1.5 py-0.5 rounded-full bg-amber-100 dark:bg-amber-500/15 text-amber-600 dark:text-amber-400 font-medium">competidor</span>
                </div>
                {selected.competitor_url && (
                  <a href={selected.competitor_url} target="_blank" rel="noopener noreferrer"
                     className="text-xs text-brand hover:underline">{selected.competitor_url}</a>
                )}
              </div>
            </div>

            {/* Resumen destacado */}
            <div className="rounded-xl p-4 bg-brand-soft">
              <p className="text-sm leading-relaxed">{selected.analysis.summary}</p>
            </div>

            {/* Posicionamiento vs nosotros */}
            <div className="rounded-xl border border-gray-200 dark:border-zinc-800 p-4">
              <p className="text-micro font-semibold text-gray-400 dark:text-zinc-500 uppercase tracking-wide mb-1.5">Posicionamiento · vs vos</p>
              <p className="text-sm text-gray-700 dark:text-zinc-300 leading-relaxed">{selected.analysis.positioning}</p>
            </div>

            {/* Mensajería + patrones creativos como chips */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <p className="text-micro font-semibold text-gray-400 dark:text-zinc-500 uppercase tracking-wide mb-2">Temas de mensajería</p>
                <div className="flex flex-wrap gap-1.5">
                  {(selected.analysis.messaging_themes || []).map((t, i) => (
                    <span key={i} className="text-xs px-2 py-1 rounded-lg bg-gray-100 dark:bg-zinc-800 text-gray-700 dark:text-zinc-300">{t}</span>
                  ))}
                </div>
              </div>
              <div>
                <p className="text-micro font-semibold text-gray-400 dark:text-zinc-500 uppercase tracking-wide mb-2">Patrones creativos</p>
                <div className="flex flex-wrap gap-1.5">
                  {(selected.analysis.creative_patterns || []).map((p, i) => (
                    <span key={i} className="text-xs px-2 py-1 rounded-lg bg-violet-100 dark:bg-violet-500/15 text-violet-700 dark:text-violet-300">{p}</span>
                  ))}
                </div>
              </div>
            </div>

            {/* Oportunidades / Amenazas */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div className="rounded-xl p-4 bg-emerald-50 dark:bg-emerald-950/20 border border-emerald-200 dark:border-emerald-900/40">
                <p className="text-xs font-semibold text-emerald-700 dark:text-emerald-400 mb-2 flex items-center gap-1.5">
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round"><path d="M12 2l2.4 7.4H22l-6 4.6 2.3 7.4-6.3-4.6L5.7 21 8 14 2 9.4h7.6z"/></svg>
                  Oportunidades para vos
                </p>
                <ul className="space-y-1.5">
                  {(selected.analysis.opportunities || []).map((o, i) => (
                    <li key={i} className="text-xs text-emerald-800 dark:text-emerald-300 flex items-start gap-1.5"><span className="mt-1 w-1 h-1 rounded-full bg-emerald-500 shrink-0" />{o}</li>
                  ))}
                </ul>
              </div>
              <div className="rounded-xl p-4 bg-red-50 dark:bg-red-950/20 border border-red-200 dark:border-red-900/40">
                <p className="text-xs font-semibold text-red-700 dark:text-red-400 mb-2 flex items-center gap-1.5">
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round"><path d="M10.3 3.9L1.8 18a2 2 0 0 0 1.7 3h17a2 2 0 0 0 1.7-3L13.7 3.9a2 2 0 0 0-3.4 0z"/><line x1="12" y1="9" x2="12" y2="13"/><line x1="12" y1="17" x2="12" y2="17"/></svg>
                  Dónde te ganan
                </p>
                <ul className="space-y-1.5">
                  {(selected.analysis.threats || []).map((t, i) => (
                    <li key={i} className="text-xs text-red-800 dark:text-red-300 flex items-start gap-1.5"><span className="mt-1 w-1 h-1 rounded-full bg-red-500 shrink-0" />{t}</li>
                  ))}
                </ul>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
