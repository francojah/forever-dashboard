'use client'

import { useState } from 'react'

interface Settings {
  breakeven_cpa:     number
  roas_min:          number
  roas_scale:        number
  tn_commission_pct: number
  shipping_pct:      number
}

interface Props { initialSettings: Settings }

const FIELDS: { key: keyof Settings; label: string; desc: string; prefix?: string; suffix?: string; step: number }[] = [
  { key: 'breakeven_cpa',     label: 'CPA de Breakeven',         desc: 'CPA máximo antes de perder dinero por orden.',                        prefix: '$', suffix: 'ARS', step: 500   },
  { key: 'roas_min',          label: 'ROAS Mínimo',              desc: 'ROAS por debajo del cual un anuncio se considera no rentable.',                       suffix: 'x',   step: 0.1   },
  { key: 'roas_scale',        label: 'ROAS para Escalar',        desc: 'ROAS a partir del cual se recomienda duplicar budget.',                              suffix: 'x',   step: 0.5   },
  { key: 'tn_commission_pct', label: 'Comisión Tiendanube',      desc: 'Porcentaje de comisión que cobra Tiendanube sobre ventas.',                          suffix: '%',   step: 0.1   },
  { key: 'shipping_pct',      label: 'Gastos de Envío (% ventas)', desc: 'Estimación del costo de envío como % del total de ventas (para Balance).', suffix: '%',   step: 0.5   },
]

export default function SettingsClient({ initialSettings }: Props) {
  const [settings, setSettings] = useState<Settings>(initialSettings)
  const [saving, setSaving] = useState(false)
  const [saved, setSaved] = useState(false)
  const [error, setError] = useState('')

  function handleChange(key: keyof Settings, raw: string) {
    const val = parseFloat(raw)
    if (!isNaN(val)) setSettings(prev => ({ ...prev, [key]: val }))
  }

  async function save() {
    setSaving(true)
    setError('')
    setSaved(false)
    try {
      const res = await fetch('/api/settings', {
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
        <p className="text-sm text-gray-500 dark:text-zinc-500 mt-0.5">Parámetros del negocio usados en el análisis de creativos, balance y alertas.</p>
      </div>

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
        {saved && <p className="text-sm text-emerald-600 dark:text-emerald-400">✓ Guardado</p>}
        {error && <p className="text-sm text-red-500">✗ {error}</p>}
      </div>
    </div>
  )
}
