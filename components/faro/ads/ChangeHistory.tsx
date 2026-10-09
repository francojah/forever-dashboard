'use client'

import { useEffect, useState } from 'react'
import { money } from '@/lib/faro/format'
import { Panel, Badge, Empty } from '../ui'

interface Row {
  id: string; created_at: string; user_email: string | null; level: string | null; entity_name: string | null
  field: string; old_value: unknown; new_value: unknown; status: string; error: string | null; undone_at: string | null
}

const FIELD: Record<string, string> = {
  status: 'Estado', daily_budget: 'Presupuesto diario', name: 'Nombre', age_min: 'Edad mínima', age_max: 'Edad máxima',
  genders: 'Género', copy: 'Texto del anuncio', creative_id: 'Creativo', create_ad: 'Anuncio nuevo', end_time: 'Fin',
}

function show(field: string, v: unknown): string {
  if (v == null) return '—'
  if (field === 'status') return v === 'ACTIVE' ? 'Activo' : v === 'PAUSED' ? 'Pausado' : String(v)
  if (field === 'daily_budget') return money(Number(v))
  if (field === 'genders') { const g = v as number[]; return g?.length === 1 ? (g[0] === 1 ? 'Hombres' : 'Mujeres') : 'Todos' }
  if (field === 'create_ad') return `en ${(v as { adset_name?: string }).adset_name || 'ad set'}`
  if (typeof v === 'object') { const o = v as Record<string, string>; return o.headline || o.message?.slice(0, 50) || (o.creative_id ? `creativo ${o.creative_id}` : '—') }
  return String(v)
}

export default function ChangeHistory({ canEdit, timezone }: { canEdit: boolean; timezone: string }) {
  const [rows, setRows] = useState<Row[] | null>(null)
  const [busy, setBusy] = useState<string | null>(null)
  const [msg, setMsg] = useState<string | null>(null)

  const load = () => fetch('/api/v2/meta/mutate').then((r) => r.json()).then((j) => setRows(j.rows || [])).catch(() => setRows([]))
  useEffect(() => { load() }, [])

  async function undo(id: string) {
    setBusy(id)
    const j = await fetch('/api/v2/meta/undo', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ change_id: id }) }).then((r) => r.json()).catch(() => ({}))
    setBusy(null)
    setMsg(j.ok ? 'Cambio revertido.' : j.error || j.result?.error || 'No se pudo revertir')
    load()
  }

  return (
    <Panel padded={false}>
      {msg && <p className="px-5 pt-4 text-[13.5px] text-ink">{msg}</p>}
      {rows == null ? <p className="px-5 py-8 text-mute">Cargando…</p> : rows.length === 0 ? <div className="px-5"><Empty title="Todavía no se hizo ningún cambio desde Faro" /></div> : (
        <div className="overflow-x-auto">
          <table className="w-full text-[13.5px] min-w-[760px]">
            <thead><tr className="text-mute text-left border-b border-line">
              <th className="font-medium px-5 py-2.5">Cuándo</th><th className="font-medium px-2 py-2.5">Quién</th><th className="font-medium px-2 py-2.5">Qué</th>
              <th className="font-medium px-2 py-2.5">Cambio</th><th className="font-medium px-5 py-2.5 text-right" />
            </tr></thead>
            <tbody className="divide-y divide-line">
              {rows.map((r) => (
                <tr key={r.id}>
                  <td className="px-5 py-2.5 whitespace-nowrap text-mute num">{new Date(r.created_at).toLocaleString('es-AR', { timeZone: timezone, day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' })}</td>
                  <td className="px-2 py-2.5 text-mute truncate max-w-[160px]">{r.user_email?.split('@')[0] || '—'}</td>
                  <td className="px-2 py-2.5 max-w-[260px]"><span className="truncate block text-ink" title={r.entity_name || ''}>{r.entity_name}</span><span className="text-[12px] text-mute">{FIELD[r.field] || r.field}</span></td>
                  <td className="px-2 py-2.5">
                    <span className="num text-mute">{r.field === 'create_ad' ? '' : `${show(r.field, r.old_value)} → `}</span>
                    <span className="num text-ink">{show(r.field, r.new_value)}</span>
                    {r.status === 'error' && <div className="text-bad text-[12px]">{r.error}</div>}
                  </td>
                  <td className="px-5 py-2.5 text-right whitespace-nowrap">
                    {r.status === 'error' ? <Badge tone="bad">falló</Badge> : r.undone_at ? <Badge>revertido</Badge> : canEdit && r.field !== 'create_ad' && r.field !== 'end_time' ? (
                      <button onClick={() => undo(r.id)} disabled={busy === r.id} className="rounded-md border border-line px-2.5 py-1 text-[12.5px] hover:bg-sunken disabled:opacity-60">{busy === r.id ? 'Revirtiendo' : 'Deshacer'}</button>
                    ) : null}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </Panel>
  )
}
