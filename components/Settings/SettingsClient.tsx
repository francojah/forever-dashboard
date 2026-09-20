'use client'

import { useState, useEffect } from 'react'
import HealthPanel from '@/components/Settings/HealthPanel'
import ProductCostsCard from '@/components/Settings/ProductCostsCard'

interface Settings {
  breakeven_cpa:        number
  roas_min:             number
  roas_scale:           number
  tn_commission_pct:    number
  shipping_pct:         number
  cuotas_cost_pct:      number
  card_sales_pct:       number
  iibb_rate_pct:        number
  unit_cost_default:    number
  packaging_per_order:  number
  units_per_order:      number
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

const REC_CATS = [
  { value: 'fijo',        label: 'Gasto fijo' },
  { value: 'logistica',   label: 'Logística' },
  { value: 'personal',    label: 'Personal / sueldos' },
  { value: 'servicios',   label: 'Servicios / SaaS' },
  { value: 'packaging',   label: 'Packaging / insumos' },
  { value: 'distribucion',label: 'Distribución ganancias' },
  { value: 'otro',        label: 'Otro' },
]

// ── Input field helper ────────────────────────────────────────────────────────
function FieldRow({ label, desc, prefix, suffix, step, value, onChange }: {
  label: string; desc: string; prefix?: string; suffix?: string; step: number
  value: number; onChange: (v: string) => void
}) {
  return (
    <div className="flex items-center justify-between gap-6 px-5 py-4">
      <div className="flex-1">
        <p className="text-sm font-medium text-gray-800 dark:text-zinc-200">{label}</p>
        <p className="text-xs text-gray-400 dark:text-zinc-500 mt-0.5">{desc}</p>
      </div>
      <div className="flex items-center gap-1.5 shrink-0">
        {prefix && <span className="text-sm text-gray-400">{prefix}</span>}
        <input
          type="number"
          step={step}
          value={value}
          onChange={e => onChange(e.target.value)}
          className="w-24 text-right text-sm font-medium bg-gray-50 dark:bg-zinc-800 border border-gray-200 dark:border-zinc-700 rounded-lg px-3 py-1.5 text-gray-900 dark:text-zinc-100 focus:outline-none focus:ring-2 focus:ring-gray-400 dark:focus:ring-zinc-500"
        />
        {suffix && <span className="text-sm text-gray-400">{suffix}</span>}
      </div>
    </div>
  )
}

// ── Save button bar ───────────────────────────────────────────────────────────
function SaveBar({ onSave, saving, saved, error }: {
  onSave: () => void; saving: boolean; saved: boolean; error: string
}) {
  return (
    <div className="flex items-center gap-3 pt-2">
      <button
        onClick={onSave}
        disabled={saving}
        className="px-5 py-2 bg-gray-900 dark:bg-white text-white dark:text-gray-900 rounded-lg text-sm font-medium hover:bg-gray-700 dark:hover:bg-gray-100 disabled:opacity-50 transition-all"
      >
        {saving ? 'Guardando…' : 'Guardar cambios'}
      </button>
      {saved && <p className="text-sm text-emerald-600 dark:text-emerald-400">✓ Guardado</p>}
      {error && <p className="text-sm text-red-500">✗ {error}</p>}
    </div>
  )
}

// ── Meta Account Selector ─────────────────────────────────────────────────────
interface MetaAccount { id: string; name: string; status: number; status_label: string; currency: string }

function MetaAccountSelector() {
  const [accounts, setAccounts] = useState<MetaAccount[]>([])
  const [active,   setActive]   = useState<string>('')
  const [loading,  setLoading]  = useState(true)
  const [saving,   setSaving]   = useState(false)
  const [error,    setError]    = useState('')

  async function load() {
    setLoading(true); setError('')
    try {
      const r = await fetch('/api/meta-accounts'); const d = await r.json()
      if (d.error) throw new Error(d.error)
      setAccounts(d.accounts || [])
      setActive(d.active || '')
    } catch (e) { setError(e instanceof Error ? e.message : 'Error') }
    setLoading(false)
  }
  useEffect(() => { load() }, [])

  async function save(id: string) {
    setSaving(true); setError('')
    try {
      const r = await fetch('/api/meta-accounts', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ account_id: id }) })
      const d = await r.json()
      if (d.error) throw new Error(d.error)
      setActive(id)
    } catch (e) { setError(e instanceof Error ? e.message : 'Error') }
    setSaving(false)
  }

  const activeAcc = accounts.find(a => a.id === active)

  if (loading) return (
    <div className="bg-white dark:bg-zinc-900 rounded-xl border border-gray-200 dark:border-zinc-800 px-5 py-4 text-sm text-gray-400 dark:text-zinc-500">
      Cargando cuentas…
    </div>
  )

  if (error) return (
    <div className="bg-red-50 dark:bg-red-950/20 rounded-xl border border-red-200 dark:border-red-900/40 px-5 py-4 text-sm text-red-600 dark:text-red-400">
      {error}
    </div>
  )

  return (
    <div className="bg-white dark:bg-zinc-900 rounded-xl border border-gray-200 dark:border-zinc-800 shadow-sm overflow-hidden">
      <div className="flex items-center gap-3 px-5 py-4 border-b border-gray-100 dark:border-zinc-800">
        <div className="w-8 h-8 rounded-lg bg-blue-700 flex items-center justify-center shrink-0">
          <svg viewBox="0 0 24 24" className="w-4 h-4 text-white" fill="currentColor">
            <path d="M24 12.073c0-6.627-5.373-12-12-12s-12 5.373-12 12c0 5.99 4.388 10.954 10.125 11.854v-8.385H7.078v-3.47h3.047V9.43c0-3.007 1.792-4.669 4.533-4.669 1.312 0 2.686.235 2.686.235v2.953H15.83c-1.491 0-1.956.925-1.956 1.874v2.25h3.328l-.532 3.47h-2.796v8.385C19.612 23.027 24 18.062 24 12.073z"/>
          </svg>
        </div>
        <div>
          <p className="text-sm font-semibold text-gray-800 dark:text-zinc-200">Cuenta de Meta Ads</p>
          {activeAcc && (
            <p className="text-xs text-gray-500 dark:text-zinc-400">{activeAcc.name} · {activeAcc.currency}</p>
          )}
        </div>
      </div>
      <div className="divide-y divide-gray-100 dark:divide-zinc-800">
        {accounts.map(acc => (
          <button
            key={acc.id}
            onClick={() => save(acc.id)}
            disabled={saving}
            className={`w-full flex items-center justify-between px-5 py-3.5 text-left transition-colors ${
              acc.id === active
                ? 'bg-blue-50 dark:bg-blue-950/30'
                : 'hover:bg-gray-50 dark:hover:bg-zinc-800/50'
            }`}
          >
            <div>
              <p className="text-sm font-medium text-gray-800 dark:text-zinc-200">{acc.name}</p>
              <p className="text-xs text-gray-400 dark:text-zinc-500">{acc.id} · {acc.currency}</p>
            </div>
            <div className="flex items-center gap-2 shrink-0">
              <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${
                acc.status === 1
                  ? 'bg-emerald-100 dark:bg-emerald-950/40 text-emerald-700 dark:text-emerald-400'
                  : 'bg-gray-100 dark:bg-zinc-800 text-gray-500 dark:text-zinc-400'
              }`}>{acc.status_label}</span>
              {acc.id === active && (
                <span className="w-2 h-2 rounded-full bg-blue-500" />
              )}
            </div>
          </button>
        ))}
      </div>
      {accounts.length === 0 && (
        <div className="px-5 py-4 text-sm text-gray-400 dark:text-zinc-500">
          No se encontraron cuentas publicitarias.
        </div>
      )}
    </div>
  )
}

// ── TN Connection Card ────────────────────────────────────────────────────────
function TNConnectionCard() {
  const [status, setStatus] = useState<TNStatus | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    fetch('/api/tiendanube/status')
      .then(r => r.json())
      .then(d => { setStatus(d); setLoading(false) })
      .catch(() => setLoading(false))
  }, [])

  if (loading) return (
    <div className="bg-white dark:bg-zinc-900 rounded-xl border border-gray-200 dark:border-zinc-800 px-5 py-4 text-sm text-gray-400 dark:text-zinc-500">
      Verificando conexión…
    </div>
  )

  const isOk = status?.configured && status?.valid

  return (
    <div className="bg-white dark:bg-zinc-900 rounded-xl border border-gray-200 dark:border-zinc-800 shadow-sm overflow-hidden">
      <div className="flex items-center gap-3 px-5 py-4 border-b border-gray-100 dark:border-zinc-800">
        <div className={`w-8 h-8 rounded-lg flex items-center justify-center shrink-0 ${isOk ? 'bg-violet-600' : 'bg-gray-300 dark:bg-zinc-700'}`}>
          <svg viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" className="w-4 h-4">
            <path d="M6 2L3 6v14a2 2 0 002 2h14a2 2 0 002-2V6l-3-4z"/><line x1="3" y1="6" x2="21" y2="6"/><path d="M16 10a4 4 0 01-8 0"/>
          </svg>
        </div>
        <div className="flex-1">
          <p className="text-sm font-semibold text-gray-800 dark:text-zinc-200">Tiendanube</p>
          <div className="flex items-center gap-1.5 mt-0.5">
            <span className={`w-1.5 h-1.5 rounded-full ${isOk ? 'bg-emerald-500' : 'bg-red-500'}`} />
            <span className="text-xs text-gray-500 dark:text-zinc-400">{isOk ? 'Conectado' : 'Sin conexión'}</span>
            {status?.source === 'env' && (
              <span className="text-micro bg-gray-100 dark:bg-zinc-800 text-gray-500 dark:text-zinc-400 px-1.5 py-0.5 rounded-full font-medium ml-1">Env vars</span>
            )}
          </div>
        </div>
      </div>
      <div className="px-5 py-4 space-y-3">
        {isOk ? (
          <>
            <div className="grid grid-cols-2 gap-2 text-xs">
              <div>
                <p className="text-gray-400 dark:text-zinc-500 mb-0.5">Tienda</p>
                <p className="font-medium text-gray-700 dark:text-zinc-300">
                  {status?.store_url
                    ? <a href={status.store_url} target="_blank" rel="noopener noreferrer" className="hover:underline">{status.store_name}</a>
                    : status?.store_name}
                </p>
              </div>
              <div>
                <p className="text-gray-400 dark:text-zinc-500 mb-0.5">User ID</p>
                <p className="font-mono font-medium text-gray-700 dark:text-zinc-300">{status?.user_id}</p>
              </div>
              {status?.connected_at && (
                <div className="col-span-2">
                  <p className="text-gray-400 dark:text-zinc-500 mb-0.5">Conectado el</p>
                  <p className="font-medium text-gray-700 dark:text-zinc-300">
                    {new Date(status.connected_at).toLocaleDateString('es-AR', { day: 'numeric', month: 'long', year: 'numeric' })}
                  </p>
                </div>
              )}
            </div>
            {status?.reconnect_url && (
              <a href={status.reconnect_url} target="_blank" rel="noopener noreferrer"
                className="inline-flex items-center gap-1.5 text-xs text-gray-400 dark:text-zinc-500 hover:text-gray-600 dark:hover:text-zinc-300 transition-colors">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="w-3 h-3">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M16.023 9.348h4.992v-.001M2.985 19.644v-4.992m0 0h4.992m-4.993 0l3.181 3.183a8.25 8.25 0 0013.803-3.7M4.031 9.865a8.25 8.25 0 0113.803-3.7l3.181 3.182m0-4.991v4.99" />
                </svg>
                Reconectar / renovar token
              </a>
            )}
          </>
        ) : (
          <div className="space-y-3">
            {status?.error && (
              <p className="text-xs text-gray-500 dark:text-zinc-500">{status.error}</p>
            )}
            <div className="bg-amber-50 dark:bg-amber-900/15 border border-amber-200 dark:border-amber-900/40 rounded-lg p-3 text-xs text-amber-800 dark:text-amber-300 space-y-1.5">
              <p className="font-semibold">Cómo reconectar:</p>
              <ol className="list-decimal list-inside space-y-1 text-amber-700 dark:text-amber-400">
                <li>Hacé clic en el botón de abajo — abre la página de autorización de TN</li>
                <li>Aprobá el acceso con tu cuenta de Tiendanube</li>
                <li>El token nuevo se guarda automáticamente</li>
              </ol>
            </div>
            {status?.reconnect_url && (
              <a href={status.reconnect_url} target="_blank" rel="noopener noreferrer"
                className="inline-flex items-center gap-2 bg-blue-600 hover:bg-blue-500 text-white px-4 py-2 rounded-lg text-sm font-medium transition-colors">
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

// ── Recurring Expenses ────────────────────────────────────────────────────────
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
        <div>
          <p className="text-sm font-semibold text-gray-800 dark:text-zinc-200">Gastos fijos mensuales</p>
          <p className="text-xs text-gray-400 dark:text-zinc-500 mt-0.5">Se suman automáticamente al P&L mensual en Balance.</p>
        </div>
        {monthlyTotal > 0 && (
          <span className="text-xs text-gray-500 dark:text-zinc-400 bg-gray-100 dark:bg-zinc-800 px-2 py-1 rounded-full font-medium">
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
    </div>
  )
}

// ── Tab definitions ───────────────────────────────────────────────────────────
const TABS = [
  { id: 'conexiones', label: 'Conexiones',  icon: '🔌' },
  { id: 'metaads',    label: 'Meta Ads',    icon: '📈' },
  { id: 'ecommerce',  label: 'Ecommerce',   icon: '🛍️' },
  { id: 'costos',     label: 'Costos',      icon: '📦' },
  { id: 'fiscal',     label: 'Fiscal',      icon: '🏛️' },
]

// ── Main component ────────────────────────────────────────────────────────────
export default function SettingsClient({ initialSettings }: Props) {
  const [settings, setSettings] = useState<Settings>(initialSettings)
  const [saving, setSaving]     = useState(false)
  const [saved, setSaved]       = useState(false)
  const [error, setError]       = useState('')
  const [tab, setTab]           = useState('conexiones')

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
      {/* Header */}
      <div>
        <h1 className="text-xl font-semibold text-gray-900 dark:text-zinc-100">Configuración</h1>
        <p className="text-sm text-gray-500 dark:text-zinc-500 mt-0.5">Parámetros del negocio e integraciones.</p>
      </div>

      {/* System health — always visible */}
      <HealthPanel />

      {/* Tab bar */}
      <div className="flex gap-1 bg-gray-100 dark:bg-zinc-800 rounded-xl p-1">
        {TABS.map(t => (
          <button
            key={t.id}
            onClick={() => setTab(t.id)}
            className={`flex-1 flex items-center justify-center gap-1.5 px-3 py-2 rounded-lg text-xs font-medium transition-all ${
              tab === t.id
                ? 'bg-white dark:bg-zinc-900 text-gray-900 dark:text-zinc-100 shadow-sm'
                : 'text-gray-500 dark:text-zinc-400 hover:text-gray-700 dark:hover:text-zinc-300'
            }`}
          >
            <span>{t.icon}</span>
            <span className="hidden sm:inline">{t.label}</span>
          </button>
        ))}
      </div>

      {/* ── Tab: Conexiones ── */}
      {tab === 'conexiones' && (
        <div className="space-y-4">
          <MetaAccountSelector />
          <TNConnectionCard />
        </div>
      )}

      {/* ── Tab: Meta Ads ── */}
      {tab === 'metaads' && (
        <div className="space-y-4">
          <div className="bg-white dark:bg-zinc-900 rounded-xl border border-gray-200 dark:border-zinc-800 divide-y divide-gray-100 dark:divide-zinc-800 shadow-sm">
            <FieldRow
              label="CPA de Breakeven"
              desc="CPA máximo antes de perder dinero por orden."
              prefix="$" suffix="ARS" step={500}
              value={settings.breakeven_cpa}
              onChange={v => handleChange('breakeven_cpa', v)}
            />
            <FieldRow
              label="ROAS Mínimo"
              desc="ROAS por debajo del cual un anuncio se considera no rentable."
              suffix="x" step={0.1}
              value={settings.roas_min}
              onChange={v => handleChange('roas_min', v)}
            />
            <FieldRow
              label="ROAS para Escalar"
              desc="ROAS a partir del cual se recomienda duplicar budget."
              suffix="x" step={0.5}
              value={settings.roas_scale}
              onChange={v => handleChange('roas_scale', v)}
            />
          </div>

          {/* Rules preview */}
          <div className="bg-gray-50 dark:bg-zinc-800/40 rounded-xl border border-gray-200 dark:border-zinc-700 p-4">
            <p className="text-xs font-medium text-gray-500 dark:text-zinc-400 mb-3 uppercase tracking-wide">Reglas de decisión</p>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 text-xs text-gray-600 dark:text-zinc-400">
              <p>🟢 <strong>Escalar</strong> si ROAS ≥ {settings.roas_scale}x</p>
              <p>🔵 <strong>Mantener</strong> si ROAS {settings.roas_min}x–{settings.roas_scale}x</p>
              <p>🟡 <strong>Vigilar</strong> si CPA &gt; ${(settings.breakeven_cpa / 1000).toFixed(1)}K</p>
              <p>🔴 <strong>Pausar</strong> si CPA &gt; ${(settings.breakeven_cpa * 1.5 / 1000).toFixed(1)}K o ROAS &lt; {settings.roas_min}x</p>
            </div>
          </div>

          <SaveBar onSave={save} saving={saving} saved={saved} error={error} />
        </div>
      )}

      {/* ── Tab: Ecommerce ── */}
      {tab === 'ecommerce' && (
        <div className="space-y-4">
          <div className="bg-white dark:bg-zinc-900 rounded-xl border border-gray-200 dark:border-zinc-800 divide-y divide-gray-100 dark:divide-zinc-800 shadow-sm">
            <FieldRow
              label="Comisión plan TN (%)"
              desc="Comisión de la plataforma según tu plan. Plan Evolución ~1.2%, Turbo 0%."
              suffix="%" step={0.1}
              value={settings.tn_commission_pct}
              onChange={v => handleChange('tn_commission_pct', v)}
            />
            <FieldRow
              label="Gastos de Envío (% ventas)"
              desc="Estimación del costo de envío como % del total de ventas para meses sin dato real."
              suffix="%" step={0.5}
              value={settings.shipping_pct}
              onChange={v => handleChange('shipping_pct', v)}
            />
          </div>
          <SaveBar onSave={save} saving={saving} saved={saved} error={error} />
        </div>
      )}

      {/* ── Tab: Costos ── */}
      {tab === 'costos' && (
        <div className="space-y-4">
          {/* Per-product costs (ProductCostsCard) */}
          <ProductCostsCard />

          {/* COGS fallback defaults */}
          <div>
            <p className="text-xs font-semibold text-gray-400 dark:text-zinc-500 uppercase tracking-wider mb-2">Fallback COGS (cuando no hay costo por producto)</p>
            <div className="bg-white dark:bg-zinc-900 rounded-xl border border-gray-200 dark:border-zinc-800 divide-y divide-gray-100 dark:divide-zinc-800 shadow-sm">
              <FieldRow
                label="Costo unitario default"
                desc="ARS por unidad cuando un producto no tiene costo cargado individualmente."
                prefix="$" suffix="ARS" step={100}
                value={settings.unit_cost_default}
                onChange={v => handleChange('unit_cost_default', v)}
              />
              <FieldRow
                label="Packaging por orden"
                desc="Costo de packaging e insumos (bolsas, papel tissue, etc.) por cada orden enviada."
                prefix="$" suffix="ARS" step={10}
                value={settings.packaging_per_order}
                onChange={v => handleChange('packaging_per_order', v)}
              />
              <FieldRow
                label="Unidades por orden (fallback)"
                desc="Promedio de unidades por orden. Solo se usa cuando TN no informa total_units_sold."
                suffix="u" step={0.5}
                value={settings.units_per_order}
                onChange={v => handleChange('units_per_order', v)}
              />
            </div>
          </div>

          <SaveBar onSave={save} saving={saving} saved={saved} error={error} />
        </div>
      )}

      {/* ── Tab: Fiscal ── */}
      {tab === 'fiscal' && (
        <div className="space-y-4">
          <div className="flex items-center gap-2 mb-1">
            <span className="text-micro bg-amber-100 dark:bg-amber-950/40 text-amber-700 dark:text-amber-400 px-1.5 py-0.5 rounded font-medium">Monotributista</span>
            <p className="text-xs text-gray-400 dark:text-zinc-500">Ajustar si pasás a Responsable Inscripto</p>
          </div>

          <div className="bg-white dark:bg-zinc-900 rounded-xl border border-gray-200 dark:border-zinc-800 divide-y divide-gray-100 dark:divide-zinc-800 shadow-sm">
            <FieldRow
              label="Costo financiero cuotas (%)"
              desc="Descuento del procesador por ventas con tarjeta. Ej: MP ~8-12% en 6 cuotas s/interés."
              suffix="%" step={0.5}
              value={settings.cuotas_cost_pct}
              onChange={v => handleChange('cuotas_cost_pct', v)}
            />
            <FieldRow
              label="% ventas con tarjeta (fallback)"
              desc="Fallback manual para meses históricos sin datos de pago de TN. Se auto-detecta cuando hay datos."
              suffix="%" step={1}
              value={settings.card_sales_pct}
              onChange={v => handleChange('card_sales_pct', v)}
            />
            <FieldRow
              label="IIBB sobre ventas (%)"
              desc="Alícuota de Ingresos Brutos. CABA comercio e-commerce ~3%. Completar según tu provincia y régimen."
              suffix="%" step={0.1}
              value={settings.iibb_rate_pct}
              onChange={v => handleChange('iibb_rate_pct', v)}
            />
          </div>

          <div className="bg-amber-50 dark:bg-amber-900/10 border border-amber-200 dark:border-amber-900/30 rounded-lg px-4 py-3 text-xs text-amber-700 dark:text-amber-400">
            La cuota mensual de monotributo la cargás en <strong>Gastos Recurrentes</strong> (categoría: fijo).
          </div>

          <RecurringExpensesSection />

          <SaveBar onSave={save} saving={saving} saved={saved} error={error} />
        </div>
      )}
    </div>
  )
}
