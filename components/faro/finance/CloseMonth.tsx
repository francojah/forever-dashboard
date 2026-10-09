'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'

/** Congela el P&L del mes para que cambios posteriores de costos no lo reescriban. */
export default function CloseMonth({ month, closed }: { month: string; closed: boolean }) {
  const router = useRouter()
  const [busy, setBusy] = useState(false)
  async function run() {
    if (closed && !window.confirm('¿Reabrir el mes? Se va a recalcular con los costos actuales.')) return
    setBusy(true)
    await fetch('/api/v2/close-month', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ month, reopen: closed }) })
    setBusy(false)
    router.refresh()
  }
  return (
    <button onClick={run} disabled={busy} className="rounded-lg border border-line px-3 py-1.5 text-[13px] font-medium text-ink hover:bg-sunken disabled:opacity-60">
      {busy ? 'Guardando' : closed ? 'Reabrir mes' : 'Cerrar mes'}
    </button>
  )
}
