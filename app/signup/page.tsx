'use client'

import { useState } from 'react'
import Link from 'next/link'
import { createClientBrowser } from '@/lib/supabase'
import { useRouter } from 'next/navigation'
import { PRODUCT, productMonogram } from '@/lib/brand'

export default function SignupPage() {
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [info, setInfo] = useState('')
  const router = useRouter()
  const supabase = createClientBrowser()
  const accent = PRODUCT.accent || '#6366f1'

  async function handleSignup(e: React.FormEvent) {
    e.preventDefault()
    setLoading(true)
    setError('')
    setInfo('')
    if (password.length < 6) {
      setError('La contraseña debe tener al menos 6 caracteres')
      setLoading(false)
      return
    }
    const { data, error: signErr } = await supabase.auth.signUp({ email, password })
    if (signErr) {
      setError(signErr.message.includes('already') ? 'Ese email ya tiene cuenta. Iniciá sesión.' : signErr.message)
      setLoading(false)
      return
    }
    // Si el proyecto no exige confirmación de email, ya hay sesión → al onboarding.
    if (data.session) {
      router.push('/onboarding')
      router.refresh()
      return
    }
    // Intentar iniciar sesión directo (por si la confirmación está desactivada)
    const { error: loginErr } = await supabase.auth.signInWithPassword({ email, password })
    if (!loginErr) {
      router.push('/onboarding')
      router.refresh()
    } else {
      setInfo('Te enviamos un email para confirmar tu cuenta. Confirmalo y volvé a iniciar sesión.')
      setLoading(false)
    }
  }

  return (
    <div className="min-h-screen flex text-white" style={{ background: '#07070c' }}>
      <div className="pointer-events-none fixed inset-0 overflow-hidden">
        <div style={{ position: 'absolute', width: 520, height: 520, top: -160, left: -120, borderRadius: '50%', filter: 'blur(90px)', opacity: 0.5, background: `radial-gradient(circle, ${accent}, transparent 70%)` }} />
        <div style={{ position: 'absolute', width: 460, height: 460, bottom: -160, right: -120, borderRadius: '50%', filter: 'blur(90px)', opacity: 0.45, background: 'radial-gradient(circle, #a855f7, transparent 70%)' }} />
      </div>

      {/* Panel izquierdo — marca */}
      <div className="hidden lg:flex lg:w-1/2 relative z-10 flex-col justify-between p-14">
        <Link href="/" className="flex items-center gap-2.5 w-fit">
          <span className="w-9 h-9 rounded-xl flex items-center justify-center text-sm font-bold" style={{ background: `linear-gradient(135deg, ${accent}, #a855f7)`, boxShadow: `0 8px 24px ${accent}66` }}>{productMonogram()}</span>
          <span className="text-lg font-bold tracking-tight">{PRODUCT.name}</span>
        </Link>
        <div className="max-w-md">
          <h2 className="text-4xl font-bold leading-tight tracking-tight">
            Empezá gratis.<br />
            <span style={{ background: 'linear-gradient(120deg,#818cf8,#c084fc 45%,#22d3ee)', WebkitBackgroundClip: 'text', backgroundClip: 'text', color: 'transparent' }}>Sin tarjeta.</span>
          </h2>
          <p className="mt-4 text-zinc-400 text-[15px] leading-relaxed">Conectá tu tienda y tus ads en 2 minutos y mirá tu negocio como nunca antes.</p>
          <div className="mt-8 flex flex-col gap-3">
            {['14 días de prueba, sin tarjeta', 'Se conecta a Tiendanube, Shopify y Meta', 'Tu dashboard listo en minutos'].map((t) => (
              <div key={t} className="flex items-center gap-2.5 text-sm text-zinc-300">
                <span className="w-5 h-5 rounded-full flex items-center justify-center shrink-0" style={{ background: `${accent}22` }}>
                  <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke={accent} strokeWidth="3" strokeLinecap="round" strokeLinejoin="round"><polyline points="20 6 9 17 4 12" /></svg>
                </span>{t}
              </div>
            ))}
          </div>
        </div>
        <p className="text-zinc-600 text-xs">© 2026 {PRODUCT.name} · Analytics para ecommerce</p>
      </div>

      {/* Panel derecho — form */}
      <div className="flex-1 flex items-center justify-center relative z-10 px-6">
        <div className="w-full max-w-sm">
          <div className="lg:hidden flex items-center justify-center gap-2.5 mb-8">
            <span className="w-9 h-9 rounded-xl flex items-center justify-center text-sm font-bold" style={{ background: `linear-gradient(135deg, ${accent}, #a855f7)` }}>{productMonogram()}</span>
            <span className="text-lg font-bold">{PRODUCT.name}</span>
          </div>

          <div className="mb-7">
            <h1 className="text-2xl font-bold tracking-tight">Creá tu cuenta</h1>
            <p className="text-sm text-zinc-400 mt-1.5">Gratis, sin tarjeta de crédito.</p>
          </div>

          <div className="rounded-2xl p-8" style={{ background: 'rgba(255,255,255,.04)', border: '1px solid rgba(255,255,255,.09)', backdropFilter: 'blur(10px)' }}>
            <form onSubmit={handleSignup} className="space-y-5">
              <div>
                <label className="block text-xs font-semibold text-zinc-400 uppercase tracking-wide mb-2">Email</label>
                <input type="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="tu@ecommerce.com" required
                  className="w-full px-4 py-3 rounded-xl text-sm text-white placeholder-zinc-600 focus:outline-none transition-all"
                  style={{ background: 'rgba(255,255,255,.05)', border: '1px solid rgba(255,255,255,.1)' }}
                  onFocus={(e) => (e.currentTarget.style.borderColor = accent)} onBlur={(e) => (e.currentTarget.style.borderColor = 'rgba(255,255,255,.1)')} />
              </div>
              <div>
                <label className="block text-xs font-semibold text-zinc-400 uppercase tracking-wide mb-2">Contraseña</label>
                <input type="password" value={password} onChange={(e) => setPassword(e.target.value)} placeholder="Mínimo 6 caracteres" required
                  className="w-full px-4 py-3 rounded-xl text-sm text-white placeholder-zinc-600 focus:outline-none transition-all"
                  style={{ background: 'rgba(255,255,255,.05)', border: '1px solid rgba(255,255,255,.1)' }}
                  onFocus={(e) => (e.currentTarget.style.borderColor = accent)} onBlur={(e) => (e.currentTarget.style.borderColor = 'rgba(255,255,255,.1)')} />
              </div>

              {error && <div className="text-sm text-red-400 px-4 py-3 rounded-xl" style={{ background: 'rgba(239,68,68,.1)', border: '1px solid rgba(239,68,68,.25)' }}>{error}</div>}
              {info && <div className="text-sm text-emerald-300 px-4 py-3 rounded-xl" style={{ background: 'rgba(16,185,129,.1)', border: '1px solid rgba(16,185,129,.25)' }}>{info}</div>}

              <button type="submit" disabled={loading}
                className="w-full py-3 rounded-xl text-sm font-semibold tracking-wide text-white transition-all disabled:opacity-50"
                style={{ background: `linear-gradient(135deg, ${accent}, #a855f7)`, boxShadow: `0 8px 24px ${accent}55` }}>
                {loading ? 'Creando cuenta…' : 'Crear cuenta gratis →'}
              </button>
            </form>
          </div>

          <p className="text-center text-xs text-zinc-500 mt-6">
            ¿Ya tenés cuenta? <Link href="/login" className="text-zinc-300 hover:text-white transition-colors font-medium">Iniciá sesión</Link>
          </p>
        </div>
      </div>
    </div>
  )
}
