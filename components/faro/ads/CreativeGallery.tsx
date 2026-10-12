'use client'

import { useMemo, useState } from 'react'
import Link from 'next/link'
import type { TreeNode } from '@/lib/faro/adsTree'
import { money, int, ratio, pct } from '@/lib/faro/format'
import { Badge, Empty } from '../ui'
import type { Fatigue } from '@/lib/faro/fatigue'

export interface CreativeCard {
  id: string
  name: string
  adset: string
  adsetId: string | null
  campaign: string
  active: boolean
  image: string | null
  isVideo: boolean
  body: string | null
  m: TreeNode['m']
}

type Sort = 'spend' | 'cpa' | 'roas' | 'hook' | 'ctr' | 'purchases' | 'fatiga'
const SORTS: { key: Sort; label: string }[] = [
  { key: 'spend', label: 'Gasto' }, { key: 'purchases', label: 'Compras' }, { key: 'cpa', label: 'Costo por compra' },
  { key: 'roas', label: 'ROAS' }, { key: 'ctr', label: 'CTR' }, { key: 'hook', label: 'Hook rate' }, { key: 'fatiga', label: 'Fatiga primero' },
]
const div = (a: number, b: number) => (b > 0 ? a / b : null)

/** Veredicto simple por creativo, contra el costo por compra máximo rentable. */
function verdict(c: CreativeCard, maxCpa: number | null): { label: string; tone: 'good' | 'bad' | 'warn' | undefined; why: string } | null {
  const cpa = div(c.m.spend, c.m.purchases)
  if (!maxCpa) return null
  if (c.m.spend < maxCpa * 0.5) return { label: 'pocos datos', tone: undefined, why: `Gastó menos de la mitad de un costo por compra máximo (${money(maxCpa)}): todavía no se puede juzgar.` }
  if (c.m.purchases === 0) return { label: 'gastó sin vender', tone: 'bad', why: `Gastó ${money(c.m.spend)} sin compras atribuidas.` }
  if (cpa! <= maxCpa * 0.7 && c.m.purchases >= 3) return { label: 'ganador', tone: 'good', why: `Costo por compra ${money(cpa)}, ${Math.round((1 - cpa! / maxCpa) * 100)}% debajo del máximo, con ${c.m.purchases} compras.` }
  if (cpa! <= maxCpa) return { label: 'rentable', tone: 'good', why: `Costo por compra ${money(cpa)} dentro del máximo ${money(maxCpa)}.` }
  return { label: 'caro', tone: 'warn', why: `Costo por compra ${money(cpa)} sobre el máximo ${money(maxCpa)}.` }
}

function Spark({ values }: { values: (number | null)[] }) {
  const v = values.map((x) => x ?? 0)
  const max = Math.max(...v, 0.0001)
  const pts = v.map((x, i) => `${(i / (v.length - 1)) * 100},${24 - (x / max) * 22}`).join(' ')
  return <svg viewBox="0 0 100 26" className="w-20 h-5" aria-hidden><polyline points={pts} fill="none" className="stroke-[rgb(var(--f-bad))]" strokeWidth={1.8} /></svg>
}

export interface Tags { angulo?: string | null; formato?: string | null; producto?: string | null }
type Dim = 'angulo' | 'formato' | 'producto'
const DIM: Record<Dim, string> = { angulo: 'Ángulo', formato: 'Formato', producto: 'Producto' }
const tagOf = (c: CreativeCard, t: Tags | undefined, d: Dim) => (t?.[d] || (d === 'formato' ? (c.isVideo ? 'Video' : 'Imagen') : null))

/** Una etiqueta editable: tocar para escribir o elegir una existente. */
function TagChip({ dim, value, auto, options, canEdit, onSave }: { dim: Dim; value: string | null; auto?: string | null; options: string[]; canEdit: boolean; onSave: (v: string) => void }) {
  const [editing, setEditing] = useState(false)
  const [v, setV] = useState(value || '')
  const id = `dl-${dim}`
  if (editing) return (
    <span className="inline-flex">
      <input autoFocus list={id} value={v} onChange={(e) => setV(e.target.value)} placeholder={DIM[dim]}
        onBlur={() => { setEditing(false); if ((v || '') !== (value || '')) onSave(v) }} onKeyDown={(e) => { if (e.key === 'Enter') (e.target as HTMLInputElement).blur(); if (e.key === 'Escape') { setV(value || ''); setEditing(false) } }}
        className="w-28 rounded border border-beacon bg-surface px-1.5 py-0.5 text-[11.5px]" />
      <datalist id={id}>{options.map((o) => <option key={o} value={o} />)}</datalist>
    </span>
  )
  const shown = value || auto
  return (
    <button type="button" disabled={!canEdit} onClick={() => setEditing(true)} title={`${DIM[dim]}${canEdit ? ' · tocá para cambiar' : ''}`}
      className={`rounded-full border px-2 py-0.5 text-[11.5px] ${value ? 'border-line bg-sunken text-ink' : shown ? 'border-dashed border-line text-mute' : 'border-dashed border-line text-faint'}`}>
      {shown || `+ ${DIM[dim].toLowerCase()}`}
    </button>
  )
}

export default function CreativeGallery({ cards, maxCpa, periodLabel, fatigue = {}, initialTags = {}, canEdit = false, sales = null, attr = null }: { cards: CreativeCard[]; maxCpa: number | null; periodLabel: string; fatigue?: Record<string, Fatigue>; initialTags?: Record<string, Tags>; canEdit?: boolean; sales?: Record<string, { orders: number; revenue: number }> | null; attr?: AttrInfo | null }) {
  const [sort, setSort] = useState<Sort>('spend')
  const [tags, setTags] = useState<Record<string, Tags>>(initialTags)
  const [mode, setMode] = useState<'grilla' | 'etiquetas'>('grilla')
  const [dim, setDim] = useState<Dim>('angulo')
  const [tagErr, setTagErr] = useState<string | null>(null)
  const options = useMemo(() => {
    const o: Record<Dim, Set<string>> = { angulo: new Set(), formato: new Set(['Video', 'Imagen', 'UGC', 'Estudio', 'Carrusel']), producto: new Set() }
    Object.values(tags).forEach((t) => (Object.keys(o) as Dim[]).forEach((d) => { if (t[d]) o[d].add(t[d]!) }))
    return { angulo: Array.from(o.angulo), formato: Array.from(o.formato), producto: Array.from(o.producto) }
  }, [tags])
  async function saveTag(adId: string, d: Dim, value: string) {
    const next = { ...tags[adId], [d]: value.trim() || null }
    setTags((t) => ({ ...t, [adId]: next }))
    const r = await fetch('/api/v2/meta/tags', { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ ad_id: adId, ...next }) }).then((x) => x.json()).catch(() => ({ error: 'Sin conexión' }))
    setTagErr(r.ok ? null : r.error || 'No se pudo guardar la etiqueta')
  }
  const [onlyActive, setOnlyActive] = useState(true)
  const [minSpend, setMinSpend] = useState(true)

  const list = useMemo(() => {
    const val = (c: CreativeCard): number => {
      const m = c.m
      if (sort === 'spend') return m.spend
      if (sort === 'purchases') return m.purchases
      if (sort === 'cpa') return -(div(m.spend, m.purchases) ?? Infinity)
      if (sort === 'roas') return div(m.purchaseValue, m.spend) ?? -1
      if (sort === 'ctr') return div(m.linkClicks, m.impressions) ?? -1
      if (sort === 'fatiga') return fatigue[c.id] ? (fatigue[c.id].status === 'fatiga' ? 2e12 : 1e12) + m.spend : m.spend
      return c.isVideo ? div(m.video3s, m.impressions) ?? -1 : -1
    }
    return cards
      .filter((c) => (!onlyActive || c.active) && (!minSpend || c.m.spend > 0))
      .sort((a, b) => val(b) - val(a))
  }, [cards, sort, onlyActive, minSpend, fatigue])

  const totals = useMemo(() => {
    const s = list.reduce((a, c) => ({ spend: a.spend + c.m.spend, purchases: a.purchases + c.m.purchases }), { spend: 0, purchases: 0 })
    const winners = list.filter((c) => verdict(c, maxCpa)?.label === 'ganador').length
    const losers = list.filter((c) => verdict(c, maxCpa)?.label === 'gastó sin vender')
    return { ...s, winners, wasted: losers.reduce((a, c) => a + c.m.spend, 0), losers: losers.length }
  }, [list, maxCpa])

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center gap-3 text-[13.5px]">
        <div className="inline-flex rounded-lg border border-line bg-surface p-0.5">
          {([['grilla', 'Creativos'], ['etiquetas', 'Por etiqueta']] as const).map(([k, l]) => <button key={k} onClick={() => setMode(k)} className={`rounded-md px-3 py-1 ${mode === k ? 'bg-ink text-bg font-medium' : 'text-mute hover:text-ink'}`}>{l}</button>)}
        </div>
        <label className="flex items-center gap-2">Ordenar por
          <select value={sort} onChange={(e) => setSort(e.target.value as Sort)} className="rounded-lg border border-line bg-surface px-2.5 py-1.5">
            {SORTS.map((s) => <option key={s.key} value={s.key}>{s.label}</option>)}
          </select>
        </label>
        <label className="flex items-center gap-2 text-mute"><input type="checkbox" checked={onlyActive} onChange={(e) => setOnlyActive(e.target.checked)} className="accent-[rgb(var(--f-ink))]" /> Solo activos</label>
        <label className="flex items-center gap-2 text-mute"><input type="checkbox" checked={minSpend} onChange={(e) => setMinSpend(e.target.checked)} className="accent-[rgb(var(--f-ink))]" /> Solo con gasto</label>
        <span className="ml-auto text-mute">
          {list.length} creativos · {money(totals.spend)} · {int(totals.purchases)} compras
          {totals.winners > 0 && <> · <span className="text-good">{totals.winners} ganadores</span></>}
          {totals.losers > 0 && <> · <span className="text-bad">{totals.losers} gastaron {money(totals.wasted)} sin vender</span></>}
          {list.filter((c) => fatigue[c.id]).length > 0 && <> · <button onClick={() => setSort('fatiga')} className="text-warn underline">{list.filter((c) => fatigue[c.id]).length} se están cansando</button></>}
        </span>
      </div>

      {attr && <AttributionNote attr={attr} canEdit={canEdit} />}
      {tagErr && <p className="text-[12.5px] text-bad">{tagErr}</p>}
      {mode === 'etiquetas' ? <TagReport list={list} tags={tags} dim={dim} setDim={setDim} maxCpa={maxCpa} /> : list.length === 0 ? <Empty title={`Sin creativos con gasto en ${periodLabel.toLowerCase()}`} /> : (
        <ul className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
          {list.map((c) => {
            const m = c.m
            const cpa = div(m.spend, m.purchases)
            const v = verdict(c, maxCpa)
            const hook = c.isVideo ? div(m.video3s, m.impressions) : null
            const hold = c.isVideo ? div(m.videoP50, m.video3s) : null
            const stats: [string, string, string?][] = [
              ['Gasto', money(m.spend)],
              ['Compras', int(m.purchases)],
              ['Costo/compra', cpa != null ? money(cpa) : '—', cpa != null && maxCpa != null ? (cpa <= maxCpa ? 'text-good' : 'text-bad') : undefined],
              ['ROAS', m.purchaseValue > 0 ? ratio(m.purchaseValue / m.spend) : '—'],
              ...(sales ? [['Ventas Tiendanube', sales[c.id] ? `${int(sales[c.id].orders)} · ${money(sales[c.id].revenue)}` : '—'], ['ROAS real', sales[c.id] && m.spend > 0 ? ratio(sales[c.id].revenue / m.spend) : '—']] as [string, string, string?][] : []),
              ['CTR', pct(div(m.linkClicks, m.impressions), 2)],
              ['CPC', money(div(m.spend, m.linkClicks))],
              ...(c.isVideo ? [['Hook rate', pct(hook), hook != null ? (hook >= 0.25 ? 'text-good' : hook < 0.15 ? 'text-bad' : undefined) : undefined], ['Retención 50%', pct(hold)]] as [string, string, string?][] : [['Carrito/visita', pct(div(m.atc, m.lpv), 1)], ['Visitas web', int(m.lpv)]] as [string, string, string?][]),
            ]
            return (
              <li key={c.id} className="rounded-panel border border-line bg-surface overflow-hidden flex flex-col">
                <div className="relative aspect-square bg-sunken">
                  {c.image
                    // eslint-disable-next-line @next/next/no-img-element
                    ? <img src={c.image} alt="" loading="lazy" className="absolute inset-0 w-full h-full object-cover" />
                    : <div className="absolute inset-0 grid place-items-center text-faint text-[13px]">Sin vista previa</div>}
                  <div className="absolute top-2 left-2 flex gap-1">
                    {c.isVideo && <span className="rounded bg-black/60 text-white text-[11px] px-1.5 py-0.5">video</span>}
                    {!c.active && <span className="rounded bg-black/60 text-white text-[11px] px-1.5 py-0.5">pausado</span>}
                  </div>
                  <div className="absolute top-2 right-2 flex flex-col items-end gap-1">
                    {v && <span title={v.why}><Badge tone={v.tone}>{v.label}</Badge></span>}
                    {fatigue[c.id] && <span title={`Últimos 7 días contra los 7 anteriores: ${fatigue[c.id].reasons.join(', ')}`}><Badge tone={fatigue[c.id].status === 'fatiga' ? 'bad' : 'warn'}>{fatigue[c.id].status === 'fatiga' ? 'fatiga' : 'cayendo'}</Badge></span>}
                  </div>
                </div>
                <div className="p-3 flex flex-col gap-2 flex-1">
                  <div>
                    <p className="text-[13.5px] font-medium text-ink truncate" title={c.name}>{c.name}</p>
                    <p className="text-[12px] text-mute truncate" title={`${c.campaign} › ${c.adset}`}>{c.campaign} › {c.adset}</p>
                  </div>
                  <dl className="grid grid-cols-2 gap-x-3 gap-y-1 text-[12.5px]">
                    {stats.map(([k, val, tone]) => (
                      <div key={k} className="flex justify-between gap-2"><dt className="text-mute">{k}</dt><dd className={`num ${tone || 'text-ink'}`}>{val}</dd></div>
                    ))}
                  </dl>
                  {fatigue[c.id] && (
                    <div className="flex items-center justify-between gap-2 rounded-md bg-warn/10 px-2 py-1 text-[12px] text-ink">
                      <span>{fatigue[c.id].reasons.join(' · ')}</span>
                      <span title="CTR por día, últimos 14 días"><Spark values={fatigue[c.id].ctrSeries} /></span>
                    </div>
                  )}
                  {c.body && <p className="text-[12px] text-mute line-clamp-2" title={c.body}>{c.body}</p>}
                  <div className="flex flex-wrap gap-1">
                    {(['angulo', 'formato', 'producto'] as Dim[]).map((d) => (
                      <TagChip key={d} dim={d} value={tags[c.id]?.[d] || null} auto={d === 'formato' ? (c.isVideo ? 'Video' : 'Imagen') : null} options={options[d]} canEdit={canEdit} onSave={(v) => saveTag(c.id, d, v)} />
                    ))}
                  </div>
                  {c.adsetId && <Link href={`/anuncios?tab=campanias&focus=${c.adsetId}`} className="mt-auto text-[12.5px] text-mute hover:text-ink underline-offset-2 hover:underline">Ver en la tabla</Link>}
                </div>
              </li>
            )
          })}
        </ul>
      )}
    </div>
  )
}

function TagReport({ list, tags, dim, setDim, maxCpa }: { list: CreativeCard[]; tags: Record<string, Tags>; dim: Dim; setDim: (d: Dim) => void; maxCpa: number | null }) {
  const groups = new Map<string, { n: number; spend: number; purchases: number; value: number; imp: number; clk: number; v3: number }>()
  for (const c of list) {
    const k = tagOf(c, tags[c.id], dim) || 'Sin etiqueta'
    const g = groups.get(k) || { n: 0, spend: 0, purchases: 0, value: 0, imp: 0, clk: 0, v3: 0 }
    g.n++; g.spend += c.m.spend; g.purchases += c.m.purchases; g.value += c.m.purchaseValue; g.imp += c.m.impressions; g.clk += c.m.linkClicks; g.v3 += c.m.video3s
    groups.set(k, g)
  }
  const rows = Array.from(groups.entries()).sort((a, b) => b[1].spend - a[1].spend)
  const tagged = list.filter((c) => tags[c.id]?.[dim]).length
  return (
    <div className="rounded-panel border border-line bg-surface">
      <div className="flex flex-wrap items-center gap-2 px-4 py-3 border-b border-line text-[13.5px]">
        <span className="text-mute">Agrupar por</span>
        {(['angulo', 'formato', 'producto'] as Dim[]).map((d) => <button key={d} onClick={() => setDim(d)} className={`rounded-md px-2.5 py-1 ${dim === d ? 'bg-ink text-bg' : 'border border-line text-mute hover:text-ink'}`}>{DIM[d]}</button>)}
        <span className="ml-auto text-[12.5px] text-mute">{tagged} de {list.length} creativos con {DIM[dim].toLowerCase()} cargado{dim === 'formato' ? ' (el resto toma Video o Imagen)' : ''}</span>
      </div>
      <div className="overflow-x-auto">
        <table className="w-full text-[13.5px] min-w-[640px]">
          <thead><tr className="text-mute text-left border-b border-line">
            <th className="font-medium px-4 py-2">{DIM[dim]}</th><th className="font-medium px-2 py-2 text-right">Creativos</th><th className="font-medium px-2 py-2 text-right">Gasto</th>
            <th className="font-medium px-2 py-2 text-right">Compras</th><th className="font-medium px-2 py-2 text-right">Costo/compra</th><th className="font-medium px-2 py-2 text-right">ROAS</th><th className="font-medium px-4 py-2 text-right">CTR</th>
          </tr></thead>
          <tbody className="divide-y divide-line">
            {rows.map(([k, g]) => {
              const cpa = g.purchases > 0 ? g.spend / g.purchases : null
              return (
                <tr key={k}>
                  <td className={`px-4 py-2 ${k === 'Sin etiqueta' ? 'text-faint' : 'text-ink'}`}>{k}</td>
                  <td className="px-2 py-2 text-right num">{g.n}</td>
                  <td className="px-2 py-2 text-right num">{money(g.spend)}</td>
                  <td className="px-2 py-2 text-right num">{int(g.purchases)}</td>
                  <td className={`px-2 py-2 text-right num ${cpa != null && maxCpa != null ? (cpa <= maxCpa ? 'text-good' : 'text-bad') : 'text-mute'}`}>{cpa != null ? money(cpa) : '—'}</td>
                  <td className="px-2 py-2 text-right num">{g.value > 0 && g.spend > 0 ? ratio(g.value / g.spend) : '—'}</td>
                  <td className="px-4 py-2 text-right num">{pct(g.imp > 0 ? g.clk / g.imp : null, 2)}</td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>
      {tagged === 0 && dim !== 'formato' && <p className="px-4 py-3 text-[12.5px] text-mute border-t border-line">Cargá el {DIM[dim].toLowerCase()} de cada creativo desde la vista Creativos (las etiquetas debajo de cada uno) para ver qué funciona mejor.</p>}
    </div>
  )
}

export interface AttrInfo { totalOrders: number; withLanding: number; fromMeta: number; matched: number; missing: boolean }

/** Cuántas ventas de Tiendanube se pudieron cruzar con un anuncio, y botón para traer el origen de pedidos viejos. */
function AttributionNote({ attr, canEdit }: { attr: AttrInfo; canEdit: boolean }) {
  const [busy, setBusy] = useState(false)
  const [msg, setMsg] = useState<string | null>(null)
  async function backfill() {
    setBusy(true); setMsg(null)
    try {
      const r = await fetch('/api/v2/attribution', { method: 'POST' })
      const j = await r.json()
      if (!r.ok) throw new Error(j.error || 'No se pudo')
      setMsg(`Listo: ${j.withLanding} de ${j.orders} pedidos con origen.${j.done ? '' : ' Faltan más: tocá de nuevo.'} Recargá la página para verlo.`)
    } catch (e) { setMsg((e as Error).message) } finally { setBusy(false) }
  }
  if (attr.missing) return <p className="rounded-lg border border-warn/40 bg-warn/5 px-3 py-2 text-[13px] text-ink">Para ver ventas reales de Tiendanube por anuncio falta correr la migración 20261013_order_attribution.sql en Supabase.</p>
  const share = attr.totalOrders > 0 ? attr.matched / attr.totalOrders : 0
  return (
    <div className="rounded-lg border border-line bg-surface px-3 py-2 text-[13px] flex flex-wrap items-center gap-x-3 gap-y-1">
      <span className="text-ink font-medium">Ventas reales por anuncio (Tiendanube)</span>
      <span className="text-mute">{attr.matched} de {attr.totalOrders} pedidos cruzados con un anuncio ({Math.round(share * 100)}%) · {attr.fromMeta} vinieron de Meta · {attr.withLanding} con origen guardado.</span>
      <span className="text-mute">Se cruza por las UTMs del link: los anuncios cargados desde Faro las llevan; los demás necesitan <code className="text-[12px]">utm_content={'{{ad.name}}'}</code> o <code className="text-[12px]">utm_term={'{{ad.id}}'}</code>.</span>
      {canEdit && <button disabled={busy} onClick={backfill} className="ml-auto rounded-md border border-line px-2.5 py-1 hover:bg-sunken disabled:opacity-50">{busy ? 'Trayendo…' : 'Traer origen de los últimos 60 días'}</button>}
      {msg && <span className="basis-full text-mute">{msg}</span>}
    </div>
  )
}
