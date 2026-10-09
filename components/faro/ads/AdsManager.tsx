'use client'

import { useMemo, useState } from 'react'
import { useRouter } from 'next/navigation'
import type { TreeNode } from '@/lib/faro/adsTree'
import { money, int, ratio, pct } from '@/lib/faro/format'
import { Badge } from '../ui'

type Field = 'status' | 'daily_budget' | 'name' | 'age_min' | 'age_max' | 'genders' | 'copy'
interface Pending { key: string; node: TreeNode; field: Field; from: unknown; to: unknown; label: string; warning?: string }
interface Account { id: string; name: string; external_id: string; protected_ids: string[] }

const LEVEL: Record<TreeNode['level'], string> = { campaign: 'Campaña', adset: 'Ad set', ad: 'Anuncio' }

function warningFor(node: TreeNode, field: Field, from: unknown, to: unknown): string | undefined {
  if (field === 'daily_budget') {
    const a = Number(from), b = Number(to)
    if (a > 0 && Math.abs(b - a) / a > 0.2) return 'Cambio de más de 20%: puede reiniciar el aprendizaje.'
  }
  if (field === 'status' && to === 'PAUSED' && node.level !== 'ad' && node.m.spend > 0) return 'Si queda pausado más de 7 días, al reactivarlo vuelve a aprendizaje.'
  if (field === 'age_min' || field === 'age_max' || field === 'genders') return 'Cambia la segmentación: reinicia el aprendizaje del ad set.'
  if (field === 'copy') return 'Crea un creativo nuevo: el anuncio vuelve a revisión y aprendizaje.'
  return undefined
}

function describe(field: Field, v: unknown): string {
  if (field === 'status') return v === 'ACTIVE' ? 'Activo' : 'Pausado'
  if (field === 'daily_budget') return money(Number(v))
  if (field === 'genders') { const g = (v as number[]) || []; return g.length === 1 ? (g[0] === 1 ? 'Hombres' : 'Mujeres') : 'Todos' }
  if (field === 'copy') { const c = v as { message?: string; headline?: string; link?: string }; return [c.headline, c.message?.slice(0, 60), c.link].filter(Boolean).join(' · ') || '—' }
  return v == null || v === '' ? '—' : String(v)
}

export default function AdsManager({ tree, accounts, maxCpa, canEdit, focus }: { tree: TreeNode[]; accounts: Account[]; maxCpa: number | null; canEdit: boolean; focus: string | null }) {
  const router = useRouter()
  const [account, setAccount] = useState<string>('all')
  const [showInactive, setShowInactive] = useState(false)
  const [query, setQuery] = useState('')
  const [expanded, setExpanded] = useState<Set<string>>(() => {
    const s = new Set<string>()
    tree.forEach((c) => { if (c.m.spend > 0 || c.effectiveStatus === 'ACTIVE') s.add(c.id) })
    if (focus) tree.forEach((c) => c.children.forEach((a) => { if (a.id === focus) { s.add(c.id); s.add(a.id) } }))
    return s
  })
  const [selected, setSelected] = useState<Set<string>>(new Set())
  const [pending, setPending] = useState<Map<string, Pending>>(new Map())
  const [protectedIds, setProtectedIds] = useState<Record<string, string[]>>(() => Object.fromEntries(accounts.map((a) => [a.id, a.protected_ids])))
  const [confirmProtected, setConfirmProtected] = useState(false)
  const [publishing, setPublishing] = useState(false)
  const [results, setResults] = useState<{ name: string; ok: boolean; error?: string }[] | null>(null)
  const [editing, setEditing] = useState<{ node: TreeNode; kind: 'name' | 'targeting' | 'copy' } | null>(null)
  const [budgetEdit, setBudgetEdit] = useState<string | null>(null)

  const isProtected = (n: TreeNode) => {
    const ids = protectedIds[n.accountId] || []
    return ids.includes(n.id) || (!!n.campaignId && ids.includes(n.campaignId))
  }

  const visible = useMemo(() => {
    const q = query.trim().toLowerCase()
    const keep = (n: TreeNode): boolean => showInactive || n.m.spend > 0 || n.effectiveStatus === 'ACTIVE'
    const match = (n: TreeNode): boolean => !q || n.name.toLowerCase().includes(q) || n.children.some(match)
    return tree.filter((c) => (account === 'all' || c.accountId === account) && keep(c) && match(c))
  }, [tree, account, showInactive, query])

  const valueOf = (n: TreeNode, field: Field) => {
    const p = pending.get(`${n.id}:${field}`)
    if (p) return p.to
    if (field === 'status') return n.status
    if (field === 'daily_budget') return n.dailyBudget
    if (field === 'name') return n.name
    return undefined
  }

  function stage(node: TreeNode, field: Field, to: unknown, from?: unknown) {
    const key = `${node.id}:${field}`
    const orig = from !== undefined ? from : field === 'status' ? node.status : field === 'daily_budget' ? node.dailyBudget : field === 'name' ? node.name : undefined
    setPending((prev) => {
      const next = new Map(prev)
      if (JSON.stringify(orig) === JSON.stringify(to)) next.delete(key)
      else next.set(key, { key, node, field, from: orig, to, label: `${LEVEL[node.level]} · ${node.name}`, warning: warningFor(node, field, orig, to) })
      return next
    })
    setResults(null)
  }

  function bulk(kind: 'pause' | 'activate' | 'up10' | 'down10' | 'up20') {
    const all = new Map<string, TreeNode>()
    const walk = (l: TreeNode[]) => l.forEach((n) => { all.set(n.id, n); walk(n.children) })
    walk(tree)
    const next = new Map(pending)
    Array.from(selected).forEach((id) => {
      const n = all.get(id)
      if (!n) return
      if (kind === 'pause' || kind === 'activate') {
        const to = kind === 'pause' ? 'PAUSED' : 'ACTIVE'
        if (n.status !== to) next.set(`${n.id}:status`, { key: `${n.id}:status`, node: n, field: 'status', from: n.status, to, label: `${LEVEL[n.level]} · ${n.name}`, warning: warningFor(n, 'status', n.status, to) })
      } else if (n.dailyBudget) {
        const f = kind === 'up10' ? 1.1 : kind === 'down10' ? 0.9 : 1.2
        const to = Math.round(n.dailyBudget * f)
        next.set(`${n.id}:daily_budget`, { key: `${n.id}:daily_budget`, node: n, field: 'daily_budget', from: n.dailyBudget, to, label: `${LEVEL[n.level]} · ${n.name}`, warning: warningFor(n, 'daily_budget', n.dailyBudget, to) })
      }
    })
    setPending(next)
    setSelected(new Set())
  }

  async function toggleProtect(n: TreeNode) {
    const cur = protectedIds[n.accountId] || []
    const next = cur.includes(n.id) ? cur.filter((x) => x !== n.id) : [...cur, n.id]
    setProtectedIds({ ...protectedIds, [n.accountId]: next })
    await fetch('/api/v2/ad-accounts', { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ id: n.accountId, protected_ids: next }) })
  }

  async function publish() {
    setPublishing(true)
    const list = Array.from(pending.values())
    const changes = list.map((p) => ({ accountId: p.node.accountId, level: p.node.level, id: p.node.id, field: p.field, value: p.to, confirmProtected }))
    const r = await fetch('/api/v2/meta/mutate', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ changes }) })
    const j = await r.json().catch(() => ({ results: [] }))
    const res = (j.results || []).map((x: { id: string; field: string; ok: boolean; error?: string }, i: number) => ({ name: `${list[i]?.label} (${describe(list[i]?.field, list[i]?.to)})`, ok: x.ok, error: x.error }))
    setResults(res.length ? res : [{ name: 'Cambios', ok: false, error: j.error || 'No se pudieron aplicar' }])
    const failedKeys = new Set(list.filter((_, i) => !(j.results || [])[i]?.ok).map((p) => p.key))
    setPending(new Map(Array.from(pending.entries()).filter(([k]) => failedKeys.has(k))))
    setPublishing(false)
    setConfirmProtected(false)
    router.refresh()
  }

  const anyProtectedPending = Array.from(pending.values()).some((p) => isProtected(p.node))

  const Row = ({ n, depth }: { n: TreeNode; depth: number }) => {
    const status = valueOf(n, 'status') as string
    const budget = valueOf(n, 'daily_budget') as number | null
    const cpa = n.m.purchases > 0 ? n.m.spend / n.m.purchases : null
    const ctr = n.m.impressions > 0 ? n.m.linkClicks / n.m.impressions : null
    const roas = n.m.spend > 0 && n.m.purchaseValue > 0 ? n.m.purchaseValue / n.m.spend : null
    const hasKids = n.children.length > 0
    const prot = isProtected(n)
    const inactiveParent = n.effectiveStatus && !['ACTIVE', 'PAUSED'].includes(n.effectiveStatus)
    return (
      <tr className={`group ${focus === n.id ? 'bg-beacon/10' : depth === 0 ? 'bg-sunken/40' : ''} hover:bg-sunken`}>
        <td className="pl-3 pr-1 py-2 w-8">
          {canEdit && <input type="checkbox" aria-label={`Seleccionar ${n.name}`} checked={selected.has(n.id)} onChange={(e) => { const s = new Set(selected); if (e.target.checked) s.add(n.id); else s.delete(n.id); setSelected(s) }} className="accent-[rgb(var(--f-ink))]" />}
        </td>
        <td className="py-2 pr-3 min-w-[280px] max-w-[420px]">
          <div className="flex items-center gap-2" style={{ paddingLeft: depth * 18 }}>
            {hasKids ? (
              <button onClick={() => { const s = new Set(expanded); if (s.has(n.id)) s.delete(n.id); else s.add(n.id); setExpanded(s) }} className="w-5 h-5 grid place-items-center rounded text-mute hover:text-ink" aria-label={expanded.has(n.id) ? 'Contraer' : 'Expandir'} aria-expanded={expanded.has(n.id)}>
                <svg viewBox="0 0 24 24" className={`w-3.5 h-3.5 transition-transform ${expanded.has(n.id) ? 'rotate-90' : ''}`} fill="none" stroke="currentColor" strokeWidth="2.2"><path d="m9 6 6 6-6 6" /></svg>
              </button>
            ) : <span className="w-5" />}
            {n.level === 'ad' && n.thumbnail && <img src={n.thumbnail} alt="" className="w-8 h-8 rounded object-cover border border-line shrink-0" />}
            <button
              disabled={!canEdit || inactiveParent === true}
              onClick={() => stage(n, 'status', status === 'ACTIVE' ? 'PAUSED' : 'ACTIVE')}
              role="switch"
              aria-checked={status === 'ACTIVE'}
              aria-label={status === 'ACTIVE' ? 'Pausar' : 'Activar'}
              title={inactiveParent ? `Estado en Meta: ${n.effectiveStatus}` : status === 'ACTIVE' ? 'Activo: tocar para pausar' : 'Pausado: tocar para activar'}
              className={`relative w-8 h-[18px] rounded-full shrink-0 transition-colors ${status === 'ACTIVE' ? 'bg-good' : 'bg-line'} disabled:opacity-50`}
            >
              <span className={`absolute top-[2px] w-[14px] h-[14px] rounded-full bg-surface shadow transition-all ${status === 'ACTIVE' ? 'left-[16px]' : 'left-[2px]'}`} />
            </button>
            <div className="min-w-0">
              <p className={`truncate text-[13.5px] ${depth === 0 ? 'font-semibold' : ''} text-ink`} title={n.name}>{valueOf(n, 'name') as string}</p>
              <div className="flex flex-wrap gap-1 mt-0.5">
                {prot && <Badge tone="warn" title="Pide doble confirmación para cualquier cambio">protegido</Badge>}
                {n.effectiveStatus && !['ACTIVE', 'PAUSED'].includes(n.effectiveStatus) && <Badge>{n.effectiveStatus.replace(/_/g, ' ').toLowerCase()}</Badge>}
                {n.level === 'adset' && n.optimizationGoal && <span className="text-[11.5px] text-faint">{n.optimizationGoal.replace(/_/g, ' ').toLowerCase()}</span>}
              </div>
            </div>
            {canEdit && (
              <details className="relative ml-auto opacity-60 group-hover:opacity-100">
                <summary className="list-none cursor-pointer px-1.5 rounded text-mute hover:text-ink" aria-label="Más acciones">···</summary>
                <div className="absolute right-0 z-20 mt-1 w-48 rounded-lg border border-line bg-surface shadow-lg py-1 text-[13px]">
                  <button className="block w-full text-left px-3 py-1.5 hover:bg-sunken" onClick={() => setEditing({ node: n, kind: 'name' })}>Cambiar nombre</button>
                  {n.level === 'adset' && <button className="block w-full text-left px-3 py-1.5 hover:bg-sunken" onClick={() => setEditing({ node: n, kind: 'targeting' })}>Edad y género</button>}
                  {n.level === 'ad' && <button className="block w-full text-left px-3 py-1.5 hover:bg-sunken" onClick={() => setEditing({ node: n, kind: 'copy' })}>Editar texto y link</button>}
                  {n.level !== 'ad' && <button className="block w-full text-left px-3 py-1.5 hover:bg-sunken" onClick={() => toggleProtect(n)}>{(protectedIds[n.accountId] || []).includes(n.id) ? 'Quitar protección' : 'Proteger (doble confirmación)'}</button>}
                  <a className="block px-3 py-1.5 hover:bg-sunken" target="_blank" rel="noreferrer" href={`https://adsmanager.facebook.com/adsmanager/manage/${n.level === 'campaign' ? 'campaigns' : n.level === 'adset' ? 'adsets' : 'ads'}?act=${n.accountExternal.replace('act_', '')}&selected_${n.level === 'campaign' ? 'campaign' : n.level === 'adset' ? 'adset' : 'ad'}_ids=${n.id}`}>Abrir en Ads Manager</a>
                </div>
              </details>
            )}
          </div>
        </td>
        <td className="px-2 py-2 text-right num whitespace-nowrap">
          {budget != null ? (
            budgetEdit === n.id && canEdit ? (
              <input
                autoFocus type="number" min={1} defaultValue={budget}
                onBlur={(e) => { setBudgetEdit(null); const v = Number(e.target.value); if (v > 0) stage(n, 'daily_budget', Math.round(v)) }}
                onKeyDown={(e) => { if (e.key === 'Enter') (e.target as HTMLInputElement).blur(); if (e.key === 'Escape') setBudgetEdit(null) }}
                className="w-24 rounded border border-beacon bg-surface px-1.5 py-0.5 text-right text-[13px]"
                aria-label="Presupuesto diario"
              />
            ) : (
              <button disabled={!canEdit} onClick={() => setBudgetEdit(n.id)} className={`rounded px-1 hover:bg-sunken ${pending.has(`${n.id}:daily_budget`) ? 'text-beacon-ink font-semibold' : ''}`} title="Editar presupuesto diario">{money(budget)}</button>
            )
          ) : <span className="text-faint">{n.level === 'adset' ? 'de campaña' : n.level === 'campaign' && n.children.some((c) => c.dailyBudget) ? 'por ad set' : '—'}</span>}
        </td>
        <td className="px-2 py-2 text-right num">{money(n.m.spend)}</td>
        <td className="px-2 py-2 text-right num">{int(n.m.purchases)}</td>
        <td className={`px-2 py-2 text-right num ${cpa != null && maxCpa != null ? (cpa <= maxCpa ? 'text-good' : 'text-bad') : 'text-mute'}`}>{cpa != null ? money(cpa) : '—'}</td>
        <td className="px-2 py-2 text-right num">{roas != null ? ratio(roas) : '—'}</td>
        <td className="px-2 py-2 text-right num">{pct(ctr, 2)}</td>
        <td className={`px-3 py-2 text-right num ${n.frequency != null && n.frequency > 3 ? 'text-warn font-medium' : ''}`}>{n.frequency != null ? n.frequency.toLocaleString('es-AR', { maximumFractionDigits: 1 }) : ''}</td>
      </tr>
    )
  }

  const renderRows = (list: TreeNode[], depth: number): React.ReactNode[] =>
    list.flatMap((n) => [
      <Row key={n.id} n={n} depth={depth} />,
      ...(expanded.has(n.id) ? renderRows(n.children.filter((c) => showInactive || c.m.spend > 0 || c.effectiveStatus === 'ACTIVE'), depth + 1) : []),
    ])

  return (
    <div className="flex flex-col gap-4 pb-28">
      <div className="flex flex-wrap items-center gap-3">
        {accounts.length > 1 && (
          <select value={account} onChange={(e) => setAccount(e.target.value)} className="rounded-lg border border-line bg-surface px-2.5 py-1.5 text-[13.5px]" aria-label="Cuenta publicitaria">
            <option value="all">Todas las cuentas</option>
            {accounts.map((a) => <option key={a.id} value={a.id}>{a.name}</option>)}
          </select>
        )}
        <input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Buscar por nombre" className="rounded-lg border border-line bg-surface px-3 py-1.5 text-[13.5px] w-56" aria-label="Buscar" />
        <label className="flex items-center gap-2 text-[13.5px] text-mute">
          <input type="checkbox" checked={showInactive} onChange={(e) => setShowInactive(e.target.checked)} className="accent-[rgb(var(--f-ink))]" />
          Mostrar pausados sin gasto
        </label>
        {maxCpa != null && <span className="ml-auto text-[13px] text-mute">Costo por compra máximo rentable: <span className="num text-ink font-medium">{money(maxCpa)}</span></span>}
      </div>

      {selected.size > 0 && canEdit && (
        <div className="flex flex-wrap items-center gap-2 rounded-lg border border-line bg-surface px-3 py-2 text-[13.5px]">
          <span className="text-mute mr-1">{selected.size} seleccionados:</span>
          <button onClick={() => bulk('pause')} className="rounded-md border border-line px-2.5 py-1 hover:bg-sunken">Pausar</button>
          <button onClick={() => bulk('activate')} className="rounded-md border border-line px-2.5 py-1 hover:bg-sunken">Activar</button>
          <button onClick={() => bulk('down10')} className="rounded-md border border-line px-2.5 py-1 hover:bg-sunken">Presupuesto −10%</button>
          <button onClick={() => bulk('up10')} className="rounded-md border border-line px-2.5 py-1 hover:bg-sunken">+10%</button>
          <button onClick={() => bulk('up20')} className="rounded-md border border-line px-2.5 py-1 hover:bg-sunken">+20%</button>
          <button onClick={() => setSelected(new Set())} className="ml-auto text-mute hover:text-ink">Limpiar</button>
        </div>
      )}

      <div className="rounded-panel border border-line bg-surface overflow-x-auto">
        <table className="w-full text-[13.5px] min-w-[920px]">
          <thead>
            <tr className="text-mute text-left border-b border-line">
              <th className="w-8" />
              <th className="font-medium py-2.5 pr-3">Nombre</th>
              <th className="font-medium px-2 py-2.5 text-right">Presupuesto/día</th>
              <th className="font-medium px-2 py-2.5 text-right">Gasto</th>
              <th className="font-medium px-2 py-2.5 text-right">Compras</th>
              <th className="font-medium px-2 py-2.5 text-right">Costo/compra</th>
              <th className="font-medium px-2 py-2.5 text-right">ROAS Meta</th>
              <th className="font-medium px-2 py-2.5 text-right">CTR</th>
              <th className="font-medium px-3 py-2.5 text-right">Frecuencia</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-line">
            {visible.length ? renderRows(visible, 0) : (
              <tr><td colSpan={9} className="py-10 text-center text-mute">No hay campañas con gasto o activas en este período.</td></tr>
            )}
          </tbody>
        </table>
      </div>

      {results && (
        <div className="rounded-panel border border-line bg-surface px-5 py-3 text-[13.5px]">
          <p className="font-medium mb-1">Resultado</p>
          <ul className="flex flex-col gap-1">
            {results.map((r, i) => <li key={i} className={r.ok ? 'text-good' : 'text-bad'}>{r.ok ? 'Aplicado' : 'No se aplicó'}: <span className="text-ink">{r.name}</span>{r.error ? ` — ${r.error}` : ''}</li>)}
          </ul>
        </div>
      )}

      {pending.size > 0 && (
        <div className="fixed bottom-0 inset-x-0 lg:left-60 z-30 border-t border-line bg-surface shadow-[0_-8px_24px_rgb(0_0_0/0.08)]">
          <div className="max-w-[1240px] mx-auto px-4 lg:px-8 py-3">
            <details>
              <summary className="cursor-pointer text-[14px] font-semibold text-ink">{pending.size} {pending.size === 1 ? 'cambio sin publicar' : 'cambios sin publicar'} · ver detalle</summary>
              <ul className="mt-2 max-h-56 overflow-y-auto divide-y divide-line text-[13px]">
                {Array.from(pending.values()).map((p) => (
                  <li key={p.key} className="py-1.5 flex flex-wrap items-baseline gap-x-2">
                    <span className="text-ink truncate max-w-[340px]">{p.label}</span>
                    <span className="num text-mute">{describe(p.field, p.from)} → <span className="text-ink font-medium">{describe(p.field, p.to)}</span></span>
                    {isProtected(p.node) && <Badge tone="warn">protegido</Badge>}
                    {p.warning && <span className="text-warn w-full">{p.warning}</span>}
                    <button onClick={() => { const m = new Map(pending); m.delete(p.key); setPending(m) }} className="ml-auto text-mute hover:text-ink">Quitar</button>
                  </li>
                ))}
              </ul>
            </details>
            <div className="mt-2 flex flex-wrap items-center gap-3">
              {anyProtectedPending && (
                <label className="flex items-center gap-2 text-[13px] text-warn">
                  <input type="checkbox" checked={confirmProtected} onChange={(e) => setConfirmProtected(e.target.checked)} />
                  Entiendo que estoy cambiando algo protegido
                </label>
              )}
              <div className="ml-auto flex gap-2">
                <button onClick={() => setPending(new Map())} className="rounded-lg px-3 py-2 text-[13.5px] text-mute hover:text-ink">Descartar</button>
                <button onClick={publish} disabled={publishing || (anyProtectedPending && !confirmProtected)} className="rounded-lg bg-ink text-surface px-4 py-2 text-[13.5px] font-semibold disabled:opacity-50">
                  {publishing ? 'Publicando' : `Publicar en Meta`}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {editing && <EditDialog editing={editing} onClose={() => setEditing(null)} onStage={(field, to, from) => { stage(editing.node, field, to, from); setEditing(null) }} />}
    </div>
  )
}

function EditDialog({ editing, onClose, onStage }: { editing: { node: TreeNode; kind: 'name' | 'targeting' | 'copy' }; onClose: () => void; onStage: (field: Field, to: unknown, from?: unknown) => void }) {
  const n = editing.node
  const t = (n.targeting || {}) as { age_min?: number; age_max?: number; genders?: number[] }
  const [name, setName] = useState(n.name)
  const [ageMin, setAgeMin] = useState(t.age_min ?? 18)
  const [ageMax, setAgeMax] = useState(t.age_max ?? 65)
  const [gender, setGender] = useState(t.genders?.length === 1 ? String(t.genders[0]) : 'all')
  const [message, setMessage] = useState('')
  const [headline, setHeadline] = useState('')
  const [link, setLink] = useState('')
  const [stagedMulti, setStagedMulti] = useState(false)

  return (
    <div className="fixed inset-0 z-40 bg-ink/40 grid place-items-center p-4" role="dialog" aria-modal="true" onClick={onClose}>
      <div className="w-full max-w-md rounded-panel border border-line bg-surface p-5" onClick={(e) => e.stopPropagation()}>
        <h3 className="text-[16px] font-semibold text-ink">{editing.kind === 'name' ? 'Cambiar nombre' : editing.kind === 'targeting' ? 'Edad y género' : 'Texto y link del anuncio'}</h3>
        <p className="text-[13px] text-mute mt-0.5 truncate">{n.name}</p>
        <div className="mt-4 flex flex-col gap-3 text-[13.5px]">
          {editing.kind === 'name' && (
            <label className="flex flex-col gap-1">Nombre<input value={name} onChange={(e) => setName(e.target.value)} className="rounded-lg border border-line bg-surface px-3 py-2" /></label>
          )}
          {editing.kind === 'targeting' && (
            <>
              <div className="flex gap-3">
                <label className="flex flex-col gap-1 flex-1">Edad mínima<input type="number" min={18} max={65} value={ageMin} onChange={(e) => setAgeMin(Number(e.target.value))} className="rounded-lg border border-line bg-surface px-3 py-2" /></label>
                <label className="flex flex-col gap-1 flex-1">Edad máxima<input type="number" min={18} max={65} value={ageMax} onChange={(e) => setAgeMax(Number(e.target.value))} className="rounded-lg border border-line bg-surface px-3 py-2" /></label>
              </div>
              <label className="flex flex-col gap-1">Género
                <select value={gender} onChange={(e) => setGender(e.target.value)} className="rounded-lg border border-line bg-surface px-3 py-2">
                  <option value="all">Todos</option><option value="1">Hombres</option><option value="2">Mujeres</option>
                </select>
              </label>
              <p className="text-warn text-[12.5px]">Cambiar la segmentación reinicia el aprendizaje del ad set. En campañas Advantage+ Meta puede ignorar estos límites.</p>
            </>
          )}
          {editing.kind === 'copy' && (
            <>
              <label className="flex flex-col gap-1">Texto principal (vacío = sin cambios)<textarea rows={4} value={message} onChange={(e) => setMessage(e.target.value)} className="rounded-lg border border-line bg-surface px-3 py-2" /></label>
              <label className="flex flex-col gap-1">Título (vacío = sin cambios)<input value={headline} onChange={(e) => setHeadline(e.target.value)} className="rounded-lg border border-line bg-surface px-3 py-2" /></label>
              <label className="flex flex-col gap-1">Link de destino (vacío = sin cambios)<input value={link} onChange={(e) => setLink(e.target.value)} placeholder="https://" className="rounded-lg border border-line bg-surface px-3 py-2" /></label>
              <p className="text-warn text-[12.5px]">Se crea un creativo nuevo con estos cambios: el anuncio vuelve a revisión de Meta y a aprendizaje.</p>
            </>
          )}
        </div>
        <div className="mt-5 flex justify-end gap-2">
          <button onClick={onClose} className="rounded-lg px-3 py-2 text-[13.5px] text-mute hover:text-ink">Cancelar</button>
          <button
            disabled={stagedMulti}
            onClick={() => {
              if (editing.kind === 'name') onStage('name', name.trim())
              else if (editing.kind === 'copy') {
                const v: Record<string, string> = {}
                if (message.trim()) v.message = message.trim()
                if (headline.trim()) v.headline = headline.trim()
                if (link.trim()) v.link = link.trim()
                if (Object.keys(v).length) onStage('copy', v, {})
                else onClose()
              } else {
                setStagedMulti(true)
                if (ageMin !== (t.age_min ?? 18)) onStage('age_min', ageMin, t.age_min ?? 18)
                if (ageMax !== (t.age_max ?? 65)) onStage('age_max', ageMax, t.age_max ?? 65)
                const g = gender === 'all' ? [] : [Number(gender)]
                if (JSON.stringify(g) !== JSON.stringify(t.genders?.length === 1 ? t.genders : [])) onStage('genders', g, t.genders || [])
                onClose()
              }
            }}
            className="rounded-lg bg-ink text-surface px-4 py-2 text-[13.5px] font-semibold"
          >
            Agregar a cambios
          </button>
        </div>
      </div>
    </div>
  )
}

