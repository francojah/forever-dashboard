'use client'

import { useEffect, useMemo, useState } from 'react'
import { money } from '@/lib/faro/format'
import type { Activity } from '@/lib/faro/activity'
import { Panel, Badge, Empty } from '../ui'

interface FaroRow {
  id: string; created_at: string; user_email: string | null; level: string | null; entity_id: string | null; entity_name: string | null
  field: string; old_value: unknown; new_value: unknown; status: string; error: string | null; undone_at: string | null
}

type Item =
  | { kind: 'faro'; at: string; row: FaroRow }
  | { kind: 'meta'; at: string; a: Activity }

const FIELD: Record<string, string> = {
  status: 'Estado', daily_budget: 'Presupuesto diario', name: 'Nombre', age_min: 'Edad mínima', age_max: 'Edad máxima',
  genders: 'Género', copy: 'Texto del anuncio', creative_id: 'Creativo', create_ad: 'Anuncio nuevo', end_time: 'Fin',
  create_campaign: 'Campaña nueva', create_adset: 'Ad set nuevo', copy_ad: 'Anuncio duplicado', copy_adset: 'Ad set duplicado',
}
const LEVEL: Record<string, string> = { campaign: 'Campaña', adset: 'Ad set', ad: 'Anuncio', account: 'Cuenta', other: '' }

function show(field: string, v: unknown): string {
  if (v == null) return '—'
  if (field === 'status') return v === 'ACTIVE' ? 'Activo' : v === 'PAUSED' ? 'Pausado' : String(v)
  if (field === 'daily_budget') return money(Number(v))
  if (field === 'genders') { const g = v as number[]; return g?.length === 1 ? (g[0] === 1 ? 'Hombres' : 'Mujeres') : 'Todos' }
  if (field === 'create_ad') return `en ${(v as { adset_name?: string }).adset_name || 'ad set'}`
  if (typeof v === 'object') { const o = v as Record<string, string>; return o.headline || o.message?.slice(0, 50) || (o.creative_id ? `creativo ${o.creative_id}` : '—') }
  return String(v)
}
const isCreate = (f: string) => f.startsWith('create_') || f.startsWith('copy_')

export default function ChangeHistory({ canEdit, timezone }: { canEdit: boolean; timezone: string }) {
  const [faro, setFaro] = useState<FaroRow[] | null>(null)
  const [meta, setMeta] = useState<Activity[] | null>(null)
  const [metaErr, setMetaErr] = useState<string[]>([])
  const [days, setDays] = useState(14)
  const [source, setSource] = useState<'todo' | 'faro' | 'meta'>('todo')
  const [billing, setBilling] = useState(false)
  const [query, setQuery] = useState('')
  const [busy, setBusy] = useState<string | null>(null)
  const [msg, setMsg] = useState<string | null>(null)

  const loadFaro = () => fetch('/api/v2/meta/mutate').then((r) => r.json()).then((j) => setFaro(j.rows || [])).catch(() => setFaro([]))
  useEffect(() => { loadFaro() }, [])
  useEffect(() => {
    setMeta(null)
    fetch(`/api/v2/meta/activity?days=${days}`).then((r) => r.json()).then((j) => { setMeta(j.rows || []); setMetaErr(j.errors || []) }).catch(() => { setMeta([]); setMetaErr(['No se pudo leer el registro de Meta']) })
  }, [days])

  async function undo(id: string) {
    setBusy(id)
    const j = await fetch('/api/v2/meta/undo', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ change_id: id }) }).then((r) => r.json()).catch(() => ({}))
    setBusy(null)
    setMsg(j.ok ? 'Cambio revertido.' : j.error || j.result?.error || 'No se pudo revertir')
    loadFaro()
  }

  const items = useMemo(() => {
    const limit = Date.now() - days * 86400000
    const f = (faro || []).filter((r) => new Date(r.created_at).getTime() >= limit)
    // Lo que hizo Faro también aparece en el registro de Meta: se muestra una sola vez (la de Faro, que se puede deshacer)
    const faroKeys = f.map((r) => ({ id: r.entity_id, t: new Date(r.created_at).getTime() }))
    const m = (meta || []).filter((a) => (billing || !a.billing) &&
      !faroKeys.some((k) => k.id && k.id === a.objectId && Math.abs(k.t - new Date(a.at).getTime()) < 3 * 60000))
    const all: Item[] = [
      ...(source !== 'meta' ? f.map((row) => ({ kind: 'faro' as const, at: row.created_at, row })) : []),
      ...(source !== 'faro' ? m.map((a) => ({ kind: 'meta' as const, at: a.at, a })) : []),
    ]
    const q = query.trim().toLowerCase()
    return all
      .filter((it) => !q || (it.kind === 'faro' ? `${it.row.entity_name} ${it.row.user_email}` : `${it.a.objectName} ${it.a.actor} ${it.a.what}`).toLowerCase().includes(q))
      .sort((a, b) => new Date(b.at).getTime() - new Date(a.at).getTime())
  }, [faro, meta, days, source, billing, query])

  const when = (iso: string) => new Date(iso).toLocaleString('es-AR', { timeZone: timezone, day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' })
  const loading = faro == null || (source !== 'faro' && meta == null)

  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-wrap items-center gap-2 text-[13.5px]">
        <div className="inline-flex rounded-lg border border-line bg-surface p-0.5">
          {([['todo', 'Todo'], ['faro', 'Desde Faro'], ['meta', 'Ads Manager y otras apps']] as const).map(([k, l]) => (
            <button key={k} onClick={() => setSource(k)} className={`rounded-md px-3 py-1.5 ${source === k ? 'bg-ink text-bg font-medium' : 'text-mute hover:text-ink'}`}>{l}</button>
          ))}
        </div>
        <select value={days} onChange={(e) => setDays(Number(e.target.value))} className="rounded-lg border border-line bg-surface px-2.5 py-1.5" aria-label="Período">
          {[7, 14, 30, 90].map((d) => <option key={d} value={d}>Últimos {d} días</option>)}
        </select>
        <input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Buscar campaña, anuncio o persona" className="rounded-lg border border-line bg-surface px-3 py-1.5 w-64" />
        <label className="flex items-center gap-2 text-mute"><input type="checkbox" checked={billing} onChange={(e) => setBilling(e.target.checked)} /> Incluir pagos y facturación</label>
      </div>
      {msg && <p className="text-[13.5px] text-ink">{msg}</p>}
      {metaErr.length > 0 && <p className="text-[12.5px] text-warn">No se pudo leer el registro de Meta de: {metaErr.join(' · ')}</p>}
      <Panel padded={false}>
        {loading ? <p className="px-5 py-8 text-mute">Cargando…</p> : items.length === 0 ? <div className="px-5"><Empty title="Sin cambios en este período" /></div> : (
          <div className="overflow-x-auto">
            <table className="w-full text-[13.5px] min-w-[820px]">
              <thead><tr className="text-mute text-left border-b border-line">
                <th className="font-medium px-5 py-2.5">Cuándo</th><th className="font-medium px-2 py-2.5">Quién</th><th className="font-medium px-2 py-2.5">Qué</th>
                <th className="font-medium px-2 py-2.5">Cambio</th><th className="font-medium px-5 py-2.5 text-right" />
              </tr></thead>
              <tbody className="divide-y divide-line">
                {items.map((it) => it.kind === 'faro' ? (
                  <tr key={`f${it.row.id}`}>
                    <td className="px-5 py-2.5 whitespace-nowrap text-mute num">{when(it.row.created_at)}</td>
                    <td className="px-2 py-2.5"><span className="block text-ink truncate max-w-[160px]">{it.row.user_email?.split('@')[0] || '—'}</span><Badge tone="beacon">Faro</Badge></td>
                    <td className="px-2 py-2.5 max-w-[280px]"><span className="truncate block text-ink" title={it.row.entity_name || ''}>{it.row.entity_name}</span><span className="text-[12px] text-mute">{LEVEL[it.row.level || ''] ? `${LEVEL[it.row.level || '']} · ` : ''}{FIELD[it.row.field] || it.row.field}</span></td>
                    <td className="px-2 py-2.5">
                      <span className="num text-mute">{isCreate(it.row.field) ? '' : `${show(it.row.field, it.row.old_value)} → `}</span>
                      <span className="num text-ink">{isCreate(it.row.field) ? '' : show(it.row.field, it.row.new_value)}</span>
                      {it.row.status === 'error' && <div className="text-bad text-[12px]">{it.row.error}</div>}
                    </td>
                    <td className="px-5 py-2.5 text-right whitespace-nowrap">
                      {it.row.status === 'error' ? <Badge tone="bad">falló</Badge> : it.row.undone_at ? <Badge>revertido</Badge> : canEdit && !isCreate(it.row.field) && it.row.field !== 'end_time' ? (
                        <button onClick={() => undo(it.row.id)} disabled={busy === it.row.id} className="rounded-md border border-line px-2.5 py-1 text-[12.5px] hover:bg-sunken disabled:opacity-60">{busy === it.row.id ? 'Revirtiendo' : 'Deshacer'}</button>
                      ) : null}
                    </td>
                  </tr>
                ) : (
                  <tr key={`m${it.a.id}`}>
                    <td className="px-5 py-2.5 whitespace-nowrap text-mute num">{when(it.a.at)}</td>
                    <td className="px-2 py-2.5"><span className="block text-ink truncate max-w-[160px]">{it.a.actor || 'Meta'}</span><Badge>{it.a.app || 'Ads Manager'}</Badge></td>
                    <td className="px-2 py-2.5 max-w-[280px]"><span className="truncate block text-ink" title={it.a.objectName || ''}>{it.a.objectName || '—'}</span><span className="text-[12px] text-mute">{LEVEL[it.a.level] ? `${LEVEL[it.a.level]} · ` : ''}{it.a.what}</span></td>
                    <td className="px-2 py-2.5">{it.a.from || it.a.to ? <><span className="num text-mute">{it.a.from ? `${it.a.from} → ` : ''}</span><span className="num text-ink">{it.a.to || ''}</span></> : <span className="text-faint">—</span>}</td>
                    <td className="px-5 py-2.5 text-right text-[12px] text-faint">{it.a.account}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Panel>
      <p className="text-[12px] text-faint">Los cambios hechos fuera de Faro vienen del registro de actividad de Meta y no se pueden deshacer desde acá.</p>
    </div>
  )
}
