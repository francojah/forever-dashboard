'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { PRODUCT, productMonogram } from '@/lib/brand'

/**
 * OnboardingWizard — Alta self-service: crear marca → números → conectar.
 * Sin tarjeta. Al terminar crea la marca (POST /api/brands) y ofrece conectar
 * la tienda o ir al dashboard.
 */

const accent = PRODUCT.accent || '#6366f1'
const PLATFORMS = [
  { id: 'tiendanube', label: 'Tiendanube' },
  { id: 'shopify', label: 'Shopify' },
  { id: 'woocommerce', label: 'WooCommerce' },
]
const CURRENCIES = ['ARS', 'USD', 'MXN', 'CLP', 'COP', 'EUR']

export default function OnboardingWizard() {
  const router = useRouter()
  const [step, setStep] = useState(1)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')

  const [name, setName] = useState('')
  const [platform, setPlatform] = useState('tiendanube')
  const [currency, setCurrency] = useState('ARS')
  const [breakeven, setBreakeven] = useState('30462')
  const [aov, setAov] = useState('57500')
  const [margin, setMargin] = useState('53')
  const [createdName, setCreatedName] = useState('')

  async function createBrand() {
    setSaving(true)
    setError('')
    try {
      const res = await fetch('/api/brands', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name, platform, currency,
          settings: {
            breakeven_cpa: Number(breakeven) || 30462,
            avg_ticket: Number(aov) || 57500,
            margin_pct: Number(margin) || 53,
            roas_min: margin ? Number((1 / (Number(margin) / 100)).toFixed(2)) : 1.77,
          },
        }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || 'No se pudo crear la marca')
      setCreatedName(data.brand?.name || name)
      setStep(3)
    } catch (e) {
      setError((e as Error).message)
    } finally {
      setSaving(false)
    }
  }

  const input = 'w-full px-4 py-3 rounded-xl text-sm text-white placeholder-zinc-600 focus:outline-none transition-all'
  const inputStyle = { background: 'rgba(255,255,255,.05)', border: '1px solid rgba(255,255,255,.1)' } as const
  const onFocus = (e: React.FocusEvent<HTMLInputElement | HTMLSelectElement>) => (e.currentTarget.style.borderColor = accent)
  const onBlur = (e: React.FocusEvent<HTMLInputElement | HTMLSelectElement>) => (e.currentTarget.style.borderColor = 'rgba(255,255,255,.1)')

  return (
    <div className="min-h-screen flex items-center justify-center text-white px-6" style={{ background: '#07070c' }}>
      <div className="pointer-events-none fixed inset-0 overflow-hidden">
        <div style={{ position: 'absolute', width: 520, height: 520, top: -160, left: -120, borderRadius: '50%', filter: 'blur(90px)', opacity: 0.45, background: `radial-gradient(circle, ${accent}, transparent 70%)` }} />
        <div style={{ position: 'absolute', width: 460, height: 460, bottom: -160, right: -120, borderRadius: '50%', filter: 'blur(90px)', opacity: 0.4, background: 'radial-gradient(circle, #a855f7, transparent 70%)' }} />
      </div>

      <div className="relative z-10 w-full max-w-md">
        {/* Marca + progreso */}
        <div className="flex items-center justify-between mb-6">
          <div className="flex items-center gap-2.5">
            <span className="w-8 h-8 rounded-lg flex items-center justify-center text-xs font-bold" style={{ background: `linear-gradient(135deg, ${accent}, #a855f7)` }}>{productMonogram()}</span>
            <span className="font-bold">{PRODUCT.name}</span>
          </div>
          <div className="flex gap-1.5">
            {[1, 2, 3].map((n) => (
              <span key={n} className="h-1.5 rounded-full transition-all" style={{ width: n === step ? 24 : 8, background: n <= step ? accent : 'rgba(255,255,255,.15)' }} />
            ))}
          </div>
        </div>

        <div className="rounded-2xl p-8" style={{ background: 'rgba(255,255,255,.04)', border: '1px solid rgba(255,255,255,.09)', backdropFilter: 'blur(10px)' }}>
          {step === 1 && (
            <>
              <h1 className="text-xl font-bold tracking-tight">Contanos de tu tienda</h1>
              <p className="text-sm text-zinc-400 mt-1 mb-6">Empecemos por lo básico.</p>
              <div className="space-y-4">
                <div>
                  <label className="block text-xs font-semibold text-zinc-400 uppercase tracking-wide mb-2">Nombre de la marca</label>
                  <input className={input} style={inputStyle} onFocus={onFocus} onBlur={onBlur} value={name} onChange={(e) => setName(e.target.value)} placeholder="Mi Tienda" />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-zinc-400 uppercase tracking-wide mb-2">Plataforma</label>
                  <div className="grid grid-cols-3 gap-2">
                    {PLATFORMS.map((p) => (
                      <button key={p.id} onClick={() => setPlatform(p.id)} type="button"
                        className="py-2.5 rounded-xl text-xs font-medium transition-all"
                        style={{ background: platform === p.id ? `${accent}22` : 'rgba(255,255,255,.05)', border: `1px solid ${platform === p.id ? accent : 'rgba(255,255,255,.1)'}`, color: platform === p.id ? '#fff' : '#a1a1aa' }}>
                        {p.label}
                      </button>
                    ))}
                  </div>
                </div>
                <div>
                  <label className="block text-xs font-semibold text-zinc-400 uppercase tracking-wide mb-2">Moneda</label>
                  <select className={input} style={inputStyle} onFocus={onFocus} onBlur={onBlur} value={currency} onChange={(e) => setCurrency(e.target.value)}>
                    {CURRENCIES.map((c) => <option key={c} value={c} className="bg-zinc-900">{c}</option>)}
                  </select>
                </div>
              </div>
              <button onClick={() => name.trim() && setStep(2)} disabled={!name.trim()}
                className="w-full mt-6 py-3 rounded-xl text-sm font-semibold text-white transition-all disabled:opacity-40"
                style={{ background: `linear-gradient(135deg, ${accent}, #a855f7)` }}>Continuar →</button>
            </>
          )}

          {step === 2 && (
            <>
              <h1 className="text-xl font-bold tracking-tight">Tus números</h1>
              <p className="text-sm text-zinc-400 mt-1 mb-6">Con estos calculamos tu rentabilidad. Podés ajustarlos después.</p>
              <div className="space-y-4">
                <Field label={`Breakeven CPA (${currency})`} hint="CPA máximo antes de perder plata por venta." value={breakeven} onChange={setBreakeven} input={input} inputStyle={inputStyle} onFocus={onFocus} onBlur={onBlur} />
                <Field label={`Ticket promedio (${currency})`} hint="Cuánto gasta un cliente por compra." value={aov} onChange={setAov} input={input} inputStyle={inputStyle} onFocus={onFocus} onBlur={onBlur} />
                <Field label="Margen (%)" hint="Tu margen bruto sobre la venta." value={margin} onChange={setMargin} input={input} inputStyle={inputStyle} onFocus={onFocus} onBlur={onBlur} />
              </div>
              {error && <p className="text-sm text-red-400 mt-4">{error}</p>}
              <div className="flex gap-2 mt-6">
                <button onClick={() => setStep(1)} className="px-4 py-3 rounded-xl text-sm text-zinc-400 hover:text-white transition-colors">Atrás</button>
                <button onClick={createBrand} disabled={saving}
                  className="flex-1 py-3 rounded-xl text-sm font-semibold text-white transition-all disabled:opacity-50"
                  style={{ background: `linear-gradient(135deg, ${accent}, #a855f7)` }}>{saving ? 'Creando…' : `Crear mi ${PRODUCT.name} →`}</button>
              </div>
            </>
          )}

          {step === 3 && (
            <div className="text-center">
              <div className="w-14 h-14 rounded-2xl mx-auto flex items-center justify-center mb-4" style={{ background: `${accent}22` }}>
                <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke={accent} strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><polyline points="20 6 9 17 4 12" /></svg>
              </div>
              <h1 className="text-xl font-bold tracking-tight">¡Listo, {createdName}! 🎉</h1>
              <p className="text-sm text-zinc-400 mt-2 mb-6">Tu Faro está creado. Conectá tu tienda y tus ads para que se llene con tus datos.</p>
              <div className="space-y-2">
                <button onClick={() => router.push('/settings')} className="w-full py-3 rounded-xl text-sm font-semibold text-white transition-all" style={{ background: `linear-gradient(135deg, ${accent}, #a855f7)` }}>
                  Conectar mi tienda
                </button>
                <button onClick={() => { router.push('/'); router.refresh() }} className="w-full py-3 rounded-xl text-sm text-zinc-400 hover:text-white transition-colors" style={{ border: '1px solid rgba(255,255,255,.1)' }}>
                  Ir al dashboard
                </button>
              </div>
            </div>
          )}
        </div>

        {step < 3 && <p className="text-center text-xs text-zinc-600 mt-5">Sin tarjeta · 14 días de prueba</p>}
      </div>
    </div>
  )
}

function Field({ label, hint, value, onChange, input, inputStyle, onFocus, onBlur }: {
  label: string; hint: string; value: string; onChange: (v: string) => void
  input: string; inputStyle: React.CSSProperties
  onFocus: (e: React.FocusEvent<HTMLInputElement>) => void; onBlur: (e: React.FocusEvent<HTMLInputElement>) => void
}) {
  return (
    <div>
      <label className="block text-xs font-semibold text-zinc-400 uppercase tracking-wide mb-1">{label}</label>
      <input type="number" className={input} style={inputStyle} onFocus={onFocus} onBlur={onBlur} value={value} onChange={(e) => onChange(e.target.value)} />
      <p className="text-[11px] text-zinc-600 mt-1">{hint}</p>
    </div>
  )
}
