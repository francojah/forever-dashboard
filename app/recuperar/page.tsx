'use client'

import { Suspense, useEffect, useState } from 'react'
import Link from 'next/link'
import { useRouter, useSearchParams } from 'next/navigation'
import { createClientBrowser } from '@/lib/supabase'
import AuthFrame, { Field, Submit, Notice } from '@/components/faro/AuthFrame'

/** Recuperar contraseña: pide el email, y al volver desde el link del mail permite elegir una nueva. */
function Recover() {
  const sp = useSearchParams()
  const router = useRouter()
  const supabase = createClientBrowser()
  const [mode, setMode] = useState<'pedir' | 'nueva'>(sp.get('modo') === 'nueva' ? 'nueva' : 'pedir')
  const [email, setEmail] = useState(sp.get('email') || '')
  const [password, setPassword] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [done, setDone] = useState('')

  useEffect(() => {
    const { data } = supabase.auth.onAuthStateChange((ev) => { if (ev === 'PASSWORD_RECOVERY') setMode('nueva') })
    return () => data.subscription.unsubscribe()
  }, [supabase])

  async function request(e: React.FormEvent) {
    e.preventDefault()
    setBusy(true); setError('')
    const { error } = await supabase.auth.resetPasswordForEmail(email.trim(), { redirectTo: `${window.location.origin}/auth/callback?next=${encodeURIComponent('/recuperar?modo=nueva')}` })
    setBusy(false)
    if (error) setError(/rate|seconds/i.test(error.message) ? 'Esperá un minuto antes de pedir otro link.' : 'No se pudo enviar el email. Revisá la dirección.')
    else setDone(`Si ${email.trim()} tiene cuenta, te llega un link para elegir una contraseña nueva.`)
  }

  async function update(e: React.FormEvent) {
    e.preventDefault()
    if (password.length < 8) { setError('Usá al menos 8 caracteres.'); return }
    setBusy(true); setError('')
    const { error } = await supabase.auth.updateUser({ password })
    setBusy(false)
    if (error) { setError(/session|expired|missing/i.test(error.message) ? 'El link venció. Pedí uno nuevo.' : error.message); if (/session|expired|missing/i.test(error.message)) setMode('pedir'); return }
    router.push('/')
    router.refresh()
  }

  if (mode === 'nueva') {
    return (
      <AuthFrame title="Elegí una contraseña nueva" footer={<Link href="/login" className="underline underline-offset-2">Volver a ingresar</Link>}>
        <form onSubmit={update} className="flex flex-col gap-4">
          <Field label="Contraseña nueva" type="password" autoComplete="new-password" value={password} onChange={(e) => setPassword(e.target.value)} placeholder="Mínimo 8 caracteres" required minLength={8} />
          {error && <Notice tone="bad">{error}</Notice>}
          <Submit busy={busy} busyText="Guardando…">Guardar e ingresar</Submit>
        </form>
      </AuthFrame>
    )
  }

  return (
    <AuthFrame title="Recuperá tu contraseña" subtitle="Te mandamos un link para elegir una nueva." footer={<Link href="/login" className="underline underline-offset-2">Volver a ingresar</Link>}>
      {done ? <Notice tone="good">{done}</Notice> : (
        <form onSubmit={request} className="flex flex-col gap-4">
          <Field label="Email" type="email" autoComplete="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="vos@tutienda.com" required />
          {error && <Notice tone="bad">{error}</Notice>}
          <Submit busy={busy} busyText="Enviando…">Enviar link</Submit>
        </form>
      )}
    </AuthFrame>
  )
}

export default function RecuperarPage() {
  return <Suspense><Recover /></Suspense>
}
