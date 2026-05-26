'use client'

import { useState } from 'react'
import Image from 'next/image'
import { createClientBrowser } from '@/lib/supabase'
import { useRouter } from 'next/navigation'

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

  return (
    <div className="min-h-screen flex">

      {/* Panel izquierdo — marca */}
      <div className="hidden lg:flex lg:w-1/2 bg-black flex-col items-center justify-center p-12 relative overflow-hidden">
        {/* Fondo sutil */}
        <div className="absolute inset-0 opacity-5"
          style={{ backgroundImage: 'radial-gradient(circle at 30% 50%, white 1px, transparent 1px)', backgroundSize: '32px 32px' }}
        />

        <div className="relative z-10 flex flex-col items-center text-center gap-8 max-w-xs">
          <Image
            src="https://acdn-us.mitiendanube.com/stores/004/250/257/themes/common/logo-1587041462-1768339200-c3f713972515246e9c2f02029356d7da1768339200-480-0.webp"
            alt="Forever Basics"
            width={200}
            height={66}
            className="object-contain invert"
            unoptimized
          />
          <div>
            <p className="text-zinc-300 text-sm leading-relaxed">
              Panel de control de Meta Ads.<br/>
              Datos en tiempo real, análisis y decisiones.
            </p>
          </div>
          <div className="w-8 h-px bg-zinc-600" />
          <p className="text-zinc-600 text-xs tracking-widest uppercase">
            Solo para el equipo
          </p>
        </div>
      </div>

      {/* Panel derecho — form */}
      <div className="flex-1 flex items-center justify-center bg-gray-50 dark:bg-zinc-950 px-6">
        <div className="w-full max-w-sm">

          {/* Logo mobile */}
          <div className="lg:hidden text-center mb-8">
            <Image
              src="https://acdn-us.mitiendanube.com/stores/004/250/257/themes/common/logo-1587041462-1768339200-c3f713972515246e9c2f02029356d7da1768339200-480-0.webp"
              alt="Forever Basics"
              width={140}
              height={46}
              className="object-contain mx-auto dark:invert"
              unoptimized
            />
          </div>

          <div className="mb-8">
            <h1 className="text-2xl font-semibold text-gray-900 dark:text-white">Bienvenido</h1>
            <p className="text-sm text-gray-500 dark:text-zinc-400 mt-1">Ingresá tus credenciales para continuar</p>
          </div>

          <div className="bg-white dark:bg-zinc-900 rounded-2xl border border-gray-200 dark:border-zinc-800 p-8 shadow-sm">
            <form onSubmit={handleLogin} className="space-y-5">
              <div>
                <label className="block text-xs font-semibold text-gray-500 dark:text-zinc-400 uppercase tracking-wide mb-2">
                  Email
                </label>
                <input
                  type="email"
                  value={email}
                  onChange={e => setEmail(e.target.value)}
                  placeholder="hola@foreverbasics.com.ar"
                  required
                  className="w-full px-4 py-3 rounded-xl border border-gray-200 dark:border-zinc-700
                             bg-gray-50 dark:bg-zinc-800 text-sm text-gray-900 dark:text-white
                             focus:outline-none focus:ring-2 focus:ring-zinc-900 dark:focus:ring-white
                             focus:border-transparent placeholder-gray-400 dark:placeholder-zinc-500
                             transition-all"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-gray-500 dark:text-zinc-400 uppercase tracking-wide mb-2">
                  Contraseña
                </label>
                <input
                  type="password"
                  value={password}
                  onChange={e => setPassword(e.target.value)}
                  placeholder="••••••••"
                  required
                  className="w-full px-4 py-3 rounded-xl border border-gray-200 dark:border-zinc-700
                             bg-gray-50 dark:bg-zinc-800 text-sm text-gray-900 dark:text-white
                             focus:outline-none focus:ring-2 focus:ring-zinc-900 dark:focus:ring-white
                             focus:border-transparent placeholder-gray-400 dark:placeholder-zinc-500
                             transition-all"
                />
              </div>

              {error && (
                <div className="flex items-center gap-2 text-sm text-red-600 dark:text-red-400 bg-red-50 dark:bg-red-900/20 px-4 py-3 rounded-xl border border-red-100 dark:border-red-900/40">
                  <svg className="w-4 h-4 shrink-0" fill="currentColor" viewBox="0 0 20 20">
                    <path fillRule="evenodd" d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zm-7 4a1 1 0 11-2 0 1 1 0 012 0zm-1-9a1 1 0 00-1 1v4a1 1 0 102 0V6a1 1 0 00-1-1z" clipRule="evenodd"/>
                  </svg>
                  {error}
                </div>
              )}

              <button
                type="submit"
                disabled={loading}
                className="w-full bg-gray-900 dark:bg-white text-white dark:text-gray-900
                           py-3 rounded-xl text-sm font-semibold tracking-wide
                           hover:bg-gray-700 dark:hover:bg-gray-100 transition-colors
                           disabled:opacity-40 disabled:cursor-not-allowed mt-2"
              >
                {loading ? (
                  <span className="flex items-center justify-center gap-2">
                    <svg className="animate-spin w-4 h-4" fill="none" viewBox="0 0 24 24">
                      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"/>
                      <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"/>
                    </svg>
                    Ingresando...
                  </span>
                ) : 'Ingresar'}
              </button>
            </form>
          </div>

        </div>
      </div>
    </div>
  )
}
