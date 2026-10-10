'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import { useRouter } from 'next/navigation'
import { clock } from '@/lib/faro/format'

export interface SourceStatus { kind: 'tiendanube' | 'meta'; name: string; lastSyncedAt: string | null; error: string | null; backfilling: boolean }

const KIND: Record<SourceStatus['kind'], string> = { tiendanube: 'Tiendanube', meta: 'Meta' }

/**
 * Muestra a qué hora es el dato de cada fuente y actualiza solo lo nuevo.
 * Al abrir la app, si el dato tiene más de 5 minutos, se actualiza solo.
 */
export default function SyncStatus({ sources, timezone }: { sources: SourceStatus[]; timezone: string }) {
  const router = useRouter()
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const ran = useRef(false)

  // Tandas automáticas del historial: se cortan ante errores o si una fuente pide esperar
  const autoOk = useRef(true)
  const rounds = useRef(0)

  const run = useCallback(async (force: boolean) => {
    setBusy(true)
    setError(null)
    if (force) { autoOk.current = true; rounds.current = 0 }
    try {
      const r = await fetch('/api/v2/sync', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ force }) })
      const j = await r.json().catch(() => ({}))
      const results = (j.results || []) as { ok: boolean; target: string; error?: string; waitMs?: number; done?: boolean }[]
      const failed = results.filter((x) => !x.ok)
      if (!r.ok) setError(j.error || 'No se pudo actualizar')
      else if (failed.length) setError(failed.map((f) => `${f.target}: ${f.error}`).join(' · '))
      if (!r.ok || failed.length || results.some((x) => x.waitMs) || !results.some((x) => x.done === false)) autoOk.current = false
      router.refresh()
    } catch {
      setError('Sin conexión')
      autoOk.current = false
    } finally {
      setBusy(false)
    }
  }, [router])

  useEffect(() => {
    if (ran.current || !sources.length) return
    ran.current = true
    const stale = sources.some((s) => s.backfilling || !s.lastSyncedAt || Date.now() - new Date(s.lastSyncedAt).getTime() > 5 * 60000)
    if (stale) run(false)
  }, [sources, run])

  // Mientras se importa el historial, seguir pidiendo tandas (máximo 40 por visita)
  useEffect(() => {
    if (!sources.some((s) => s.backfilling) || busy || !autoOk.current || rounds.current >= 40) return
    const t = setTimeout(() => { rounds.current++; run(false) }, 3000)
    return () => clearTimeout(t)
  }, [sources, busy, run])

  if (!sources.length) return null
  const anyError = error || sources.find((s) => s.error)?.error

  return (
    <div className="flex items-center gap-3 text-[13px]">
      <div className="hidden sm:flex items-center gap-3 text-mute">
        {sources.map((s, i) => (
          <span key={i} className="flex items-center gap-1.5" title={s.error || undefined}>
            <span className={`w-1.5 h-1.5 rounded-full ${s.error ? 'bg-bad' : s.backfilling ? 'bg-beacon' : 'bg-good'}`} />
            {KIND[s.kind]}{sources.filter((x) => x.kind === s.kind).length > 1 ? ` (${s.name})` : ''}{' '}
            <span className="num text-ink">{s.backfilling ? 'importando historial' : clock(s.lastSyncedAt, timezone)}</span>
          </span>
        ))}
      </div>
      {anyError && <span className="text-bad max-w-[280px] truncate" title={anyError}>Error al actualizar</span>}
      <button
        onClick={() => run(true)}
        disabled={busy}
        className="flex items-center gap-1.5 rounded-lg border border-line bg-surface px-3 py-1.5 font-medium text-ink hover:bg-sunken disabled:opacity-60"
      >
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" className={`w-4 h-4 ${busy ? 'animate-spin' : ''}`} aria-hidden>
          <path d="M20 12a8 8 0 1 1-2.3-5.7M20 4v4h-4" />
        </svg>
        {busy ? 'Actualizando' : 'Actualizar'}
      </button>
    </div>
  )
}
