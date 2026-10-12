'use client'

import { useState } from 'react'
import { Panel } from '../ui'

/** Resumen semanal por mail: prendido/apagado, vista previa y envío de prueba. */
export default function WeeklyEmail({ enabled, canEdit, mailReady }: { enabled: boolean; canEdit: boolean; mailReady: boolean }) {
  const [on, setOn] = useState(enabled)
  const [msg, setMsg] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  async function toggle() {
    setBusy(true); setMsg(null)
    const r = await fetch('/api/v2/settings', { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ weekly_email: !on }) })
    setBusy(false)
    if (r.ok) setOn(!on); else setMsg('No se pudo guardar')
  }
  async function test() {
    setBusy(true); setMsg(null)
    const r = await fetch('/api/v2/weekly', { method: 'POST' })
    const j = await r.json().catch(() => ({}))
    setBusy(false)
    setMsg(r.ok ? `Enviado a ${j.to}.` : j.error || 'No se pudo enviar')
  }

  return (
    <Panel title="Resumen semanal por mail" description="Los lunes a la mañana: ventas, ganancia, inversión, los anuncios que mejor y peor anduvieron y las propuestas de tus reglas. Lo reciben dueños y editores.">
      <div className="flex flex-wrap items-center gap-3 text-[13.5px]">
        <label className="flex items-center gap-2">
          <input type="checkbox" checked={on} disabled={!canEdit || busy} onChange={toggle} className="accent-[rgb(var(--f-ink))]" />
          {on ? 'Prendido' : 'Apagado'}
        </label>
        <a href="/api/v2/weekly" target="_blank" rel="noreferrer" className="rounded-md border border-line px-3 py-1.5 hover:bg-sunken">Ver vista previa</a>
        {mailReady && <button onClick={test} disabled={busy} className="rounded-md border border-line px-3 py-1.5 hover:bg-sunken disabled:opacity-50">Enviarme uno de prueba</button>}
        {!mailReady && <span className="text-mute">El envío de mails todavía no está configurado en Faro.</span>}
      </div>
      {msg && <p className="mt-2 text-[13px] text-mute">{msg}</p>}
    </Panel>
  )
}
