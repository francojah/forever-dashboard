'use client'

import Link from 'next/link'
import { useState } from 'react'
import { useRouter } from 'next/navigation'
import type { SuggestedAction } from '@/lib/faro/actions'
import { money } from '@/lib/faro/format'

const VERB: Record<SuggestedAction['kind'], string> = {
  pause: 'Pausar', budget_down: 'Bajar presupuesto', budget_up: 'Subir presupuesto', rotate: 'Ver creativos', restock: 'Ver stock', review: 'Revisar',
}

/** "Qué hacer hoy": hasta 3 acciones con su motivo. Las que tocan Meta piden confirmación. */
export default function ActionList({ actions, canEdit }: { actions: SuggestedAction[]; canEdit: boolean }) {
  const router = useRouter()
  const [confirming, setConfirming] = useState<string | null>(null)
  const [busy, setBusy] = useState<string | null>(null)
  const [done, setDone] = useState<Record<string, string>>({})
  const list = actions.slice(0, 3)

  async function apply(a: SuggestedAction) {
    if (!a.target) return
    setBusy(a.id)
    const r = await fetch('/api/v2/meta/mutate', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ changes: [{ accountId: a.target.accountId, level: a.target.level, id: a.target.id, field: a.target.field, value: a.target.value, confirmProtected: true }] }),
    })
    const j = await r.json().catch(() => ({}))
    setBusy(null)
    setConfirming(null)
    setDone((d) => ({ ...d, [a.id]: j.ok ? 'Aplicado. Podés deshacerlo desde Anuncios → Historial.' : (j.results?.[0]?.error || j.error || 'No se pudo aplicar') }))
    if (j.ok) router.refresh()
  }

  return (
    <section className="rounded-panel border border-line bg-surface overflow-hidden">
      <div className="flex items-stretch">
        <div className="w-1.5 bg-beacon shrink-0" aria-hidden />
        <div className="flex-1 px-5 py-4">
          <h2 className="text-[15.5px] font-semibold text-ink">Qué hacer hoy</h2>
          {list.length === 0 ? (
            <p className="mt-1 text-[14px] text-mute">Nada urgente. Ningún ad set superó el costo por compra máximo 3 días seguidos y no hay productos por quedarse sin stock.</p>
          ) : (
            <ul className="mt-2 divide-y divide-line">
              {list.map((a) => (
                <li key={a.id} className="py-3 flex flex-col sm:flex-row sm:items-center gap-3">
                  <div className="flex-1 min-w-0">
                    <p className="text-[14.5px] font-medium text-ink">{a.title}{a.protected && <span className="ml-2 text-[12px] font-normal text-warn">protegido</span>}</p>
                    <p className="text-[13px] text-mute mt-0.5">{a.reason}</p>
                    {done[a.id] && <p className="text-[13px] mt-1 text-ink">{done[a.id]}</p>}
                  </div>
                  <div className="shrink-0 flex items-center gap-2">
                    {a.target && canEdit && !done[a.id] ? (
                      confirming === a.id ? (
                        <>
                          <span className="text-[12.5px] text-mute">
                            {a.target.field === 'daily_budget' ? `${money(a.target.current as number)} → ${money(a.target.value as number)}` : 'Se pausa en Meta'}
                          </span>
                          <button onClick={() => apply(a)} disabled={busy === a.id} className="rounded-lg bg-ink text-surface px-3 py-1.5 text-[13px] font-medium disabled:opacity-60">
                            {busy === a.id ? 'Aplicando' : 'Confirmar'}
                          </button>
                          <button onClick={() => setConfirming(null)} className="text-[13px] text-mute hover:text-ink px-1">Cancelar</button>
                        </>
                      ) : (
                        <button onClick={() => setConfirming(a.id)} className="rounded-lg border border-line px-3 py-1.5 text-[13px] font-medium text-ink hover:bg-sunken">{VERB[a.kind]}</button>
                      )
                    ) : a.href ? (
                      <Link href={a.href} className="rounded-lg border border-line px-3 py-1.5 text-[13px] font-medium text-ink hover:bg-sunken">{VERB[a.kind]}</Link>
                    ) : null}
                  </div>
                </li>
              ))}
            </ul>
          )}
          {actions.length > 3 && <p className="mt-2 text-[12.5px] text-mute">Hay {actions.length - 3} sugerencias más en Anuncios.</p>}
        </div>
      </div>
    </section>
  )
}
