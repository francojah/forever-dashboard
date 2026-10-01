'use client'

import { useState } from 'react'
import CambiosAdminPanel from '@/components/cambios/AdminPanel'
import { Btn, Card, ErrorBox, inputCls } from '../ui'

export default function AdminGate({ initialUser }: { initialUser: string | null }) {
  const [user, setUser] = useState<string | null>(initialUser)
  const [name, setName] = useState('')
  const [pin, setPin] = useState('')
  const [err, setErr] = useState('')
  const [loading, setLoading] = useState(false)

  async function login() {
    setErr(''); setLoading(true)
    try {
      const res = await fetch('/api/cambios/auth/login', {
        method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ user: name, pin }),
      })
      const j = await res.json()
      if (!j.ok) setErr(j.reason || 'Usuario o PIN incorrectos.')
      else { setUser(j.user); setPin('') }
    } catch { setErr('No pudimos conectarnos. Probá de nuevo.') }
    setLoading(false)
  }

  async function logout() {
    try { await fetch('/api/cambios/auth/logout', { method: 'POST' }) } catch { /* igual salimos */ }
    setUser(null)
  }

  if (user) {
    const display = user.charAt(0).toUpperCase() + user.slice(1)
    return <CambiosAdminPanel variant="standalone" userName={display} onLogout={logout} />
  }

  return (
    <>
      <section className="bg-black text-white">
        <div className="mx-auto max-w-sm px-5 pt-8 pb-20">
          <h1 className="font-display text-[28px] font-bold leading-tight">Panel de cambios</h1>
          <div className="h-[3px] w-12 bg-[#B8892B] mt-4" />
          <p className="mt-4 text-neutral-300 text-[15px]">Ingresá con tu usuario y PIN.</p>
        </div>
      </section>
      <main className="mx-auto max-w-sm px-4 -mt-12 pb-10">
        <Card className="space-y-4 p-5 shadow-[0_12px_32px_-16px_rgba(0,0,0,0.35)]">
          <label className="block">
            <span className="block text-[13px] font-semibold mb-1.5">Usuario</span>
            <input className={inputCls} autoCapitalize="none" autoCorrect="off" autoComplete="username" value={name} onChange={(e) => setName(e.target.value)} />
          </label>
          <label className="block">
            <span className="block text-[13px] font-semibold mb-1.5">PIN</span>
            <input className={`${inputCls} tracking-[0.4em]`} type="password" inputMode="numeric" autoComplete="current-password" value={pin}
              onChange={(e) => setPin(e.target.value.replace(/\D/g, '').slice(0, 8))}
              onKeyDown={(e) => { if (e.key === 'Enter' && name && pin) login() }} />
          </label>
          {err && <ErrorBox>{err}</ErrorBox>}
          <Btn onClick={login} disabled={loading || !name || pin.length < 4}>{loading ? 'Ingresando…' : 'Ingresar'}</Btn>
        </Card>
      </main>
    </>
  )
}
