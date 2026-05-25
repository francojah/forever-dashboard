'use client'

import { useState } from 'react'
import type { Snapshot, Idea } from '@/lib/supabase'
import { createClientBrowser } from '@/lib/supabase'

const PRIORITY_LABEL: Record<string, string> = { high: 'Alta', medium: 'Media', low: 'Baja' }
const STATUS_LABEL: Record<string, string> = {
  pending: 'Pendiente', in_progress: 'En progreso',
  filming: 'Filmando', editing: 'Editando', done: 'Listo', discarded: 'Descartado'
}
const FORMAT_EMOJI: Record<string, string> = {
  video: '🎬', image: '🖼️', reel: '🎞️', carousel: '🎠', story: '📱'
}

interface Props {
  snapshot: Snapshot | null
  savedIdeas: Idea[]
}

export default function IdeasClient({ snapshot, savedIdeas }: Props) {
  const [ideas, setIdeas] = useState<Idea[]>(savedIdeas)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const supabase = createClientBrowser()

  async function generateIdeas() {
    setLoading(true)
    setError('')
    try {
      const res = await fetch('/api/ai/ideas', { method: 'POST' })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error)

      // Guardar en Supabase
      const toInsert = data.ideas.map((idea: Partial<Idea>) => ({
        title: idea.title,
        description: idea.description,
        format: idea.format,
        priority: idea.priority,
        based_on: idea.based_on,
        generated_by: 'ia',
        status: 'pending',
      }))

      const { data: inserted } = await supabase
        .from('creative_ideas')
        .insert(toInsert)
        .select()

      setIdeas(prev => [...(inserted || []), ...prev])
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'Error desconocido')
    } finally {
      setLoading(false)
    }
  }

  async function updateStatus(id: string, status: string) {
    await supabase.from('creative_ideas').update({ status }).eq('id', id)
    setIdeas(prev => prev.map(i => i.id === id ? { ...i, status: status as Idea['status'] } : i))
  }

  const priorityOrder = { high: 0, medium: 1, low: 2 }
  const sorted = [...ideas].sort((a, b) =>
    (priorityOrder[a.priority] || 1) - (priorityOrder[b.priority] || 1)
  )

  return (
    <div>
      {/* Generate button */}
      <div className="flex items-center gap-3 mb-6">
        <button
          onClick={generateIdeas}
          disabled={loading || !snapshot}
          className="flex items-center gap-2 bg-black text-white px-4 py-2 rounded-lg text-sm font-medium
                     hover:bg-gray-800 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
        >
          {loading ? (
            <>
              <svg className="animate-spin w-4 h-4" viewBox="0 0 24 24" fill="none">
                <circle cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="3" strokeOpacity=".25"/>
                <path d="M12 2a10 10 0 0 1 10 10" stroke="currentColor" strokeWidth="3" strokeLinecap="round"/>
              </svg>
              Generando ideas...
            </>
          ) : (
            <>✨ Generar ideas con IA</>
          )}
        </button>
        {!snapshot && (
          <p className="text-sm text-gray-500">Esperando el primer sync de datos</p>
        )}
        {error && <p className="text-sm text-red-600">{error}</p>}
      </div>

      {/* Ideas grid */}
      {sorted.length === 0 ? (
        <div className="text-center py-16 text-gray-400">
          <p className="text-4xl mb-3">💡</p>
          <p className="text-sm">Generá ideas haciendo clic en el botón de arriba</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {sorted.map(idea => (
            <div key={idea.id} className="bg-white rounded-xl border border-gray-200 p-4">
              {/* Header */}
              <div className="flex items-start justify-between gap-2 mb-2">
                <div className="flex items-center gap-2">
                  <span>{FORMAT_EMOJI[idea.format || ''] || '📝'}</span>
                  <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${
                    idea.priority === 'high' ? 'bg-red-100 text-red-700' :
                    idea.priority === 'medium' ? 'bg-amber-100 text-amber-700' :
                    'bg-gray-100 text-gray-600'
                  }`}>
                    {PRIORITY_LABEL[idea.priority]}
                  </span>
                </div>
                <span className="text-xs text-gray-400 px-2 py-0.5 bg-gray-100 rounded-full">
                  {idea.generated_by === 'ia' ? '✨ IA' : '👤 Equipo'}
                </span>
              </div>

              <h3 className="font-semibold text-gray-900 text-sm mb-1">{idea.title}</h3>
              <p className="text-xs text-gray-600 leading-relaxed mb-3">{idea.description}</p>

              {idea.based_on && (
                <p className="text-xs text-gray-400 italic mb-3">📊 {idea.based_on}</p>
              )}

              {/* Status selector */}
              <select
                value={idea.status}
                onChange={e => updateStatus(idea.id, e.target.value)}
                className="w-full text-xs border border-gray-200 rounded-lg px-2.5 py-1.5 bg-gray-50 text-gray-700 focus:outline-none"
              >
                {Object.entries(STATUS_LABEL).map(([val, label]) => (
                  <option key={val} value={val}>{label}</option>
                ))}
              </select>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
