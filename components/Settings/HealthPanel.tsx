'use client'

import { useEffect, useState } from 'react'
import { LOCALE } from '@/lib/config'

/**
 * HealthPanel — Estado de salud del sistema, consume /api/health.
 * Muestra si el último sync está fresco, cuándo corrió y errores recientes.
 */

interface HealthData {
  status: 'ok' | 'degraded' | 'error'
  response_ms?: number
  timestamp?: string
  checks?: {
    meta_snapshot?: { date?: string; age_hours?: number; stale?: boolean; error?: string }
    last_runs?: { source: string; status: string; duration_ms?: number; error?: string; created_at: string }[]
    last_error?: string
  }
  message?: string
}

const DOT = { ok: 'bg-emerald-400', degraded: 'bg-amber-400', error: 'bg-red-400' }
const LABEL = { ok: 'Operativo', degraded: 'Degradado', error: 'Con errores' }

export default function HealthPanel() {
  const [data, setData] = useState<HealthData | null>(null)
  const [loading, setLoading] = useState(true)

  const load = () => {
    setLoading(true)
    fetch('/api/health')
      .then((r) => r.json())
      .then(setData)
      .catch((e) => setData({ status: 'error', message: e.message }))
      .finally(() => setLoading(false))
  }

  useEffect(load, [])

  const status = data?.status || 'error'
  const snap = data?.checks?.meta_snapshot
  const runs = data?.checks?.last_runs || []

  return (
    <div className="bg-white dark:bg-zinc-900 rounded-xl border border-gray-200 dark:border-zinc-800 p-5 shadow-sm">
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-2">
          <span className={'w-2.5 h-2.5 rounded-full ' + DOT[status]} />
          <h3 className="text-sm font-semibold text-gray-900 dark:text-zinc-100">
            Estado del sistema {data && <span className="text-gray-400 dark:text-zinc-500 font-normal">· {LABEL[status]}</span>}
          </h3>
        </div>
        <button
          onClick={load}
          className="text-[11px] rounded-md border border-gray-200 dark:border-zinc-700 px-2 py-1 text-gray-600 dark:text-zinc-300 hover:bg-gray-50 dark:hover:bg-zinc-800"
        >
          Refrescar
        </button>
      </div>

      {loading ? (
        <p className="text-xs text-gray-400 dark:text-zinc-500">Consultando...</p>
      ) : (
        <div className="space-y-3 text-xs">
          <Row
            label="Último snapshot Meta"
            value={
              snap?.date
                ? `${snap.date} · hace ${snap.age_hours}h`
                : snap?.error || 'sin datos'
            }
            bad={snap?.stale || !!snap?.error}
          />
          {data?.response_ms != null && <Row label="Respuesta API" value={`${data.response_ms} ms`} />}
          {data?.checks?.last_error && (
            <Row
              label="Último error"
              value={data.checks.last_error}
              bad={!String(data.checks.last_error).startsWith('(resuelto)')}
            />
          )}

          {runs.length > 0 && (
            <div className="pt-2 border-t border-gray-100 dark:border-zinc-800">
              <p className="text-[11px] uppercase tracking-wide text-gray-400 dark:text-zinc-500 mb-2">
                Últimas corridas
              </p>
              <div className="space-y-1.5">
                {runs.map((r, i) => (
                  <div key={i} className="flex items-center justify-between">
                    <span className="flex items-center gap-1.5">
                      <span className={'w-1.5 h-1.5 rounded-full ' + (r.status === 'success' ? 'bg-emerald-400' : 'bg-red-400')} />
                      <span className="text-gray-600 dark:text-zinc-300">{r.source}</span>
                    </span>
                    <span className="text-gray-400 dark:text-zinc-500 tabular-nums">
                      {new Date(r.created_at).toLocaleString(LOCALE, { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' })}
                      {r.duration_ms != null && ` · ${(r.duration_ms / 1000).toFixed(1)}s`}
                    </span>
                  </div>
                ))}
              </div>
            </div>
          )}

          {runs.length === 0 && !snap?.error && (
            <p className="text-[11px] text-gray-400 dark:text-zinc-500">
              Sin registro de corridas todavía (tabla sync_runs vacía o migración pendiente).
            </p>
          )}
        </div>
      )}
    </div>
  )
}

function Row({ label, value, bad }: { label: string; value: string; bad?: boolean }) {
  return (
    <div className="flex items-center justify-between gap-3">
      <span className="text-gray-500 dark:text-zinc-400">{label}</span>
      <span className={'text-right ' + (bad ? 'text-red-500 dark:text-red-400 font-medium' : 'text-gray-800 dark:text-zinc-200')}>
        {value}
      </span>
    </div>
  )
}
