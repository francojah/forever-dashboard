'use client'

import { useState, useEffect } from 'react'
import Link from 'next/link'

interface Settings {
  breakeven_cpa:     number
  roas_min:          number
  roas_scale:        number
  tn_commission_pct: number
  shipping_pct:      number
}

interface TNStatus {
  configured:   boolean
  valid:        boolean
  source:       'supabase' | 'env' | 'none'
  store_name?:  string
  store_url?:   string | null
  user_id?:     string
  error?:       string
  reconnect_url?: string
  connected_at?: string | null
}

interface Props { initialSettings: Settings }

const FIELDS: { key: keyof Settings; label: string; desc: string; prefix?: string; suffix?: string; step: number }[] = [
  { key: 'breakeven_cpa',     label: 'CPA de Breakeven',            desc: 'CPA máximo antes de perder dinero por orden.',                              prefix: '$', suffix: 'ARS', step: 500  },
  { key: 'roas_min',          label: 'ROAS Mínimo',                 desc: 'ROAS por debajo del cual un anuncio se considera no rentable.',                           suffix: 'x',   step: 0.1  },
  { key: 'roas_scale',        label: 'ROAS para Escalar',           desc: 'ROAS a partir del cual se recomienda duplicar budget.',                                   suffix: 'x',   step: 0.5  },
  { key: 'tn_commission_pct', label: 'Comisión Tiendanube',         desc: 'Porcentaje de comisión que cobra Tiendanube sobre ventas.',                              suffix: '%',   step: 0.1  },
  { key: 'shipping_pct',      label: 'Gastos de Envío (% ventas)',  desc: 'Estimación del costo de envío como % del total de ventas (para Balance).',  suffix: '%',   step: 0.5  },
]

function TNConnectionCard() {
  const [status, setStatus] = useState<TNStatus | null>(null)
  const [checking, setChecking] = useState(true)

  async function check() {
    setChecking(true)
    try {
      const res  = await fetch('/api/tn-status')
      const data = await res.json()
      setStatus(data)
    } catch {
      setStatus({ configured: false, valid: false, source: 'none', error: 'No se pudo verificar el estado' })
    } finally {
      setChecking(false)
    }
  }

  useEffect(() => { check() }, [])

  return (
    <div className="bg-white dark:bg-zinc-900 rounded-xl border border-gray-200 dark:border-zinc-800 shadow-sm overflow-hidden">
      {/* Header */}
      <div className="flex items-center justify-between px-5 py-4 border-b border-gray-100 dark:border-zinc-800">
        <div className="flex items-center gap-3">
          {/* TN logo mark */}
          <div className="w-8 h-8 rounded-lg bg-blue-600 flex items-center justify-center shrink-0">
            <svg viewBox="0 0 24 24" className="w-4 h-4 text-white" fill="currentColor">
              <path d="M12 2C6.477 2 2 6.477 2 12s4.477 10 10 10 10-4.477 10-10S17.523 2 12 2zm0 3a7 7 0 110 14A7 7 0 0112 5zm-.5 3v4.5l3.5 2-.7 1.2-4.3-2.5V8h1.5z"/>
            </svg>
          </div>
          <div>
            <p className="text-sm font-semibold text-gray-800 dark:text-zinc-200">Tiendanube</p>
            <p className="text-xs text-gray-400 dark:text-zinc-500">Conexión a tu tienda</p>
          </div>
        </div>
        <button
          onClick={check}
          disabled={checking}
          className="text-xs text-gray-400 dark:text-zinc-500 hover:text-gray-600 dark:hover:text-zinc-300 transition-colors disabled:opacity-40"
          title="Verificar conexión"
        >
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"
            className={'w-4 h-4 ' + (checking ? 'animate-spin' : '')}>
            <path strokeLinecap="round" strokeLinejoin="round"
              d="M16.023 9.348h4.992v-.001M2.985 19.644v-4.992m0 0h4.992m-4.993 0l3.181 3.183a8.25 8.25 0 0013.803-3.7M4.031 9.865a8.25 8.25 0 0113.803-3.7l3.181 3.182m0-4.991v4.99" />
          </svg>
        </button>
      </div>

      {/* Status body */}
      <div className="px-5 py-4">
        {checking && !status ? (
          <div className="flex items-center gap-2 text-sm text-gray-400 dark:text-zinc-500">
            <svg className="animate-spin w-4 h-4" viewBox="0 0 24 24" fill="none">
              <circle cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="3" strokeOpacity=".25"/>
              <path d="M12 2a10 10 0 0 1 10 10" stroke="currentColor" strokeWidth="3" strokeLinecap="round"/>
            </svg>
            Verificando conexión…
          </div>
        ) : status?.valid ? (
          <div className="space-y-3">
            <div className="flex items-center gap-2">
              <span className="w-2 h-2 rounded-full bg-emerald-500 shrink-0" />
              <span className="text-sm font-medium text-emerald-600 dark:text-emerald-400">Conectado</span>
              {status.source === 'supabase' && (
                <span className="text-[10px] bg-blue-100 dark:bg-blue-900/30 text-blue-600 dark:text-blue-400 px-1.5 py-0.5 rounded-full font-medium">OAuth</span>
              )}
              {status.source === 'env' && (
                <span className="text-[10px] bg-gray-100 dark:bg-zinc-800 text-gray-500 dark:text-zinc-400 px-1.5 py-0.5 rounded-full font-medium">Env vars</span>
              )}
            </div>
            <div className="grid grid-cols-2 gap-2 text-xs">
              <div>
                <p className="text-gray-400 dark:text-zinc-500 mb-0.5">Tienda</p>
                <p className="font-medium text-gray-700 dark:text-zinc-300">
                  {status.store_url
                    ? <a href={status.store_url} target="_blank" rel="noopener noreferrer" className="hover:underline">{status.store_name}</a>
                    : status.store_name
                  }
                </p>
              </div>
              <div>
                <p className="text-gray-400 dark:text-zinc-500 mb-0.5">User ID</p>
                <p className="font-mono font-medium text-gray-700 dark:text-zinc-300">{status.user_id}</p>
              </div>
              {status.connected_at && (
                <div className="col-span-2">
                  <p className="text-gray-400 dark:text-zinc-500 mb-0.5">Conectado el</p>
                  <p className="font-medium text-gray-700 dark:text-zinc-300">
                    {new Date(status.connected_at).toLocaleDateString('es-AR', { day: 'numeric', month: 'long', year: 'numeric' })}
                  </p>
                </div>
              )}
            </div>
            <a
              href={status.reconnect_url}
              target="_blank" rel="noopener noreferrer"
              className="inline-flex items-center gap-1.5 text-xs text-gray-400 dark:text-zinc-500 hover:text-gray-600 dark:hover:text-zinc-300 transition-colors"
            >
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="w-3 h-3">
                <path strokeLinecap="round" strokeLinejoin="round" d="M16.023 9.348h4.992v-.001M2.985 19.644v-4.992m0 0h4.992m-4.993 0l3.181 3.183a8.25 8.25 0 0013.803-3.7M4.031 9.865a8.25 8.25 0 0113.803-3.7l3.181 3.182m0-4.991v4.99" />
              </svg>
              Reconectar / renovar token
            </a>
          </div>
        ) : (
          <div className="space-y-3">
            <div className="flex items-start gap-2">
              <span className="w-2 h-2 rounded-full bg-red-500 shrink-0 mt-1" />
              <div>
                <p className="text-sm font-medium text-red-600 dark:text-red-400">Sin conexión</p>
                {status?.error && (
                  <p className="text-xs text-gray-500 dark:text-zinc-500 mt-0.5">{status.error}</p>
                )}
              </div>
            </div>
            <div className="bg-amber-50 dark:bg-amber-900/15 border border-amber-200 dark:border-amber-900/40 rounded-lg p-3 text-xs text-amber-800 dark:text-amber-300 space-y-1.5">
              <p className="font-semibold">Cómo reconectar:</p>
              <ol className="list-decimal list-inside space-y-1 text-amber-700 dark:text-amber-400">
                <li>Hacé clic en el botón de abajo — abre la página de autorización de TN</li>
                <li>Aprobá el acceso con tu cuenta de Tiendanube</li>
                <li>El token nuevo se guarda automáticamente (no hay que tocar Vercel)</li>
              </ol>
            </div>
            {status?.reconnect_url && (
              <a
                href={status.reconnect_url}
                target="_blank" rel="noopener noreferrer"
                className="inline-flex items-center gap-2 bg-blue-600 hover:bg-blue-500 text-white px-4 py-2 rounded-lg text-sm font-medium transition-colors"
              >
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="w-4 h-4">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M13.5 6H5.25A2.25 2.25 0 003 8.25v10.5A2.25 2.25 0 005.25 21h10.5A2.25 2.25 0 0018 18.75V10.5m-10.5 6L21 3m0 0h-5.25M21 3v5.25" />
                </svg>
                Conectar Tiendanube
              </a>
            )}
          </div>
        )}
      </div>
    </div>
  )
}

export default function SettingsClient({ initialSettings }: Props) {
  const [settings, setSettings] = useState<Settings>(initialSettings)
  const [saving, setSaving]     = useState(false)
  const [saved, setSaved]       = useState(false)
  const [error, setError]       = useState('')

  function handleChange(key: keyof Settings, raw: string) {
    const val = parseFloat(raw)
    if (!isNaN(val)) setSettings(prev => ({ ...prev, [key]: val }))
  }

  async function save() {
    setSaving(true); setError(''); setSaved(false)
    try {
      const res  = await fetch('/api/settings', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(settings),
      })
      const data = await res.json()
      if (data.error) throw new Error(data.error)
      setSaved(true)
      setTimeout(() => setSaved(false), 3000)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Error al guardar')
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="max-w-2xl mx-auto space-y-6">
      <div>
        <h1 className="text-xl font-semibold text-gray-900 dark:text-zinc-100">Configuración</h1>
        <p className="text-sm text-gray-500 dark:text-zinc-500 mt-0.5">Parámetros del negocio e integraciones.</p>
      </div>

      {/* Tiendanube connection status */}
      <TNConnectionCard />

      {/* Business parameters */}
      <div>
        <p className="text-xs font-semibold text-gray-400 dark:text-zinc-500 uppercase tracking-wider mb-3">Parámetros del negocio</p>
        <div className="bg-white dark:bg-zinc-900 rounded-xl border border-gray-200 dark:border-zinc-800 divide-y divide-gray-100 dark:divide-zinc-800 shadow-sm">
          {FIELDS.map(({ key, label, desc, prefix, suffix, step }) => (
            <div key={key} className="flex items-center justify-between gap-6 px-5 py-4">
              <div className="flex-1">
                <p className="text-sm font-medium text-gray-800 dark:text-zinc-200">{label}</p>
                <p className="text-xs text-gray-400 dark:text-zinc-500 mt-0.5">{desc}</p>
              </div>
              <div className="flex items-center gap-1.5 shrink-0">
                {prefix && <span className="text-sm text-gray-400">{prefix}</span>}
                <input
                  type="number"
                  step={step}
                  value={settings[key]}
                  onChange={e => handleChange(key, e.target.value)}
                  className="w-24 text-right text-sm font-medium bg-gray-50 dark:bg-zinc-800 border border-gray-200 dark:border-zinc-700 rounded-lg px-3 py-1.5 text-gray-900 dark:text-zinc-100 focus:outline-none focus:ring-2 focus:ring-gray-400 dark:focus:ring-zinc-500"
                />
                {suffix && <span className="text-sm text-gray-400">{suffix}</span>}
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Preview */}
      <div className="bg-gray-50 dark:bg-zinc-800/40 rounded-xl border border-gray-200 dark:border-zinc-700 p-4">
        <p className="text-xs font-medium text-gray-500 dark:text-zinc-400 mb-3 uppercase tracking-wide">Vista previa de reglas</p>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 text-xs text-gray-600 dark:text-zinc-400">
          <p>🟢 <strong>Escalar</strong> si ROAS ≥ {settings.roas_scale}x</p>
          <p>🔵 <strong>Mantener</strong> si ROAS {settings.roas_min}x–{settings.roas_scale}x</p>
          <p>🟡 <strong>Vigilar</strong> si CPA &gt; ${(settings.breakeven_cpa / 1000).toFixed(1)}K</p>
          <p>🔴 <strong>Pausar</strong> si CPA &gt; ${(settings.breakeven_cpa * 1.5 / 1000).toFixed(1)}K o ROAS &lt; {settings.roas_min}x</p>
          <p>📦 <strong>Comisión TN:</strong> {settings.tn_commission_pct}% de ventas</p>
          <p>🚚 <strong>Envíos:</strong> {settings.shipping_pct}% de ventas (estimado)</p>
        </div>
      </div>

      <div className="flex items-center gap-3">
        <button
          onClick={save}
          disabled={saving}
          className="px-5 py-2 bg-gray-900 dark:bg-white text-white dark:text-gray-900 rounded-lg text-sm font-medium hover:bg-gray-700 dark:hover:bg-gray-100 disabled:opacity-50 transition-all"
        >
          {saving ? 'Guardando…' : 'Guardar cambios'}
        </button>
        {saved  && <p className="text-sm text-emerald-600 dark:text-emerald-400">✓ Guardado</p>}
        {error  && <p className="text-sm text-red-500">✗ {error}</p>}
      </div>
    </div>
  )
}
