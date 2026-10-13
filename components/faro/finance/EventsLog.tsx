'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { Panel } from '../ui'
import { money, int } from '@/lib/faro/format'
import type { WindowStats } from '@/lib/faro/insights'

export interface EventRow { id: string; kind: string; name: string; starts: string; ends: string; entity_id: string | null; entity_name?: string | null; notes: string | null; stats: { before: WindowStats; during: WindowStats; after: WindowStats | null } }
const KIND: Record<string, string> = { promo: 'Promo', experimento: 'Experimento', otro: 'Otro' }
const dd = (d: string) => `${d.slice(8, 10)}/${d.slice(5, 7)}`

function Cmp({ a, b, better = 'up', fmt }: { a: number | null; b: number | null; better?: 'up' | 'down'; fmt: (v: number) => string }) {
  if (a == null || b == null || b === 0) return <span className="num text-ink">{a == null ? '—' : fmt(a)}</span>
  const ch = (a - b) / Math.abs(b)
  const good = Math.abs(ch) < 0.03 ? null : better === 'up' ? ch > 0 : ch < 0
  return <span className="num text-ink">{fmt(a)} <span className={`text-[12px] ${good == null ? 'text-faint' : good ? 'text-good' : 'text-bad'}`}>{ch >= 0 ? '+' : '−'}{Math.abs(Math.round(ch * 100))}%</span></span>
}

/** Calendario de promos y experimentos: cada uno con su antes / durante / después, calculado solo. */
export default function EventsLog({ events, canEdit, missing, entities }: { events: EventRow[]; canEdit: boolean; missing: boolean; entities: { id: string; name: string }[] }) {
  const router = useRouter()
  const [open, setOpen] = useState(false)
  const [f, setF] = useState({ kind: 'promo', name: '', starts: '', ends: '', entity_id: '', notes: '' })
  const [msg, setMsg] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  async function add() {
    setBusy(true); setMsg(null)
    const r = await fetch('/api/v2/events', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(f) })
    const j = await r.json().catch(() => ({}))
    setBusy(false)
    if (!r.ok) return setMsg(j.error || 'No se pudo guardar')
    setOpen(false); setF({ kind: 'promo', name: '', starts: '', ends: '', entity_id: '', notes: '' }); router.refresh()
  }
  async function del(id: string) {
    await fetch(`/api/v2/events?id=${id}`, { method: 'DELETE' }); router.refresh()
  }
  const inp = 'rounded-lg border border-line bg-surface px-3 py-2 text-[13.5px]'
  return (
    <Panel title="Promos y experimentos" description="Anotá cada promo (3x2, envío gratis, Hot Sale) o cambio que probaste. Faro compara ventas, margen y costo por compra antes, durante y después, con ventanas del mismo largo."
      actions={canEdit ? <button onClick={() => setOpen(!open)} className="rounded-md border border-line px-3 py-1.5 text-[13px] hover:bg-sunken">{open ? 'Cancelar' : 'Anotar'}</button> : undefined} padded={false}>
      {missing && <p className="px-5 pt-3 text-[13px] text-warn">Falta correr la migración 20261015_decisiones.sql.</p>}
      {open && (
        <div className="px-5 py-4 border-b border-line grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <select value={f.kind} onChange={(e) => setF({ ...f, kind: e.target.value })} className={inp}>{Object.entries(KIND).map(([k, l]) => <option key={k} value={k}>{l}</option>)}</select>
          <input value={f.name} onChange={(e) => setF({ ...f, name: e.target.value })} placeholder="Nombre (ej. 3x2 remeras)" className={inp} />
          <input type="date" value={f.starts} onChange={(e) => setF({ ...f, starts: e.target.value })} className={inp} aria-label="Desde" />
          <input type="date" value={f.ends} onChange={(e) => setF({ ...f, ends: e.target.value })} className={inp} aria-label="Hasta" />
          {f.kind === 'experimento' && entities.length > 0 && (
            <select value={f.entity_id} onChange={(e) => setF({ ...f, entity_id: e.target.value })} className={`${inp} sm:col-span-2`}><option value="">Toda la cuenta</option>{entities.map((e) => <option key={e.id} value={e.id}>{e.name}</option>)}</select>
          )}
          <input value={f.notes} onChange={(e) => setF({ ...f, notes: e.target.value })} placeholder="Qué cambiaste (opcional)" className={`${inp} sm:col-span-2`} />
          <div className="flex items-center gap-3"><button disabled={busy} onClick={add} className="rounded-md bg-ink text-bg px-3 py-2 text-[13.5px] disabled:opacity-50">Guardar</button>{msg && <span className="text-[13px] text-bad">{msg}</span>}</div>
        </div>
      )}
      {events.length === 0 ? <p className="px-5 py-6 text-[13.5px] text-mute">Todavía no anotaste ninguna promo ni experimento.</p> : (
        <div className="overflow-x-auto">
          <table className="w-full text-[13.5px] min-w-[820px]">
            <thead><tr className="text-mute text-left border-b border-line bg-sunken/60">
              <th className="font-medium px-5 py-2">Qué</th><th className="font-medium px-2 py-2">Cuándo</th><th className="font-medium px-2 py-2 text-right">Ventas/día</th><th className="font-medium px-2 py-2 text-right">Órdenes/día</th><th className="font-medium px-2 py-2 text-right">Costo/compra</th><th className="font-medium px-2 py-2 text-right">Ganancia/día</th><th className="px-5 py-2" />
            </tr></thead>
            <tbody className="divide-y divide-line">
              {events.map((e) => {
                const per = (w: WindowStats | null, k: 'net' | 'orders' | 'profit') => (w && w.days ? w[k] / w.days : null)
                const rows: [string, WindowStats | null][] = [['Antes', e.stats.before], ['Durante', e.stats.during], ['Después', e.stats.after]]
                return rows.map(([label, w], i) => (
                  <tr key={`${e.id}-${label}`} className={i === 0 ? 'border-t-2 border-line' : ''}>
                    {i === 0 && <td rowSpan={3} className="px-5 py-2 align-top"><span className="text-ink font-medium">{e.name}</span><span className="block text-[12px] text-mute">{KIND[e.kind] || e.kind}{e.entity_name ? ` · ${e.entity_name}` : ''}{e.notes ? ` · ${e.notes}` : ''}</span></td>}
                    <td className="px-2 py-1.5 text-mute">{label}{label === 'Durante' ? ` ${dd(e.starts)}–${dd(e.ends)}` : ''}{w ? ` · ${w.days} d` : ''}</td>
                    <td className="px-2 py-1.5 text-right">{w ? <Cmp a={per(w, 'net')} b={per(e.stats.before, 'net')} fmt={(v) => money(v)} /> : <span className="text-faint">todavía no</span>}</td>
                    <td className="px-2 py-1.5 text-right">{w ? <Cmp a={per(w, 'orders')} b={per(e.stats.before, 'orders')} fmt={(v) => int(Math.round(v * 10) / 10)} /> : ''}</td>
                    <td className="px-2 py-1.5 text-right">{w ? <Cmp a={w.cpa} b={e.stats.before.cpa} better="down" fmt={(v) => money(v)} /> : ''}</td>
                    <td className="px-2 py-1.5 text-right">{w ? <Cmp a={per(w, 'profit')} b={per(e.stats.before, 'profit')} fmt={(v) => money(v)} /> : ''}</td>
                    {i === 0 && <td rowSpan={3} className="px-5 py-2 text-right align-top">{canEdit && <button onClick={() => del(e.id)} className="text-[12.5px] text-mute hover:text-bad underline">Borrar</button>}</td>}
                  </tr>
                ))
              })}
            </tbody>
          </table>
        </div>
      )}
    </Panel>
  )
}
