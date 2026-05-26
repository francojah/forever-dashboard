'use client'

import { useState, useEffect, useCallback } from 'react'

interface Props {
  initialContent: string | null
  initialDate: string | null
}

function MarkdownLine({ line }: { line: string }) {
  // Bold **text**
  const parts = line.split(/(\*\*[^*]+\*\*)/)
  return (
    <>
      {parts.map((p, i) =>
        p.startsWith('**') && p.endsWith('**')
          ? <strong key={i} className="font-semibold text-gray-800 dark:text-zinc-200">{p.slice(2, -2)}</strong>
          : <span key={i}>{p}</span>
      )}
    </>
  )
}

function renderMarkdown(text: string) {
  const lines = text.split('\n')
  const elements: React.ReactNode[] = []
  let key = 0

  for (const line of lines) {
    if (line.startsWith('## ')) {
      elements.push(
        <h2 key={key++} className="text-lg font-semibold text-gray-900 dark:text-zinc-100 mb-4 mt-2">
          {line.slice(3)}
        </h2>
      )
    } else if (line.startsWith('**') && line.endsWith('**')) {
      elements.push(
        <h3 key={key++} className="text-sm font-semibold text-gray-700 dark:text-zinc-300 mt-5 mb-2 uppercase tracking-wide">
          {line.slice(2, -2)}
        </h3>
      )
    } else if (line.startsWith('- ') || line.startsWith('* ')) {
      elements.push(
        <li key={key++} className="flex gap-2 text-sm text-gray-600 dark:text-zinc-400 mb-1.5">
          <span className="text-gray-400 dark:text-zinc-600 mt-0.5 shrink-0">•</span>
          <span><MarkdownLine line={line.slice(2)} /></span>
        </li>
      )
    } else if (line.trim() === '') {
      elements.push(<div key={key++} className="h-1" />)
    } else {
      elements.push(
        <p key={key++} className="text-sm text-gray-600 dark:text-zinc-400 mb-2">
          <MarkdownLine line={line} />
        </p>
      )
    }
  }

  return elements
}

export default function ResumenClient({ initialContent, initialDate }: Props) {
  const [content, setContent] = useState<string | null>(initialContent)
  const [date, setDate] = useState<string | null>(initialDate)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [cached, setCached] = useState(!!initialContent)

  const generate = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const res = await fetch('/api/ai-resumen', { method: 'POST' })
      const data = await res.json()
      if (data.error) throw new Error(data.error)
      setContent(data.content)
      setDate(data.date)
      setCached(false)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Error desconocido')
    } finally {
      setLoading(false)
    }
  }, [])

  // Auto-generate if no cached content
  useEffect(() => {
    if (!initialContent) generate()
  }, [initialContent, generate])

  return (
    <div className="max-w-3xl mx-auto space-y-6">
      {/* Header */}
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-xl font-semibold text-gray-900 dark:text-zinc-100">Resumen IA</h1>
          <p className="text-sm text-gray-500 dark:text-zinc-500 mt-0.5">
            Análisis diario generado por IA sobre el estado de tus campañas
          </p>
        </div>
        <button
          onClick={generate}
          disabled={loading}
          className="flex items-center gap-2 px-4 py-2 bg-zinc-900 dark:bg-zinc-100 text-white dark:text-zinc-900 text-sm font-medium rounded-lg hover:bg-zinc-700 dark:hover:bg-zinc-300 disabled:opacity-50 transition-all shrink-0"
        >
          {loading ? (
            <>
              <svg className="animate-spin w-4 h-4" viewBox="0 0 24 24" fill="none">
                <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
              </svg>
              Generando…
            </>
          ) : (
            <>
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="w-4 h-4">
                <path strokeLinecap="round" strokeLinejoin="round" d="M9.813 15.904L9 18.75l-.813-2.846a4.5 4.5 0 00-3.09-3.09L2.25 12l2.846-.813a4.5 4.5 0 003.09-3.09L9 5.25l.813 2.846a4.5 4.5 0 003.09 3.09L15.75 12l-2.846.813a4.5 4.5 0 00-3.09 3.09z" />
              </svg>
              {cached ? 'Regenerar' : 'Generar'}
            </>
          )}
        </button>
      </div>

      {/* Loading state */}
      {loading && !content && (
        <div className="bg-white dark:bg-zinc-900 rounded-xl border border-gray-200 dark:border-zinc-800 p-8 text-center shadow-sm">
          <div className="inline-flex items-center gap-3 text-gray-500 dark:text-zinc-400">
            <svg className="animate-spin w-5 h-5" viewBox="0 0 24 24" fill="none">
              <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
              <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
            </svg>
            <span className="text-sm">Analizando tus campañas…</span>
          </div>
        </div>
      )}

      {/* Error state */}
      {error && (
        <div className="bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-xl p-4 text-sm text-red-700 dark:text-red-400">
          {error}
        </div>
      )}

      {/* Content */}
      {content && (
        <div className="bg-white dark:bg-zinc-900 rounded-xl border border-gray-200 dark:border-zinc-800 p-6 shadow-sm">
          {date && (
            <div className="flex items-center gap-2 mb-5 pb-4 border-b border-gray-100 dark:border-zinc-800">
              <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse" />
              <span className="text-xs text-gray-400 dark:text-zinc-500">
                {cached ? `Resumen guardado · ${date}` : `Generado ahora · ${date}`}
              </span>
            </div>
          )}
          <div className="prose-sm">
            {renderMarkdown(content)}
          </div>
        </div>
      )}

      {/* Info box */}
      <div className="bg-blue-50 dark:bg-blue-950/30 border border-blue-200 dark:border-blue-900/50 rounded-xl p-4">
        <p className="text-xs text-blue-700 dark:text-blue-400">
          <strong>¿Cómo funciona?</strong> El resumen se genera con los últimos datos sincronizados de Meta Ads y se cachea por día para no gastar tokens innecesariamente. Podés regenerarlo cuando quieras para obtener un análisis fresco.
        </p>
      </div>
    </div>
  )
}
