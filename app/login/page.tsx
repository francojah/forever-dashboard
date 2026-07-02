'use client'

import { useState } from 'react'
import Link from 'next/link'
import { createClientBrowser } from '@/lib/supabase'
import { useRouter } from 'next/navigation'
import { PRODUCT, productMonogram } from '@/lib/brand'

export default function LoginPage() {
  const [email, setEmail]       = useState('')
  const [password, setPassword] = useState('')
  const [loading, setLoading]   = useState(false)
  const [error, setError]       = useState('')
  const router   = useRouter()
  const supabase = createClientBrowser()

  async function handleLogin(e: React.FormEvent) {
    e.preventDefault()
    setLoading(true)
    setError('')
    const { error } = await supabase.auth.signInWithPassword({ email, password })
    if (error) {
      setError('Email o contraseña incorrectos')
      setLoading(false)
    } else {
      router.push('/')
      router.refresh()
    }
  }

  const accent = PRODUCT.accent || '#6366f1'

  return (
    <div className="min-h-screen flex text-white" style={{ background: '#07070c' }}>
      {/* Orbes de fondo */}
      <div className="pointer-events-none fixed inset-0 overflow-hidden">
        <div style={{ position: 'absolute', width: 520, height: 520, top: -160, left: -120, borderRadius: '50%', filter: 'blur(90px)', opacity: 0.5, background: `radial-gradient(circle, ${accent}, transparent 70%)` }} />
        <div style={{ position: 'absolute', width: 460, height: 460, bottom: -160, right: -120, borderRadius: '50%', filter: 'blur(90px)', opacity: 0.45, background: 'radial-gradient(circle, #a855f7, transparent 70%)' }} />
      </div>

      {/* Panel izquierdo — marca */}
      <div className="hidden lg:flex lg:w-1/2 relative z-10 flex-col justify-between p-14">
        <Link href="/" className="flex items-center gap-2.5 w-fit">
          <span className="w-9 h-9 rounded-xl flex items-center justify-center text-sm font-bold" style={{ background: `linear-gradient(135deg, ${accent}, #a855f7)`, boxShadow: `0 8px 24px ${accent}66` }}>
            {productMonogram()}
          </span>
          <span className="text-lg font-bold tracking-tight">{PRODUCT.name}</span>
        </Link>

        <div className="max-w-md">
          <h2 className="text-4xl font-bold leading-tight tracking-tight">
            Tu negocio,<br />
            <span style={{ background: 'linear-gradient(120deg,#818cf8,#c084fc 45%,#22d3ee)', WebkitBackgroundClip: 'text', backgroundClip: 'text', color: 'transparent' }}>
              en una sola vista.
            </span>
          </h2>
          <p className="mt-4 text-zinc-400 text-[15px] leading-relaxed">
            Meta Ads cruzado con tus ventas reales. Margen por producto, LTV, alertas de stock y una IA que te dice qué hacer.
          </p>
          <div className="mt-8 flex flex-col gap-3">
            {['ROAS real, no del pixel', 'Margen neto por producto', 'Alertas de quiebre de stock'].map((t) => (
              <div key={t} className="flex items-center gap-2.5 text-sm text-zinc-300">
                <span className="w-5 h-5 rounded-full flex items-center justify-center shrink-0" style={{ background: `${accent}22` }}>
                  <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke={accent} strokeWidth="3" strokeLinecap="round" strokeLinejoin="round"><polyline points="20 6 9 17 4 12" /></svg>
                </span>
                {t}
              </div>
            ))}
          </div>
        </div>

        <p className="text-zinc-600 text-xs">© 2026 {PRODUCT.name} · Analytics para ecommerce</p>
      </div>

      {/* Panel derecho — form */}
      <div className="flex-1 flex items-center justify-center relative z-10 px-6">
        <div className="w-full max-w-sm">
          {/* Marca mobile */}
          <div className="lg:hidden flex items-center justify-center gap-2.5 mb-8">
            <span className="w-9 h-9 rounded-xl flex items-center justify-center text-sm font-bold" style={{ background: `linear-gradient(135deg, ${accent}, #a855f7)` }}>
              {productMonogram()}
            </span>
            <span className="text-lg font-bold">{PRODUCT.name}</span>
          </div>

          <div className="mb-7">
            <h1 className="text-2xl font-bold tracking-tight">Bienvenido de nuevo</h1>
            <p className="text-sm text-zinc-400 mt-1.5">Ingresá para ver tu dashboard.</p>
          </div>

          <div
            className="rounded-2xl p-8"
            style={{ background: 'rgba(255,255,255,.04)', border: '1px solid rgba(255,255,255,.09)', backdropFilter: 'blur(10px)' }}
          >
            <form onSubmit={handleLogin} className="space-y-5">
              <div>
                <label className="block text-xs font-semibold text-zinc-400 uppercase tracking-wide mb-2">Email</label>
                <input
                  type="email" value={email} onChange={(e) => setEmail(e.target.value)}
                  placeholder="tu@ecommerce.com" required
                  className="w-full px-4 py-3 rounded-xl text-sm text-white placeholder-zinc-600 focus:outline-none transition-all"
                  style={{ background: 'rgba(255,255,255,.05)', border: '1px solid rgba(255,255,255,.1)' }}
                  onFocus={(e) => (e.currentTarget.style.borderColor = accent)}
                  onBlur={(e) => (e.currentTarget.style.borderColor = 'rgba(255,255,255,.1)')}
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-zinc-400 uppercase tracking-wide mb-2">Contraseña</label>
                <input
                  type="password" value={password} onChange={(e) => setPassword(e.target.value)}
                  placeholder="••••••••" required
                  className="w-full px-4 py-3 rounded-xl text-sm text-white placeholder-zinc-600 focus:outline-none transition-all"
                  style={{ background: 'rgba(255,255,255,.05)', border: '1px solid rgba(255,255,255,.1)' }}
                  onFocus={(e) => (e.currentTarget.style.borderColor = accent)}
                  onBlur={(e) => (e.currentTarget.style.borderColor = 'rgba(255,255,255,.1)')}
                />
              </div>

              {error && (
                <div className="flex items-center gap-2 text-sm text-red-400 px-4 py-3 rounded-xl" style={{ background: 'rgba(239,68,68,.1)', border: '1px solid rgba(239,68,68,.25)' }}>
                  <svg className="w-4 h-4 shrink-0" fill="currentColor" viewBox="0 0 20 20">
                    <path fillRule="evenodd" d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zm-7 4a1 1 0 11-2 0 1 1 0 012 0zm-1-9a1 1 0 00-1 1v4a1 1 0 102 0V6a1 1 0 00-1-1z" clipRule="evenodd" />
                  </svg>
                  {error}
                </div>
              )}

              <button
                type="submit" disabled={loading}
                className="w-full py-3 rounded-xl text-sm font-semibold tracking-wide text-white transition-all disabled:opacity-50 disabled:cursor-not-allowed"
                style={{ background: `linear-gradient(135deg, ${accent}, #a855f7)`, boxShadow: `0 8px 24px ${accent}55` }}
              >
                {loading ? (
                  <span className="flex items-center justify-center gap-2">
                    <svg className="animate-spin w-4 h-4" fill="none" viewBox="0 0 24 24">
                      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                      <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                    </svg>
                    Ingresando...
                  </span>
                ) : 'Ingresar →'}
              </button>
            </form>
          </div>

          <p className="text-center text-xs text-zinc-400 mt-6">
            ¿No tenés cuenta? <Link href="/signup" className="text-zinc-200 hover:text-white font-medium transition-colors">Creá una gratis</Link>
          </p>
          <p className="text-center text-xs text-zinc-600 mt-2">
            <Link href="/" className="hover:text-zinc-400 transition-colors">← Volver al inicio</Link>
          </p>
        </div>
      </div>
    </div>
  )
}
