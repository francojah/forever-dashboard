'use client'

import { useEffect, useState } from 'react'
import { Panel } from '../ui'

/** Avisos por WhatsApp: número propio, resumen diario y urgentes, con envío de prueba. */
export default function WhatsAppNotify() {
  const [phone, setPhone] = useState('')
  const [daily, setDaily] = useState(true)
  const [alerts, setAlerts] = useState(true)
  const [configured, setConfigured] = useState(true)
  const [missing, setMissing] = useState(false)
  const [msg, setMsg] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  useEffect(() => {
    fetch('/api/v2/notify').then((r) => r.json()).then((j) => {
      setConfigured(!!j.configured); setMissing(!!j.missing)
      if (j.contact) { setPhone(j.contact.phone); setDaily(j.contact.daily); setAlerts(j.contact.alerts) }
    }).catch(() => null)
  }, [])

  async function save() {
    setBusy(true); setMsg(null)
    const r = await fetch('/api/v2/notify', { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ phone, daily, alerts }) })
    const j = await r.json().catch(() => ({}))
    setBusy(false)
    if (!r.ok) return setMsg(j.error || 'No se pudo guardar')
    if (j.phone) setPhone(j.phone)
    setMsg(j.phone ? 'Guardado.' : 'Número borrado: no vas a recibir avisos.')
  }
  async function test() {
    setBusy(true); setMsg(null)
    const r = await fetch('/api/v2/notify', { method: 'POST' })
    const j = await r.json().catch(() => ({}))
    setBusy(false)
    setMsg(r.ok ? 'Enviado. Mirá tu WhatsApp.' : j.error || 'No se pudo enviar')
  }

  return (
    <Panel title="Avisos por WhatsApp" description="Un resumen de ayer cada mañana (ventas, ganancia, inversión y propuestas de tus reglas) y avisos urgentes de tu cuenta de Meta apenas aparecen. Cada persona del equipo carga su propio número.">
      {missing && <p className="mb-3 rounded-lg border border-warn/40 bg-warn/5 px-3 py-2 text-[13px] text-ink">Falta correr la migración 20261014_whatsapp.sql en Supabase.</p>}
      {!configured && <p className="mb-3 text-[13px] text-mute">El envío por WhatsApp todavía no está configurado en Faro. Podés dejar tu número cargado para cuando esté.</p>}
      <div className="flex flex-col gap-3 text-[13.5px] max-w-md">
        <label className="flex flex-col gap-1">Tu celular
          <input inputMode="tel" value={phone} onChange={(e) => setPhone(e.target.value)} placeholder="11 2345 6789" className="rounded-lg border border-line bg-surface px-3 py-2 num" />
        </label>
        <label className="flex items-center gap-2"><input type="checkbox" checked={daily} onChange={(e) => setDaily(e.target.checked)} className="accent-[rgb(var(--f-ink))]" /> Resumen de ayer, cada mañana</label>
        <label className="flex items-center gap-2"><input type="checkbox" checked={alerts} onChange={(e) => setAlerts(e.target.checked)} className="accent-[rgb(var(--f-ink))]" /> Urgentes: pagos rechazados, cuenta inhabilitada, límite de gasto</label>
        <div className="flex flex-wrap gap-2">
          <button onClick={save} disabled={busy} className="rounded-md bg-ink text-bg px-3 py-1.5 disabled:opacity-50">Guardar</button>
          {configured && <button onClick={test} disabled={busy || !phone} className="rounded-md border border-line px-3 py-1.5 hover:bg-sunken disabled:opacity-50">Enviarme una prueba</button>}
        </div>
        {msg && <p className="text-[13px] text-mute">{msg}</p>}
      </div>
    </Panel>
  )
}
