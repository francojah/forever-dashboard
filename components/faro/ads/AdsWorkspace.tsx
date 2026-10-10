'use client'

import { useEffect, useMemo, useState } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import type { TreeNode, Metrics } from '@/lib/faro/adsTree'
import { money, int, ratio, pct } from '@/lib/faro/format'
import { Badge, Explain } from '../ui'
import { Field, Pending, Account, LEVEL, warningFor, describe, EditDialog, Pacing } from './editing'

type Level = 'campaign' | 'adset' | 'ad'
type View = 'resultados' | 'entrega' | 'embudo' | 'video'
type StatusFilter = 'activos' | 'gasto' | 'todos'
interface Row { n: TreeNode; campaign: string; adset: string | null }
interface Col { key: string; label: string; title?: string; val: (m: Metrics, n: TreeNode) => number | null; fmt: (v: number | null, n: TreeNode) => React.ReactNode; tone?: (v: number | null) => string }
export interface DayPoint { date: string; spend: number; purchases: number; value: number }

const div = (a: number, b: number) => (b > 0 ? a / b : null)
const VIEWS: { key: View; label: string }[] = [
  { key: 'resultados', label: 'Resultados' }, { key: 'entrega', label: 'Entrega y costos' }, { key: 'embudo', label: 'Embudo' }, { key: 'video', label: 'Video' },
]

function sumMetrics(list: TreeNode[]): Metrics {
  const z: Metrics = { spend: 0, impressions: 0, reach: 0, linkClicks: 0, lpv: 0, atc: 0, ic: 0, purchases: 0, purchaseValue: 0, video3s: 0, videoP50: 0 }
  for (const n of list) (Object.keys(z) as (keyof Metrics)[]).forEach((k) => { z[k] += n.m[k] })
  return z
}

/** Barras de gasto por día con puntos de compras. Sin librerías, liviano. */
function DailyBars({ days, height = 72 }: { days: DayPoint[]; height?: number }) {
  if (!days.length) return <div className="h-[72px] grid place-items-center text-[12px] text-faint">Sin datos diarios</div>
  const maxS = Math.max(1, ...days.map((d) => d.spend))
  const maxP = Math.max(1, ...days.map((d) => d.purchases))
  const w = 100 / days.length
  return (
    <svg viewBox={`0 0 100 ${height}`} preserveAspectRatio="none" className="w-full" style={{ height }} role="img" aria-label="Gasto y compras por día">
      {days.map((d, i) => {
        const h = (d.spend / maxS) * (height - 10)
        return (
          <g key={d.date}>
            <title>{`${d.date.slice(8)}/${d.date.slice(5, 7)}: ${money(d.spend)} · ${int(d.purchases)} compras`}</title>
            <rect x={i * w + w * 0.15} y={height - h} width={w * 0.7} height={h} rx={0.6} className="fill-[rgb(var(--f-ink)/0.18)]" />
            {d.purchases > 0 && <circle cx={i * w + w / 2} cy={height - 4 - (d.purchases / maxP) * (height - 14)} r={1.4} className="fill-[rgb(var(--f-good))]" />}
          </g>
        )
      })}
    </svg>
  )
}

export default function AdsWorkspace({
  tree, accounts, maxCpa, canEdit, focus, todaySpend = {}, hourShare = 1, daily, period,
}: {
  tree: TreeNode[]; accounts: Account[]; maxCpa: number | null; canEdit: boolean; focus: string | null
  todaySpend?: Record<string, number>; hourShare?: number; daily: DayPoint[]; period: { from: string; to: string; label: string; key: string }
}) {
  const router = useRouter()
  const [level, setLevel] = useState<Level>('campaign')
  const [view, setView] = useState<View>('resultados')
  const [statusF, setStatusF] = useState<StatusFilter>('gasto')
  const [account, setAccount] = useState('all')
  const [query, setQuery] = useState('')
  const [sort, setSort] = useState<{ key: string; dir: 1 | -1 }>({ key: 'spend', dir: -1 })
  const [openId, setOpenId] = useState<string | null>(focus)
  const [selected, setSelected] = useState<Set<string>>(new Set())
  const [pending, setPending] = useState<Map<string, Pending>>(new Map())
  const [protectedIds, setProtectedIds] = useState<Record<string, string[]>>(() => Object.fromEntries(accounts.map((a) => [a.id, a.protected_ids])))
  const [confirmProtected, setConfirmProtected] = useState(false)
  const [publishing, setPublishing] = useState(false)
  const [results, setResults] = useState<{ name: string; ok: boolean; error?: string }[] | null>(null)
  const [editing, setEditing] = useState<{ node: TreeNode; kind: 'name' | 'targeting' | 'copy' } | null>(null)

  useEffect(() => {
    try {
      const v = localStorage.getItem('faro_ads_view') as View | null
      if (v && VIEWS.some((x) => x.key === v)) setView(v)
      const l = localStorage.getItem('faro_ads_level') as Level | null
      if (l && !focus) setLevel(l)
    } catch { /* sin storage */ }
  }, [focus])
  const remember = (k: string, v: string) => { try { localStorage.setItem(k, v) } catch { /* sin storage */ } }

  // Índices
  const { rows, byId } = useMemo(() => {
    const r: Record<Level, Row[]> = { campaign: [], adset: [], ad: [] }
    const map = new Map<string, Row>()
    for (const c of tree) {
      const rc = { n: c, campaign: c.name, adset: null }; r.campaign.push(rc); map.set(c.id, rc)
      for (const s of c.children) {
        const rs = { n: s, campaign: c.name, adset: null }; r.adset.push(rs); map.set(s.id, rs)
        for (const a of s.children) { const ra = { n: a, campaign: c.name, adset: s.name }; r.ad.push(ra); map.set(a.id, ra) }
      }
    }
    return { rows: r, byId: map }
  }, [tree])

  useEffect(() => { if (focus) { const f = byId.get(focus); if (f) setLevel(f.n.level) } }, [focus, byId])

  const isProtected = (n: TreeNode) => { const ids = protectedIds[n.accountId] || []; return ids.includes(n.id) || (!!n.campaignId && ids.includes(n.campaignId)) }
  const valueOf = (n: TreeNode, field: Field) => {
    const p = pending.get(`${n.id}:${field}`)
    if (p) return p.to
    return field === 'status' ? n.status : field === 'daily_budget' ? n.dailyBudget : field === 'name' ? n.name : undefined
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
    setPending((prev) => {
      const next = new Map(prev)
      Array.from(selected).forEach((id) => {
        const n = byId.get(id)?.n
        if (!n) return
        if (kind === 'pause' || kind === 'activate') {
          const to = kind === 'pause' ? 'PAUSED' : 'ACTIVE'
          if (n.status !== to) next.set(`${n.id}:status`, { key: `${n.id}:status`, node: n, field: 'status', from: n.status, to, label: `${LEVEL[n.level]} · ${n.name}`, warning: warningFor(n, 'status', n.status, to) })
        } else if (n.dailyBudget) {
          const to = Math.round(n.dailyBudget * (kind === 'up10' ? 1.1 : kind === 'down10' ? 0.9 : 1.2))
          next.set(`${n.id}:daily_budget`, { key: `${n.id}:daily_budget`, node: n, field: 'daily_budget', from: n.dailyBudget, to, label: `${LEVEL[n.level]} · ${n.name}`, warning: warningFor(n, 'daily_budget', n.dailyBudget, to) })
        }
      })
      return next
    })
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
    const res = (j.results || []).map((x: { ok: boolean; error?: string }, i: number) => ({ name: `${list[i]?.label} (${describe(list[i]?.field, list[i]?.to)})`, ok: x.ok, error: x.error }))
    setResults(res.length ? res : [{ name: 'Cambios', ok: false, error: j.error || 'No se pudieron aplicar' }])
    const failed = new Set(list.filter((_, i) => !(j.results || [])[i]?.ok).map((p) => p.key))
    setPending(new Map(Array.from(pending.entries()).filter(([k]) => failed.has(k))))
    setPublishing(false); setConfirmProtected(false)
    router.refresh()
  }

  // Columnas
  const cpaTone = (v: number | null) => (v != null && maxCpa != null ? (v <= maxCpa ? 'text-good' : 'text-bad') : 'text-mute')
  const COLS: Record<View, Col[]> = useMemo(() => {
    const spend: Col = { key: 'spend', label: 'Gasto', val: (m) => m.spend, fmt: (v) => money(v) }
    const purchases: Col = { key: 'purchases', label: 'Compras', val: (m) => m.purchases, fmt: (v) => int(v) }
    const cpa: Col = { key: 'cpa', label: 'Costo/compra', title: 'Gasto ÷ compras', val: (m) => div(m.spend, m.purchases), fmt: (v) => (v != null ? money(v) : '—'), tone: cpaTone }
    const roas: Col = { key: 'roas', label: 'ROAS', title: 'Valor de compras que informa Meta ÷ gasto', val: (m) => (m.purchaseValue > 0 ? div(m.purchaseValue, m.spend) : null), fmt: (v) => (v != null ? ratio(v) : '—') }
    const ctr: Col = { key: 'ctr', label: 'CTR', title: 'Clics en el enlace ÷ impresiones', val: (m) => div(m.linkClicks, m.impressions), fmt: (v) => pct(v, 2) }
    const cpc: Col = { key: 'cpc', label: 'CPC', title: 'Costo por clic en el enlace', val: (m) => div(m.spend, m.linkClicks), fmt: (v) => money(v) }
    const cpm: Col = { key: 'cpm', label: 'CPM', title: 'Costo por mil impresiones', val: (m) => div(m.spend * 1000, m.impressions), fmt: (v) => money(v) }
    const freq: Col = { key: 'freq', label: 'Frecuencia', title: 'Veces que la misma persona vio el anuncio en el período (por ad set)', val: (_, n) => n.frequency, fmt: (v) => (v != null ? v.toLocaleString('es-AR', { maximumFractionDigits: 1 }) : ''), tone: (v) => (v != null && v > 3 ? 'text-warn font-medium' : '') }
    return {
      resultados: [spend, purchases, cpa, roas, ctr, cpc, freq],
      entrega: [spend,
        { key: 'today', label: 'Gasto hoy', val: (_, n) => todaySpend[n.id] || 0, fmt: (v) => money(v) },
        { key: 'imp', label: 'Impresiones', val: (m) => m.impressions, fmt: (v) => int(v) },
        cpm, ctr, cpc,
        { key: 'cpv', label: 'Costo/visita', title: 'Costo por visita a la web (landing page view)', val: (m) => div(m.spend, m.lpv), fmt: (v) => money(v) },
        freq],
      embudo: [
        { key: 'clk', label: 'Clics', val: (m) => m.linkClicks, fmt: (v) => int(v) },
        { key: 'lpv', label: 'Visitas', title: 'Landing page views', val: (m) => m.lpv, fmt: (v) => int(v) },
        { key: 'atcr', label: 'Carrito', title: 'Agregaron al carrito ÷ visitas', val: (m) => div(m.atc, m.lpv), fmt: (v) => pct(v, 1) },
        { key: 'icr', label: 'Pago', title: 'Iniciaron el pago ÷ carritos', val: (m) => div(m.ic, m.atc), fmt: (v) => pct(v) },
        { key: 'pr', label: 'Compra', title: 'Compras ÷ pagos iniciados', val: (m) => div(m.purchases, m.ic), fmt: (v) => pct(v) },
        { key: 'cvr', label: 'Conversión', title: 'Compras ÷ visitas', val: (m) => div(m.purchases, m.lpv), fmt: (v) => pct(v, 2) },
        cpa],
      video: [spend,
        { key: 'hook', label: 'Hook rate', title: 'Reproducciones de 3 s ÷ impresiones. Bueno: más de 25%', val: (m) => (m.video3s > 0 ? div(m.video3s, m.impressions) : null), fmt: (v) => pct(v), tone: (v) => (v == null ? 'text-faint' : v >= 0.25 ? 'text-good' : v < 0.15 ? 'text-bad' : '') },
        { key: 'hold', label: 'Retención', title: 'Vieron la mitad ÷ vieron 3 s', val: (m) => (m.video3s > 0 ? div(m.videoP50, m.video3s) : null), fmt: (v) => pct(v) },
        ctr, cpa, freq],
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [maxCpa, todaySpend])
  const cols = COLS[view]

  const visible = useMemo(() => {
    const q = query.trim().toLowerCase()
    const list = rows[level].filter(({ n, campaign, adset }) =>
      (account === 'all' || n.accountId === account) &&
      (statusF === 'todos' || (statusF === 'activos' ? n.effectiveStatus === 'ACTIVE' : n.m.spend > 0 || n.effectiveStatus === 'ACTIVE')) &&
      (!q || n.name.toLowerCase().includes(q) || campaign.toLowerCase().includes(q) || (adset || '').toLowerCase().includes(q)))
    const col = [...cols, { key: 'name', val: () => 0 } as unknown as Col].find((c) => c.key === sort.key)
    return [...list].sort((a, b) => {
      if (sort.key === 'name') return a.n.name.localeCompare(b.n.name) * sort.dir
      const va = col?.val(a.n.m, a.n) ?? null, vb = col?.val(b.n.m, b.n) ?? null
      if (va == null && vb == null) return 0
      if (va == null) return 1
      if (vb == null) return -1
      return (va - vb) * sort.dir
    })
  }, [rows, level, account, statusF, query, sort, cols])

  const scope = useMemo(() => tree.filter((c) => account === 'all' || c.accountId === account), [tree, account])
  const total = useMemo(() => sumMetrics(scope), [scope])
  const totalVisible = useMemo(() => sumMetrics(visible.map((r) => r.n)), [visible])
  const budgetToday = useMemo(() => {
    let budget = 0, spent = 0
    for (const c of scope) {
      if (c.effectiveStatus !== 'ACTIVE') continue
      if (c.dailyBudget) { budget += c.dailyBudget; spent += todaySpend[c.id] || 0 }
      else for (const s of c.children) if (s.effectiveStatus === 'ACTIVE' && s.dailyBudget) { budget += s.dailyBudget; spent += todaySpend[s.id] || 0 }
    }
    return { budget, spent }
  }, [scope, todaySpend])

  const open = openId ? byId.get(openId) || null : null
  const anyProtectedPending = Array.from(pending.values()).some((p) => isProtected(p.node))
  const counts = { campaign: rows.campaign.filter((r) => account === 'all' || r.n.accountId === account).length, adset: rows.adset.filter((r) => account === 'all' || r.n.accountId === account).length, ad: rows.ad.filter((r) => account === 'all' || r.n.accountId === account).length }

  const cpaAll = div(total.spend, total.purchases)
  const kpis = [
    { l: 'Gasto', v: money(total.spend), s: budgetToday.budget > 0 ? `hoy ${money(budgetToday.spent)} de ${money(budgetToday.budget)}` : `${int(total.impressions)} impresiones` },
    { l: 'Compras', v: int(total.purchases), s: `${pct(div(total.purchases, total.lpv), 2)} de las visitas` },
    { l: 'Costo por compra', v: cpaAll != null ? money(cpaAll) : '—', s: maxCpa != null ? `máximo rentable ${money(maxCpa)}` : '', tone: cpaTone(cpaAll) },
    { l: 'ROAS Meta', v: total.purchaseValue > 0 ? ratio(total.purchaseValue / total.spend) : '—', s: `${money(total.purchaseValue)} en compras` },
    { l: 'CTR', v: pct(div(total.linkClicks, total.impressions), 2), s: `CPC ${money(div(total.spend, total.linkClicks))}` },
    { l: 'CPM', v: money(div(total.spend * 1000, total.impressions)), s: `${int(total.linkClicks)} clics` },
  ]

  return (
    <div className="flex flex-col gap-4 pb-28">
      {/* Resumen */}
      <section className="rounded-panel border border-line bg-surface">
        <div className="grid grid-cols-2 sm:grid-cols-3 xl:grid-cols-6">
          {kpis.map((k, i) => (
            <div key={k.l} className={`p-4 border-line ${i > 0 ? 'border-l' : ''} ${i >= 2 ? 'max-sm:border-t' : ''} ${i === 2 ? 'max-sm:border-l-0' : ''} ${i >= 3 ? 'sm:max-xl:border-t' : ''} ${i === 3 ? 'sm:max-xl:border-l-0' : ''} ${i === 4 ? 'max-sm:border-l-0' : ''}`}>
              <p className="text-[12.5px] text-mute">{k.l}</p>
              <p className={`num mt-1.5 text-[22px] font-semibold leading-none ${k.tone || 'text-ink'}`}>{k.v}</p>
              <p className="mt-1.5 text-[12px] text-mute truncate">{k.s}</p>
            </div>
          ))}
        </div>
        <div className="border-t border-line px-4 pt-3 pb-2">
          <div className="flex items-center justify-between text-[12px] text-mute mb-1"><span>Gasto por día · <span className="text-good">●</span> compras</span><span>{period.label}</span></div>
          <DailyBars days={daily} />
        </div>
      </section>

      {/* Barra de herramientas */}
      <div className="flex flex-wrap items-center gap-2">
        <div role="tablist" aria-label="Nivel" className="flex rounded-lg border border-line bg-surface p-0.5 text-[13.5px]">
          {(['campaign', 'adset', 'ad'] as Level[]).map((l) => (
            <button key={l} role="tab" aria-selected={level === l} onClick={() => { setLevel(l); remember('faro_ads_level', l); setSelected(new Set()) }}
              className={`rounded-md px-3 py-1.5 ${level === l ? 'bg-ink text-bg font-medium' : 'text-mute hover:text-ink'}`}>
              {l === 'campaign' ? 'Campañas' : l === 'adset' ? 'Ad sets' : 'Anuncios'} <span className="num opacity-70">{counts[l]}</span>
            </button>
          ))}
        </div>
        <select value={statusF} onChange={(e) => setStatusF(e.target.value as StatusFilter)} className="rounded-lg border border-line bg-surface px-2.5 py-1.5 text-[13.5px]" aria-label="Filtrar por estado">
          <option value="gasto">Activos o con gasto</option><option value="activos">Solo activos</option><option value="todos">Todos</option>
        </select>
        {accounts.length > 1 && (
          <select value={account} onChange={(e) => setAccount(e.target.value)} className="rounded-lg border border-line bg-surface px-2.5 py-1.5 text-[13.5px]" aria-label="Cuenta publicitaria">
            <option value="all">Todas las cuentas</option>
            {accounts.map((a) => <option key={a.id} value={a.id}>{a.name}</option>)}
          </select>
        )}
        <input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Buscar" className="rounded-lg border border-line bg-surface px-3 py-1.5 text-[13.5px] w-44" aria-label="Buscar" />
        <div className="ml-auto flex items-center gap-2">
          <select value={view} onChange={(e) => { setView(e.target.value as View); remember('faro_ads_view', e.target.value) }} className="rounded-lg border border-line bg-surface px-2.5 py-1.5 text-[13.5px]" aria-label="Columnas">
            {VIEWS.map((v) => <option key={v.key} value={v.key}>Columnas: {v.label}</option>)}
          </select>
          {canEdit && <Link href="/anuncios?tab=publicar" className="rounded-lg bg-ink text-bg px-3 py-1.5 text-[13.5px] font-medium">Cargar anuncios</Link>}
        </div>
      </div>

      {selected.size > 0 && canEdit && (
        <div className="flex flex-wrap items-center gap-2 rounded-lg border border-beacon/40 bg-beacon/10 px-3 py-2 text-[13.5px]">
          <span className="font-medium mr-1">{selected.size} seleccionados</span>
          <button onClick={() => bulk('pause')} className="rounded-md border border-line bg-surface px-2.5 py-1 hover:bg-sunken">Pausar</button>
          <button onClick={() => bulk('activate')} className="rounded-md border border-line bg-surface px-2.5 py-1 hover:bg-sunken">Activar</button>
          {level !== 'ad' && <>
            <button onClick={() => bulk('down10')} className="rounded-md border border-line bg-surface px-2.5 py-1 hover:bg-sunken">Presupuesto −10%</button>
            <button onClick={() => bulk('up10')} className="rounded-md border border-line bg-surface px-2.5 py-1 hover:bg-sunken">+10%</button>
            <button onClick={() => bulk('up20')} className="rounded-md border border-line bg-surface px-2.5 py-1 hover:bg-sunken">+20%</button>
          </>}
          {level === 'ad' && <Link href={`/anuncios?tab=publicar&dup=${Array.from(selected).join(',')}`} className="rounded-md border border-line bg-surface px-2.5 py-1 hover:bg-sunken">Duplicar en otros ad sets</Link>}
          <button onClick={() => setSelected(new Set())} className="ml-auto text-mute hover:text-ink">Limpiar</button>
        </div>
      )}

      {/* Tabla */}
      <div className="rounded-panel border border-line bg-surface overflow-x-auto">
        <table className="w-full text-[13.5px] min-w-[880px]">
          <thead className="sticky top-0 bg-surface z-10">
            <tr className="text-mute text-left border-b border-line">
              <th className="w-9 pl-3">
                {canEdit && <input type="checkbox" aria-label="Seleccionar todo" checked={visible.length > 0 && visible.every((r) => selected.has(r.n.id))}
                  onChange={(e) => setSelected(e.target.checked ? new Set(visible.map((r) => r.n.id)) : new Set())} className="accent-[rgb(var(--f-ink))]" />}
              </th>
              <th className="font-medium py-2.5 pr-3"><button onClick={() => setSort({ key: 'name', dir: sort.key === 'name' ? (-sort.dir as 1 | -1) : 1 })} className="hover:text-ink">Nombre{sort.key === 'name' ? (sort.dir === 1 ? ' ↑' : ' ↓') : ''}</button></th>
              {level !== 'ad' && <th className="font-medium px-2 py-2.5 text-right whitespace-nowrap">Presupuesto/día</th>}
              {cols.map((c) => (
                <th key={c.key} className="font-medium px-2 py-2.5 text-right whitespace-nowrap last:pr-4" title={c.title}>
                  <button onClick={() => setSort({ key: c.key, dir: sort.key === c.key ? (-sort.dir as 1 | -1) : -1 })} className={`hover:text-ink ${sort.key === c.key ? 'text-ink' : ''}`}>{c.label}{sort.key === c.key ? (sort.dir === 1 ? ' ↑' : ' ↓') : ''}</button>
                </th>
              ))}
            </tr>
          </thead>
          <tbody className="divide-y divide-line">
            {visible.length === 0 && <tr><td colSpan={3 + cols.length} className="py-10 text-center text-mute">No hay {level === 'campaign' ? 'campañas' : level === 'adset' ? 'ad sets' : 'anuncios'} con este filtro en {period.label.toLowerCase()}.</td></tr>}
            {visible.map(({ n, campaign, adset }) => {
              const status = valueOf(n, 'status') as string
              const budget = valueOf(n, 'daily_budget') as number | null
              const inactiveParent = n.effectiveStatus && !['ACTIVE', 'PAUSED'].includes(n.effectiveStatus)
              return (
                <tr key={n.id} onClick={() => setOpenId(n.id)} className={`cursor-pointer ${openId === n.id ? 'bg-beacon/10' : 'hover:bg-sunken/70'}`}>
                  <td className="pl-3 w-9" onClick={(e) => e.stopPropagation()}>
                    {canEdit && <input type="checkbox" aria-label={`Seleccionar ${n.name}`} checked={selected.has(n.id)} onChange={(e) => { const s = new Set(selected); if (e.target.checked) s.add(n.id); else s.delete(n.id); setSelected(s) }} className="accent-[rgb(var(--f-ink))]" />}
                  </td>
                  <td className="py-2.5 pr-3 max-w-[360px]">
                    <div className="flex items-center gap-2.5">
                      <button
                        disabled={!canEdit || inactiveParent === true}
                        onClick={(e) => { e.stopPropagation(); stage(n, 'status', status === 'ACTIVE' ? 'PAUSED' : 'ACTIVE') }}
                        role="switch" aria-checked={status === 'ACTIVE'} aria-label={status === 'ACTIVE' ? 'Pausar' : 'Activar'}
                        title={inactiveParent ? `Estado en Meta: ${n.effectiveStatus}` : status === 'ACTIVE' ? 'Activo: tocar para pausar' : 'Pausado: tocar para activar'}
                        className={`relative w-8 h-[18px] rounded-full shrink-0 transition-colors ${status === 'ACTIVE' ? 'bg-good' : 'bg-line'} disabled:opacity-50`}
                      ><span className={`absolute top-[2px] w-[14px] h-[14px] rounded-full bg-surface shadow transition-all ${status === 'ACTIVE' ? 'left-[16px]' : 'left-[2px]'}`} /></button>
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      {n.level === 'ad' && (n.thumbnail ? <img src={n.thumbnail} alt="" className="w-9 h-9 rounded object-cover border border-line shrink-0" /> : <span className="w-9 h-9 rounded bg-sunken shrink-0" />)}
                      <div className="min-w-0">
                        <p className={`truncate text-ink ${pending.has(`${n.id}:name`) ? 'text-beacon-ink' : ''}`} title={n.name}>{valueOf(n, 'name') as string}</p>
                        <p className="truncate text-[12px] text-mute">
                          {n.level === 'campaign' ? (n.children.length ? `${n.children.length} ad sets` : (n.objective || '').replace('OUTCOME_', '').toLowerCase()) : n.level === 'adset' ? campaign : `${adset} · ${campaign}`}
                          {isProtected(n) && <span className="text-warn"> · protegido</span>}
                          {n.effectiveStatus && !['ACTIVE', 'PAUSED'].includes(n.effectiveStatus) && <span> · {n.effectiveStatus.replace(/_/g, ' ').toLowerCase()}</span>}
                        </p>
                      </div>
                    </div>
                  </td>
                  {level !== 'ad' && (
                    <td className="px-2 py-2 text-right num whitespace-nowrap">
                      {budget != null ? <><span className={pending.has(`${n.id}:daily_budget`) ? 'text-beacon-ink font-semibold' : ''}>{money(budget)}</span><Pacing spent={todaySpend[n.id] || 0} budget={budget} hourShare={hourShare} /></>
                        : <span className="text-faint">{n.level === 'adset' ? 'de campaña' : 'por ad set'}</span>}
                    </td>
                  )}
                  {cols.map((c) => { const v = c.val(n.m, n); return <td key={c.key} className={`px-2 py-2 text-right num whitespace-nowrap last:pr-4 ${c.tone?.(v) || ''}`}>{c.fmt(v, n)}</td> })}
                </tr>
              )
            })}
          </tbody>
          {visible.length > 1 && (
            <tfoot>
              <tr className="border-t border-line bg-sunken/60 font-medium">
                <td />
                <td className="py-2.5 pr-3 text-mute">Total de {visible.length}</td>
                {level !== 'ad' && <td />}
                {cols.map((c) => { const v = c.key === 'freq' || c.key === 'today' ? null : c.val(totalVisible, visible[0].n); return <td key={c.key} className="px-2 py-2.5 text-right num whitespace-nowrap last:pr-4">{v == null ? '' : c.fmt(v, visible[0].n)}</td> })}
              </tr>
            </tfoot>
          )}
        </table>
      </div>

      {results && (
        <div className="rounded-panel border border-line bg-surface px-5 py-3 text-[13.5px]">
          <p className="font-medium mb-1">Resultado</p>
          <ul className="flex flex-col gap-1">{results.map((r, i) => <li key={i} className={r.ok ? 'text-good' : 'text-bad'}>{r.ok ? 'Aplicado' : 'No se aplicó'}: <span className="text-ink">{r.name}</span>{r.error ? ` — ${r.error}` : ''}</li>)}</ul>
        </div>
      )}

      {open && (
        <DetailPanel
          row={open} period={period} maxCpa={maxCpa} canEdit={canEdit} protectedNow={isProtected(open.n)}
          todaySpend={todaySpend} hourShare={hourShare}
          budget={valueOf(open.n, 'daily_budget') as number | null}
          status={valueOf(open.n, 'status') as string}
          onClose={() => setOpenId(null)}
          onStage={(f, v) => stage(open.n, f, v)}
          onEdit={(kind) => setEditing({ node: open.n, kind })}
          onProtect={() => toggleProtect(open.n)}
          onOpen={(id) => { const r = byId.get(id); if (r) { setLevel(r.n.level); setOpenId(id) } }}
        />
      )}

      {pending.size > 0 && (
        <div className="fixed bottom-0 inset-x-0 lg:left-60 z-40 border-t border-line bg-surface shadow-[0_-8px_24px_rgb(0_0_0/0.08)]">
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
                <label className="flex items-center gap-2 text-[13px] text-warn"><input type="checkbox" checked={confirmProtected} onChange={(e) => setConfirmProtected(e.target.checked)} />Entiendo que estoy cambiando algo protegido</label>
              )}
              <div className="ml-auto flex gap-2">
                <button onClick={() => setPending(new Map())} className="rounded-lg px-3 py-2 text-[13.5px] text-mute hover:text-ink">Descartar</button>
                <button onClick={publish} disabled={publishing || (anyProtectedPending && !confirmProtected)} className="rounded-lg bg-ink text-surface px-4 py-2 text-[13.5px] font-semibold disabled:opacity-50">{publishing ? 'Publicando' : 'Publicar en Meta'}</button>
              </div>
            </div>
          </div>
        </div>
      )}

      {editing && <EditDialog editing={editing} onClose={() => setEditing(null)} onStage={(field, to, from) => { stage(editing.node, field, to, from); setEditing(null) }} />}
    </div>
  )
}

function DetailPanel({ row, period, maxCpa, canEdit, protectedNow, todaySpend, hourShare, budget, status, onClose, onStage, onEdit, onProtect, onOpen }: {
  row: Row; period: { from: string; to: string; label: string }; maxCpa: number | null; canEdit: boolean; protectedNow: boolean
  todaySpend: Record<string, number>; hourShare: number; budget: number | null; status: string
  onClose: () => void; onStage: (f: Field, v: unknown) => void; onEdit: (k: 'name' | 'targeting' | 'copy') => void; onProtect: () => void; onOpen: (id: string) => void
}) {
  const n = row.n, m = n.m
  const [days, setDays] = useState<DayPoint[] | null>(null)
  const [dup, setDup] = useState<string | null>(null)
  useEffect(() => {
    setDays(null)
    // Al menos 14 días para ver tendencia
    const to = period.to
    const d = new Date(`${to}T12:00:00Z`); d.setUTCDate(d.getUTCDate() - 13)
    const min = d.toISOString().slice(0, 10)
    const from = period.from < min ? period.from : min
    fetch(`/api/v2/meta/entity-daily?level=${n.level}&id=${n.id}&from=${from}&to=${to}`).then((r) => r.json()).then((j) => setDays((j.days || []).map((x: { date: string; spend: number; purchases: number; value: number }) => x))).catch(() => setDays([]))
  }, [n.id, n.level, period.from, period.to])
  useEffect(() => { const k = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose() }; window.addEventListener('keydown', k); return () => window.removeEventListener('keydown', k) }, [onClose])

  const cpa = div(m.spend, m.purchases)
  const t = (n.targeting || {}) as { age_min?: number; age_max?: number; genders?: number[]; geo_locations?: { countries?: string[]; cities?: unknown[] }; targeting_automation?: { advantage_audience?: number } }
  const stats: [string, React.ReactNode, string?][] = [
    ['Gasto', money(m.spend)], ['Compras', int(m.purchases)],
    ['Costo/compra', cpa != null ? money(cpa) : '—', cpa != null && maxCpa != null ? (cpa <= maxCpa ? 'text-good' : 'text-bad') : undefined],
    ['ROAS Meta', m.purchaseValue > 0 ? ratio(m.purchaseValue / m.spend) : '—'],
    ['Impresiones', int(m.impressions)], ['Alcance', int(m.reach)],
    ['CPM', money(div(m.spend * 1000, m.impressions))], ['CTR', pct(div(m.linkClicks, m.impressions), 2)],
    ['CPC', money(div(m.spend, m.linkClicks))], ['Costo/visita', money(div(m.spend, m.lpv))],
    ['Carrito/visita', pct(div(m.atc, m.lpv), 1)], ['Compra/visita', pct(div(m.purchases, m.lpv), 2)],
    ...(m.video3s > 0 ? [['Hook rate', pct(div(m.video3s, m.impressions))], ['Retención 50%', pct(div(m.videoP50, m.video3s))]] as [string, React.ReactNode][] : []),
    ...(n.frequency != null ? [['Frecuencia', n.frequency.toLocaleString('es-AR', { maximumFractionDigits: 1 }), n.frequency > 3 ? 'text-warn' : undefined]] as [string, React.ReactNode, string?][] : []),
  ]
  const kids = [...n.children].sort((a, b) => b.m.spend - a.m.spend).slice(0, 8)
  const adsUrl = `https://adsmanager.facebook.com/adsmanager/manage/${n.level === 'campaign' ? 'campaigns' : n.level === 'adset' ? 'adsets' : 'ads'}?act=${n.accountExternal.replace('act_', '')}&selected_${n.level === 'campaign' ? 'campaign' : n.level === 'adset' ? 'adset' : 'ad'}_ids=${n.id}`

  async function duplicateAdset() {
    setDup('Duplicando…')
    const r = await fetch('/api/v2/meta/duplicate', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ accountId: n.accountId, kind: 'adset', ids: [n.id] }) }).then((x) => x.json()).catch(() => ({}))
    setDup(r.ok ? 'Copia creada en pausa. Aparece en la próxima actualización.' : `No se pudo: ${r.results?.[0]?.error || r.error || 'error'}`)
  }

  return (
    <div className="fixed inset-0 z-30 flex justify-end" role="dialog" aria-modal="true" aria-label={n.name}>
      <button className="absolute inset-0 bg-ink/25" aria-label="Cerrar" onClick={onClose} />
      <aside className="relative h-full w-full sm:w-[460px] bg-surface border-l border-line shadow-2xl overflow-y-auto">
        <header className="sticky top-0 bg-surface border-b border-line px-5 py-4 z-10">
          <div className="flex items-start gap-3">
            <div className="min-w-0 flex-1">
              <p className="text-[12px] text-mute">{LEVEL[n.level]}{n.level !== 'campaign' && <> · {row.adset ? `${row.adset} · ` : ''}{row.campaign}</>}</p>
              <h2 className="text-[16px] font-semibold text-ink leading-snug break-words">{n.name}</h2>
              <div className="mt-1.5 flex flex-wrap gap-1.5">
                <Badge tone={status === 'ACTIVE' ? 'good' : undefined}>{status === 'ACTIVE' ? 'activo' : 'pausado'}</Badge>
                {protectedNow && <Badge tone="warn">protegido</Badge>}
                {n.effectiveStatus && !['ACTIVE', 'PAUSED'].includes(n.effectiveStatus) && <Badge>{n.effectiveStatus.replace(/_/g, ' ').toLowerCase()}</Badge>}
                {n.optimizationGoal && <Badge>{n.optimizationGoal.replace(/_/g, ' ').toLowerCase()}</Badge>}
              </div>
            </div>
            <button onClick={onClose} className="rounded-md p-1.5 text-mute hover:text-ink hover:bg-sunken" aria-label="Cerrar panel">✕</button>
          </div>
          {canEdit && (
            <div className="mt-3 flex flex-wrap gap-2 text-[13px]">
              <button onClick={() => onStage('status', status === 'ACTIVE' ? 'PAUSED' : 'ACTIVE')} className="rounded-md border border-line px-2.5 py-1 hover:bg-sunken">{status === 'ACTIVE' ? 'Pausar' : 'Activar'}</button>
              <button onClick={() => onEdit('name')} className="rounded-md border border-line px-2.5 py-1 hover:bg-sunken">Renombrar</button>
              {n.level === 'adset' && <button onClick={() => onEdit('targeting')} className="rounded-md border border-line px-2.5 py-1 hover:bg-sunken">Edad y género</button>}
              {n.level === 'ad' && <button onClick={() => onEdit('copy')} className="rounded-md border border-line px-2.5 py-1 hover:bg-sunken">Editar texto</button>}
              {n.level === 'adset' && <Link href={`/anuncios?tab=publicar&adset=${n.id}`} className="rounded-md border border-line px-2.5 py-1 hover:bg-sunken">Cargar anuncios acá</Link>}
              {n.level === 'adset' && <button onClick={duplicateAdset} className="rounded-md border border-line px-2.5 py-1 hover:bg-sunken">Duplicar ad set</button>}
              {n.level === 'ad' && <Link href={`/anuncios?tab=publicar&dup=${n.id}`} className="rounded-md border border-line px-2.5 py-1 hover:bg-sunken">Duplicar en otros ad sets</Link>}
              {n.level !== 'ad' && <button onClick={onProtect} className="rounded-md border border-line px-2.5 py-1 hover:bg-sunken">{protectedNow ? 'Quitar protección' : 'Proteger'}</button>}
              <a href={adsUrl} target="_blank" rel="noreferrer" className="rounded-md border border-line px-2.5 py-1 hover:bg-sunken">Ads Manager ↗</a>
            </div>
          )}
          {dup && <p className="mt-2 text-[12.5px] text-mute">{dup}</p>}
        </header>

        <div className="px-5 py-4 flex flex-col gap-5">
          {budget != null && (
            <section>
              <p className="text-[13px] text-mute flex items-center gap-1.5">Presupuesto diario <Explain>Los cambios quedan en la barra de abajo hasta que los publiques. Más de 20% de golpe puede reiniciar el aprendizaje.</Explain></p>
              <div className="mt-1.5 flex items-center gap-2 flex-wrap">
                <span className="num text-[22px] font-semibold text-ink">{money(budget)}</span>
                {canEdit && [-20, -10, 10, 20].map((p) => (
                  <button key={p} onClick={() => onStage('daily_budget', Math.round((budget || 0) * (1 + p / 100)))} className={`rounded-md border px-2 py-0.5 text-[12.5px] num ${Math.abs(p) > 15 ? 'border-warn/40' : 'border-line'} hover:bg-sunken`}>{p > 0 ? '+' : ''}{p}%</button>
                ))}
              </div>
              <div className="mt-1 max-w-[220px]"><Pacing spent={todaySpend[n.id] || 0} budget={budget} hourShare={hourShare} /></div>
            </section>
          )}

          <section>
            <div className="flex items-center justify-between text-[12.5px] text-mute mb-1"><span>Gasto por día · <span className="text-good">●</span> compras</span><span>últimos {days?.length || 0} días</span></div>
            {days == null ? <div className="h-[90px] rounded bg-sunken animate-pulse" /> : <DailyBars days={days} height={90} />}
          </section>

          <section>
            <p className="text-[13px] text-mute mb-2">{period.label}</p>
            <dl className="grid grid-cols-2 gap-x-6 gap-y-2 text-[13.5px]">
              {stats.map(([k, v, tone]) => <div key={k} className="flex justify-between gap-3 border-b border-line/60 pb-1.5"><dt className="text-mute">{k}</dt><dd className={`num ${tone || 'text-ink'}`}>{v}</dd></div>)}
            </dl>
          </section>

          {n.level === 'ad' && (
            <section className="flex flex-col gap-2">
              {n.image && <img src={n.image} alt="" className="w-full max-h-[420px] object-contain rounded-lg border border-line bg-sunken" />}
              {n.copy?.title && <p className="text-[14px] font-medium text-ink">{n.copy.title}</p>}
              {n.copy?.body && <p className="text-[13.5px] text-ink whitespace-pre-line">{n.copy.body}</p>}
            </section>
          )}

          {n.level === 'adset' && (
            <section className="text-[13.5px]">
              <p className="text-[13px] text-mute mb-1">Público</p>
              <p className="text-ink">
                {t.targeting_automation?.advantage_audience ? 'Público Advantage+ · ' : ''}
                {t.age_min || 18}–{t.age_max || 65} años · {t.genders?.length === 1 ? (t.genders[0] === 1 ? 'hombres' : 'mujeres') : 'todos los géneros'}
                {t.geo_locations?.countries?.length ? ` · ${t.geo_locations.countries.join(', ')}` : ''}
              </p>
            </section>
          )}

          {kids.length > 0 && (
            <section>
              <p className="text-[13px] text-mute mb-1.5">{n.level === 'campaign' ? 'Ad sets' : 'Anuncios'} por gasto</p>
              <ul className="divide-y divide-line border-y border-line">
                {kids.map((k) => {
                  const kc = div(k.m.spend, k.m.purchases)
                  return (
                    <li key={k.id}>
                      <button onClick={() => onOpen(k.id)} className="w-full flex items-center gap-2.5 py-2 text-left hover:bg-sunken/70">
                        {/* eslint-disable-next-line @next/next/no-img-element */}
                        {k.level === 'ad' && k.thumbnail && <img src={k.thumbnail} alt="" className="w-8 h-8 rounded object-cover border border-line" />}
                        <span className={`w-1.5 h-1.5 rounded-full shrink-0 ${k.effectiveStatus === 'ACTIVE' ? 'bg-good' : 'bg-line'}`} />
                        <span className="flex-1 min-w-0 truncate text-[13px] text-ink">{k.name}</span>
                        <span className="num text-[12.5px] text-mute">{money(k.m.spend)}</span>
                        <span className={`num text-[12.5px] w-20 text-right ${kc != null && maxCpa != null ? (kc <= maxCpa ? 'text-good' : 'text-bad') : 'text-faint'}`}>{kc != null ? money(kc) : '—'}</span>
                      </button>
                    </li>
                  )
                })}
              </ul>
            </section>
          )}
        </div>
      </aside>
    </div>
  )
}
