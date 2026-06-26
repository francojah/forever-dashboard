'use client'

import { useState, useEffect } from 'react'
import Link from 'next/link'

interface Settings {
  breakeven_cpa:     number
  roas_min:          number
  roas_scale:        number
  tn_commission_pct: number
  shipping_pct:      number
  cuotas_cost_pct:   number
  card_sales_pct:    number   // % de ventas pagadas con tarjeta (fallback manual)
  iibb_rate_pct:     number
}

interface RecurringExpense {
  id:         string
  name:       string
  amount_ars: number
  category:   string
  active:     boolean
  created_at: string
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

const FIELDS: { key: keyof Settings; label: string; desc: string; prefix?: string; suffix?: string; step: number; section?: string }[] = [
  { key: 'breakeven_cpa',     label: 'CPA de Breakeven',            desc: 'CPA máximo antes de perder dinero por orden.',                                                                        prefix: '$', suffix: 'ARS', step: 500  },
  { key: 'roas_min',          label: 'ROAS Mínimo',                 desc: 'ROAS por debajo del cual un anuncio se considera no rentable.',                                                                   suffix: 'x',   step: 0.1  },
  { key: 'roas_scale',        label: 'ROAS para Escalar',           desc: 'ROAS a partir del cual se recomienda duplicar budget.',                                                                          suffix: 'x',   step: 0.5  },
  { key: 'tn_commission_pct', label: 'Comisión Tiendanube',         desc: 'Porcentaje de comisión que cobra Tiendanube sobre ventas.',                                                                     suffix: '%',   step: 0.1  },
  { key: 'shipping_pct',      label: 'Gastos de Envío (% ventas)',  desc: 'Estimación del costo de envío como % del total de ventas (para Balance).',                            suffix: '%',   step: 0.5  },
  { key: 'cuotas_cost_pct',   label: 'Costo financiero cuotas (%)', desc: 'Descuento que cobra el procesador por ventas con tarjeta. Ej: Mercado Pago ~8-12% en 6 cuotas s/interés. Se aplica solo sobre la fracción de ventas con tarjeta.', suffix: '%', step: 0.5, section: 'fiscal' },
  { key: 'card_sales_pct',    label: '% ventas con tarjeta (fallback)', desc: 'Qué porcentaje de tus ventas son con tarjeta de crédito/débito. Si hay datos de TN disponibles se usa el valor automático; este número aplica para meses históricos sin datos de pago.', suffix: '%', step: 1, section: 'fiscal' },
  { key: 'iibb_rate_pct',     label: 'IIBB sobre ventas (%)',       desc: 'Alícuota de Ingresos Brutos. CABA comercio e-commerce ~3%. Completar según tu provincia y régimen.',                suffix: '%', step: 0.1, section: 'fiscal' },
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

const REC_CATS = [
  { value: 'fijo',        label: 'Gasto fijo' },
  { value: 'logistica',   label: 'Logística' },
  { value: 'personal',    label: 'Personal / sueldos' },
  { value: 'servicios',   label: 'Servicios / SaaS' },
  { value: 'packaging',   label: 'Packaging / insumos' },
  { value: 'distribucion',label: 'Distribución ganancias' },
  { value: 'otro',        label: 'Otro' },
]

function RecurringExpensesSection() {
  const [items,    setItems]    = useState<RecurringExpense[]>([])
  const [loading,  setLoading]  = useState(true)
  const [showAdd,  setShowAdd]  = useState(false)
  const [newName,  setNewName]  = useState('')
  const [newAmt,   setNewAmt]   = useState('')
  const [newCat,   setNewCat]   = useState('fijo')
  const [saving,   setSaving]   = useState(false)
  const [error,    setError]    = useState('')

  async function load() {
    setLoading(true)
    try {
      const r = await fetch('/api/recurring-expenses')
      const d = await r.json()
      if (Array.isArray(d)) setItems(d)
    } catch { /* ignore */ }
    setLoading(false)
  }
  useEffect(() => { load() }, [])

  async function add() {
    if (!newName.trim() || !newAmt) return
    setSaving(true); setError('')
    try {
      const r = await fetch('/api/recurring-expenses', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: newName.trim(), amount_ars: Number(newAmt), category: newCat }),
      })
      const d = await r.json()
      if (d.error) throw new Error(d.error)
      setItems(prev => [...prev, d])
      setNewName(''); setNewAmt(''); setNewCat('fijo'); setShowAdd(false)
    } catch (e) { setError(e instanceof Error ? e.message : 'Error') }
    setSaving(false)
  }

  async function toggle(item: RecurringExpense) {
    const optimistic = items.map(x => x.id === item.id ? { ...x, active: !x.active } : x)
    setItems(optimistic)
    await fetch(`/api/recurring-expenses?id=${item.id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ active: !item.active }),
    })
  }

  async function remove(id: string) {
    setItems(prev => prev.filter(x => x.id !== id))
    await fetch(`/api/recurring-expenses?id=${id}`, { method: 'DELETE' })
  }

  const monthlyTotal = items.filter(x => x.active).reduce((s, x) => s + x.amount_ars, 0)

  return (
    <div>
      <div className="flex items-center justify-between mb-3">
        <p className="text-xs font-semibold text-gray-400 dark:text-zinc-500 uppercase tracking-wider">
          Gastos fijos mensuales
        </p>
        {monthlyTotal > 0 && (
          <span className="text-xs text-gray-500 dark:text-zinc-400 bg-gray-100 dark:bg-zinc-800 px-2 py-0.5 rounded-full">
            Piso: ${(monthlyTotal / 1000).toFixed(0)}K/mes
          </span>
        )}
      </div>
      <div className="bg-white dark:bg-zinc-900 rounded-xl border border-gray-200 dark:border-zinc-800 shadow-sm overflow-hidden">
        {loading ? (
          <div className="px-5 py-6 text-sm text-gray-400 dark:text-zinc-500 text-center">Cargando…</div>
        ) : items.length === 0 && !showAdd ? (
          <div className="px-5 py-6 text-center">
            <p className="text-sm text-gray-400 dark:text-zinc-500 mb-3">Sin gastos fijos configurados.</p>
          </div>
        ) : (
          <div className="divide-y divide-gray-100 dark:divide-zinc-800">
            {items.map(item => {
              const cat = REC_CATS.find(c => c.value === item.category)
              return (
                <div key={item.id} className={`flex items-center justify-between px-5 py-3.5 gap-4 transition-opacity ${item.active ? '' : 'opacity-50'}`}>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium text-gray-800 dark:text-zinc-200 truncate">{item.name}</p>
                    <p className="text-xs text-gray-400 dark:text-zinc-500">{cat?.label ?? item.category}</p>
                  </div>
                  <span className="text-sm font-semibold text-gray-700 dark:text-zinc-300 tabular-nums shrink-0">
                    ${(item.amount_ars / 1000).toFixed(0)}K/mes
                  </span>
                  {/* Toggle */}
                  <button
                    onClick={() => toggle(item)}
                    className={`relative w-9 h-5 rounded-full transition-colors shrink-0 ${item.active ? 'bg-emerald-500' : 'bg-gray-300 dark:bg-zinc-700'}`}
                  >
                    <span className={`absolute top-0.5 left-0.5 w-4 h-4 bg-white rounded-full shadow transition-transform ${item.active ? 'translate-x-4' : ''}`} />
                  </button>
                  <button onClick={() => remove(item.id)} className="text-gray-300 dark:text-zinc-600 hover:text-red-400 transition-colors shrink-0">
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="w-4 h-4">
                      <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                    </svg>
                  </button>
                </div>
              )
            })}
          </div>
        )}

        {/* Add form */}
        {showAdd ? (
          <div className="border-t border-gray-100 dark:border-zinc-800 px-5 py-4 space-y-3 bg-gray-50/60 dark:bg-zinc-800/30">
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="text-xs text-gray-500 dark:text-zinc-400 mb-1 block">Nombre</label>
                <input
                  type="text"
                  placeholder="ej: Sueldo community"
                  value={newName}
                  onChange={e => setNewName(e.target.value)}
                  className="w-full text-sm bg-white dark:bg-zinc-900 border border-gray-200 dark:border-zinc-700 rounded-lg px-3 py-1.5 text-gray-900 dark:text-zinc-100 focus:outline-none focus:ring-2 focus:ring-gray-400"
                />
              </div>
              <div>
                <label className="text-xs text-gray-500 dark:text-zinc-400 mb-1 block">Monto ARS/mes</label>
                <input
                  type="number"
                  placeholder="ej: 150000"
                  value={newAmt}
                  onChange={e => setNewAmt(e.target.value)}
                  className="w-full text-sm bg-white dark:bg-zinc-900 border border-gray-200 dark:border-zinc-700 rounded-lg px-3 py-1.5 text-gray-900 dark:text-zinc-100 focus:outline-none focus:ring-2 focus:ring-gray-400"
                />
              </div>
            </div>
            <div>
              <label className="text-xs text-gray-500 dark:text-zinc-400 mb-1 block">Categoría</label>
              <select
                value={newCat}
                onChange={e => setNewCat(e.target.value)}
                className="w-full text-sm bg-white dark:bg-zinc-900 border border-gray-200 dark:border-zinc-700 rounded-lg px-3 py-1.5 text-gray-900 dark:text-zinc-100 focus:outline-none focus:ring-2 focus:ring-gray-400"
              >
                {REC_CATS.map(c => <option key={c.value} value={c.value}>{c.label}</option>)}
              </select>
            </div>
            {error && <p className="text-xs text-red-500">{error}</p>}
            <div className="flex items-center gap-2">
              <button
                onClick={add}
                disabled={saving || !newName.trim() || !newAmt}
                className="px-4 py-1.5 bg-gray-900 dark:bg-white text-white dark:text-gray-900 rounded-lg text-xs font-medium disabled:opacity-50 transition-all"
              >
                {saving ? 'Guardando…' : 'Agregar'}
              </button>
              <button onClick={() => setShowAdd(false)} className="px-4 py-1.5 text-xs text-gray-500 dark:text-zinc-400 hover:text-gray-700 dark:hover:text-zinc-200">
                Cancelar
              </button>
            </div>
          </div>
        ) : (
          <div className={`px-5 py-3 ${items.length > 0 ? 'border-t border-gray-100 dark:border-zinc-800' : ''}`}>
            <button
              onClick={() => setShowAdd(true)}
              className="flex items-center gap-1.5 text-xs font-medium text-indigo-600 dark:text-indigo-400 hover:underline"
            >
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="w-3.5 h-3.5">
                <path strokeLinecap="round" strokeLinejoin="round" d="M12 5v14m-7-7h14" />
              </svg>
              Agregar gasto fijo
            </button>
          </div>
        )}
      </div>
      <p className="text-[11px] text-gray-400 dark:text-zinc-600 mt-2">
        Los gastos activos se suman automáticamente al P&amp;L mensual en Balance.
      </p>
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
          {FIELDS.filter(f => !f.section).map(({ key, label, desc, prefix, suffix, step }) => (
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

      {/* Fiscal / financial costs */}
      <div>
        <div className="flex items-center gap-2 mb-3">
          <p className="text-xs font-semibold text-gray-400 dark:text-zinc-500 uppercase tracking-wider">Costos financieros y fiscales</p>
          <span className="text-[10px] bg-amber-100 dark:bg-amber-950/40 text-amber-700 dark:text-amber-400 px-1.5 py-0.5 rounded font-medium">Monotributista</span>
        </div>
        <div className="bg-white dark:bg-zinc-900 rounded-xl border border-gray-200 dark:border-zinc-800 divide-y divide-gray-100 dark:divide-zinc-800 shadow-sm">
          {FIELDS.filter(f => f.section === 'fiscal').map(({ key, label, desc, prefix, suffix, step }) => (
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
                  className="w-24 text-right text-sm font-medium bg-gray-50 dark:bg-zinc-800 border border-gray-200 dark:border-zinc-700 rounded-lg px-3 py-1.5 text-gray-900 dark:text-zinc-100 focus:outline-none focus:ring-2 focus:ring-amber-400 dark:focus:ring-amber-600"
                />
                {suffix && <span className="text-sm text-gray-400">{suffix}</span>}
              </div>
            </div>
          ))}
          <div className="px-5 py-3 bg-gray-50/60 dark:bg-zinc-800/30">
            <p className="text-[11px] text-gray-400 dark:text-zinc-500 leading-relaxed">
              La cuota mensual de monotributo la cargás en <strong className="text-gray-600 dark:text-zinc-400">Gastos Recurrentes</strong> (categoría: fijo).
              Si pasás a <strong className="text-gray-600 dark:text-zinc-400">Responsable Inscripto</strong>, también configurás aquí la alícuota de Ganancias.
            </p>
          </div>
        </div>
      </div>

      {/* Recurring expenses */}
      <RecurringExpensesSection />

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
          {settings.cuotas_cost_pct > 0 && <p>💳 <strong>Cuotas:</strong> {settings.cuotas_cost_pct}% sobre ventas con tarjeta ({settings.card_sales_pct ?? 50}% del total por defecto — se auto-detecta desde TN cuando hay datos)</p>}
          {settings.iibb_rate_pct   > 0 && <p>🏛️ <strong>IIBB:</strong> {settings.iibb_rate_pct}% sobre ventas</p>}
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
