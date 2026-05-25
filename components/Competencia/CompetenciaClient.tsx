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
          <div className="flex items-center justify-center h-64 text-center text-gray-400">
            <div>
              <p className="text-4xl mb-3">🔍</p>
              <p className="text-sm">Ingresá un competidor y hacé clic en Analizar</p>
            </div>
          </div>
        ) : (
          <div className="bg-white rounded-xl border border-gray-200 p-5 space-y-4">
            <div>
              <h2 className="text-lg font-semibold text-gray-900">{selected.competitor_name}</h2>
              {selected.competitor_url && (
                <a href={selected.competitor_url} target="_blank" rel="noopener noreferrer"
                   className="text-xs text-blue-600 hover:underline">{selected.competitor_url}</a>
              )}
            </div>

            <div className="bg-gray-50 rounded-lg p-3">
              <p className="text-sm text-gray-700">{selected.analysis.summary}</p>
            </div>

            <div>
              <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-2">Posicionamiento</p>
              <p className="text-sm text-gray-700">{selected.analysis.positioning}</p>
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div>
                <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-2">Temas de mensajería</p>
                <ul className="space-y-1">
                  {(selected.analysis.messaging_themes || []).map((t, i) => (
                    <li key={i} className="text-sm text-gray-700 flex items-start gap-1.5">
                      <span className="text-gray-400 mt-0.5">•</span>{t}
                    </li>
                  ))}
                </ul>
              </div>
              <div>
                <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-2">Patrones creativos</p>
                <ul className="space-y-1">
                  {(selected.analysis.creative_patterns || []).map((p, i) => (
                    <li key={i} className="text-sm text-gray-700 flex items-start gap-1.5">
                      <span className="text-gray-400 mt-0.5">•</span>{p}
                    </li>
                  ))}
                </ul>
              </div>
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div className="bg-green-50 rounded-lg p-3">
                <p className="text-xs font-semibold text-green-700 mb-2">✅ Oportunidades para Forever</p>
                <ul className="space-y-1">
                  {(selected.analysis.opportunities || []).map((o, i) => (
                    <li key={i} className="text-xs text-green-800">{o}</li>
                  ))}
                </ul>
              </div>
              <div className="bg-red-50 rounded-lg p-3">
                <p className="text-xs font-semibold text-red-700 mb-2">⚠️ Amenazas</p>
                <ul className="space-y-1">
                  {(selected.analysis.threats || []).map((t, i) => (
                    <li key={i} className="text-xs text-red-800">{t}</li>
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
