'use client'

import { useState } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { createClientBrowser } from '@/lib/supabase'
import AuthFrame, { Field, Submit, Notice, GoogleButton, googleEnabled } from '@/components/faro/AuthFrame'

export default function LoginPage() {
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const router = useRouter()
  const supabase = createClientBrowser()

  async function handleLogin(e: React.FormEvent) {
    e.preventDefault()
    setBusy(true); setError('')
    const { error } = await supabase.auth.signInWithPassword({ email: email.trim(), password })
    if (error) {
      setError(/confirm/i.test(error.message) ? 'Todavía no confirmaste tu email. Revisá tu casilla (y spam).' : 'Email o contraseña incorrectos.')
      setBusy(false)
      return
    }
    router.push('/')
    router.refresh()
  }

  async function google() {
    setBusy(true); setError('')
    const { error } = await supabase.auth.signInWithOAuth({ provider: 'google', options: { redirectTo: `${window.location.origin}/auth/callback` } })
    if (error) { setError('No se pudo ingresar con Google. Probá con tu email.'); setBusy(false) }
  }

  return (
    <AuthFrame title="Ingresá a Faro" subtitle="Tus ventas, anuncios y ganancia, al día." footer={<>¿No tenés cuenta? <Link href="/signup" className="font-medium text-ink underline underline-offset-2">Creá una gratis</Link></>}>
      {googleEnabled && <GoogleButton onClick={google} busy={busy} label="Continuar con Google" />}
      <form onSubmit={handleLogin} className="flex flex-col gap-4">
        <Field label="Email" type="email" autoComplete="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="vos@tutienda.com" required />
        <Field label="Contraseña" type="password" autoComplete="current-password" value={password} onChange={(e) => setPassword(e.target.value)} required
          aside={<Link href={`/recuperar${email ? `?email=${encodeURIComponent(email)}` : ''}`} className="text-[13px] font-normal text-mute hover:text-ink underline underline-offset-2">¿La olvidaste?</Link>} />
        {error && <Notice tone="bad">{error}</Notice>}
        <Submit busy={busy} busyText="Ingresando…">Ingresar</Submit>
      </form>
    </AuthFrame>
  )
}
