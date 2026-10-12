'use client'

import { useState } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { createClientBrowser } from '@/lib/supabase'
import AuthFrame, { Field, Submit, Notice, GoogleButton, googleEnabled } from '@/components/faro/AuthFrame'

export default function SignupPage() {
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [sent, setSent] = useState(false)
  const router = useRouter()
  const supabase = createClientBrowser()

  async function handleSignup(e: React.FormEvent) {
    e.preventDefault()
    setBusy(true); setError('')
    if (password.length < 8) { setError('Usá al menos 8 caracteres.'); setBusy(false); return }
    const { data, error: signErr } = await supabase.auth.signUp({ email: email.trim(), password, options: { emailRedirectTo: `${window.location.origin}/auth/callback` } })
    if (signErr) {
      setError(/already|registered/i.test(signErr.message) ? 'Ese email ya tiene cuenta. Ingresá o recuperá tu contraseña.' : signErr.message)
      setBusy(false)
      return
    }
    if (data.session) { router.push('/'); router.refresh(); return }
    setSent(true); setBusy(false)
  }

  async function google() {
    setBusy(true); setError('')
    const { error } = await supabase.auth.signInWithOAuth({ provider: 'google', options: { redirectTo: `${window.location.origin}/auth/callback` } })
    if (error) { setError('No se pudo continuar con Google. Probá con tu email.'); setBusy(false) }
  }

  if (sent) {
    return (
      <AuthFrame title="Revisá tu email" subtitle={<>Te mandamos un link a <strong className="text-ink">{email}</strong> para confirmar tu cuenta.</>} footer={<Link href="/login" className="font-medium text-ink underline underline-offset-2">Ya lo confirmé, ingresar</Link>}>
        <p className="text-[14px] text-mute">Si no llega en un par de minutos, mirá en spam o promociones.</p>
      </AuthFrame>
    )
  }

  return (
    <AuthFrame title="Creá tu cuenta" subtitle="Gratis durante el acceso anticipado. Sin tarjeta." footer={<>¿Ya tenés cuenta? <Link href="/login" className="font-medium text-ink underline underline-offset-2">Ingresá</Link></>}>
      {googleEnabled && <GoogleButton onClick={google} busy={busy} label="Registrarme con Google" />}
      <form onSubmit={handleSignup} className="flex flex-col gap-4">
        <Field label="Email" type="email" autoComplete="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="vos@tutienda.com" required />
        <Field label="Contraseña" type="password" autoComplete="new-password" value={password} onChange={(e) => setPassword(e.target.value)} placeholder="Mínimo 8 caracteres" required minLength={8} />
        {error && <Notice tone="bad">{error}</Notice>}
        <Submit busy={busy} busyText="Creando cuenta…">Crear cuenta gratis</Submit>
        <p className="text-[12.5px] text-faint text-center">Al crear tu cuenta aceptás los <Link href="/terminos" className="underline">términos</Link> y la <Link href="/privacidad" className="underline">política de privacidad</Link>.</p>
      </form>
      <div className="mt-6 rounded-lg border border-line bg-surface px-4 py-3 text-[13.5px] text-mute">
        <p className="font-medium text-ink">Después de registrarte</p>
        <ol className="mt-1 list-decimal pl-5 flex flex-col gap-0.5"><li>Conectás Tiendanube</li><li>Conectás Meta Ads</li><li>Cargás tus costos y listo</li></ol>
      </div>
    </AuthFrame>
  )
}
