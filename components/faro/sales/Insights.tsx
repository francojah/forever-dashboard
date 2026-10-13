'use client'

import { useState } from 'react'
import { Panel, Empty } from '../ui'
import { money, int, pct } from '@/lib/faro/format'
import type { HeatCell, Cohort, Segment, ChannelLtv, Pair, Coverage, ProductAfterAds } from '@/lib/faro/insights'

const DOW = ['Dom', 'Lun', 'Mar', 'Mié', 'Jue', 'Vie', 'Sáb']

/** Mapa de calor día × hora de ventas netas. */
export function Heatmap({ cells, max, best, worst }: { cells: HeatCell[]; max: number; best: HeatCell | null; worst: HeatCell | null }) {
  const at = new Map(cells.map((c) => [`${c.dow}:${c.hour}`, c]))
  const [hover, setHover] = useState<HeatCell | null>(null)
  if (!cells.length) return <Empty title="Sin ventas en este período" />
  return (
    <div>
      <div className="overflow-x-auto">
        <div className="grid gap-px min-w-[640px]" style={{ gridTemplateColumns: '40px repeat(24, minmax(0, 1fr))' }} role="img" aria-label="Ventas por día de la semana y hora">
          <div />
          {Array.from({ length: 24 }, (_, h) => <div key={h} className="text-[10.5px] text-faint text-center num">{h % 3 === 0 ? `${h}h` : ''}</div>)}
          {[1, 2, 3, 4, 5, 6, 0].map((d) => (
            <div key={d} className="contents">
              <div className="text-[12px] text-mute pr-1 flex items-center">{DOW[d]}</div>
              {Array.from({ length: 24 }, (_, h) => {
                const c = at.get(`${d}:${h}`)
                const a = c ? 0.12 + (c.net / max) * 0.88 : 0
                return <div key={h} onMouseEnter={() => setHover(c || null)} onMouseLeave={() => setHover(null)} className="h-6 rounded-[3px] bg-sunken" style={c ? { background: `rgb(var(--f-ink) / ${a.toFixed(2)})` } : undefined} title={c ? `${DOW[d]} ${h}h: ${money(c.net)} · ${c.orders} órdenes` : ''} />
              })}
            </div>
          ))}
        </div>
      </div>
      <p className="mt-2 text-[12.5px] text-mute h-5">
        {hover ? `${DOW[hover.dow]} a las ${hover.hour}h: ${money(hover.net)} en ${int(hover.orders)} órdenes` : best ? `Mejor franja: ${DOW[best.dow]} ${best.hour}h (${money(best.net)}).${worst ? ` Peor: ${DOW[worst.dow]} ${worst.hour}h.` : ''} Útil para programar lanzamientos, historias y subas de presupuesto.` : ''}
      </p>
    </div>
  )
}

/** Cohortes: de los clientes nuevos de cada mes, qué % volvió a comprar. */
export function Cohorts({ rows }: { rows: Cohort[] }) {
  const show = rows.filter((r) => r.customers >= 5).slice(-9)
  if (!show.length) return <Empty title="Todavía no hay suficientes clientes por mes" />
  const n = show[0].back.length
  return (
    <div className="overflow-x-auto">
      <table className="w-full text-[13px] min-w-[560px]">
        <thead><tr className="text-mute text-left border-b border-line"><th className="font-medium py-1.5 pr-2">Primera compra</th><th className="font-medium py-1.5 text-right pr-3">Clientes</th>{Array.from({ length: n }, (_, i) => <th key={i} className="font-medium py-1.5 text-center">+{i + 1} mes{i ? 'es' : ''}</th>)}</tr></thead>
        <tbody className="divide-y divide-line">
          {show.map((r) => (
            <tr key={r.month}>
              <td className="py-1.5 pr-2 text-ink">{r.month.slice(5)}/{r.month.slice(2, 4)}</td>
              <td className="py-1.5 text-right pr-3 num">{int(r.customers)}</td>
              {r.back.map((v, i) => {
                const future = i + 1 > monthsSince(r.month)
                return <td key={i} className="py-1 px-0.5"><div className={`rounded-[3px] py-1 text-center num ${future ? 'text-faint' : 'text-ink'}`} style={future ? undefined : { background: `rgb(var(--f-good) / ${(0.08 + Math.min(1, v / 0.3) * 0.6).toFixed(2)})` }}>{future ? '·' : pct(v, 0)}</div></td>
              })}
            </tr>
          ))}
        </tbody>
      </table>
      <p className="mt-2 text-[12.5px] text-mute">Cada celda: % de esa camada que volvió a comprar dentro de esos meses (acumulado). Si la columna +2 meses mejora mes a mes, la retención está funcionando.</p>
    </div>
  )
}
function monthsSince(m: string) { const now = new Date(); return (now.getUTCFullYear() - Number(m.slice(0, 4))) * 12 + (now.getUTCMonth() + 1 - Number(m.slice(5, 7))) }

/** Segmentos con exportar CSV y crear público en Meta. */
export function Segments({ list, accounts, canEdit }: { list: Segment[]; accounts: { id: string; name: string }[]; canEdit: boolean }) {
  const [msg, setMsg] = useState<Record<string, string>>({})
  const [busy, setBusy] = useState<string | null>(null)
  async function toMeta(key: string, accountId: string) {
    setBusy(key); setMsg({ ...msg, [key]: '' })
    const r = await fetch('/api/v2/segments', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ key, accountId }) })
    const j = await r.json().catch(() => ({}))
    setBusy(null)
    setMsg({ ...msg, [key]: r.ok ? `Público "${j.name}" creado en Meta con ${j.people} personas. Puede tardar unas horas en estar disponible.` : j.error || 'No se pudo crear' })
  }
  return (
    <ul className="divide-y divide-line">
      {list.map((s) => (
        <li key={s.key} className="py-3 flex flex-wrap items-start gap-x-4 gap-y-1.5 text-[13.5px]">
          <div className="min-w-0 flex-1">
            <p className="text-ink font-medium">{s.label} <span className="num text-mute">· {int(s.customers.length)}</span></p>
            <p className="text-mute">{s.why}</p>
            {msg[s.key] && <p className="text-[12.5px] text-ink mt-1">{msg[s.key]}</p>}
          </div>
          <div className="flex flex-wrap gap-2">
            <a href={`/api/v2/segments?key=${s.key}`} className="rounded-md border border-line px-2.5 py-1 text-[12.5px] hover:bg-sunken">Descargar CSV</a>
            {canEdit && accounts.map((a) => <button key={a.id} disabled={busy === s.key || s.customers.length < 100} title={s.customers.length < 100 ? 'Meta pide al menos 100 personas' : ''} onClick={() => toMeta(s.key, a.id)} className="rounded-md border border-line px-2.5 py-1 text-[12.5px] hover:bg-sunken disabled:opacity-50">{busy === s.key ? 'Creando…' : `Crear público en ${accounts.length > 1 ? a.name : 'Meta'}`}</button>)}
          </div>
        </li>
      ))}
    </ul>
  )
}

export function LtvChannels({ rows }: { rows: ChannelLtv[] }) {
  if (!rows.length) return <Empty title="Faltan clientes con 90 días de historia" />
  return (
    <table className="w-full text-[13.5px]">
      <thead><tr className="text-mute text-left border-b border-line"><th className="font-medium py-1.5">Origen de la primera compra</th><th className="font-medium py-1.5 text-right">Clientes</th><th className="font-medium py-1.5 text-right">1ª compra</th><th className="font-medium py-1.5 text-right">A 90 días</th><th className="font-medium py-1.5 text-right">Volvieron</th></tr></thead>
      <tbody className="divide-y divide-line">
        {rows.map((r) => <tr key={r.channel}><td className="py-1.5 text-ink">{r.channel}</td><td className="py-1.5 text-right num">{int(r.customers)}</td><td className="py-1.5 text-right num">{money(r.first)}</td><td className="py-1.5 text-right num text-ink font-medium">{money(r.ltv90)}</td><td className="py-1.5 text-right num">{pct(r.repeat, 0)}</td></tr>)}
      </tbody>
    </table>
  )
}

export function Basket({ pairs }: { pairs: Pair[] }) {
  if (!pairs.length) return <Empty title="Todavía no hay combinaciones repetidas" />
  return (
    <ul className="divide-y divide-line text-[13.5px]">
      {pairs.map((p) => <li key={`${p.a}|${p.b}`} className="py-2 flex items-baseline justify-between gap-3"><span className="text-ink min-w-0 truncate">{p.a} <span className="text-faint">+</span> {p.b}</span><span className="num text-mute shrink-0">{int(p.together)} órdenes · {pct(p.share, 0)} de las veces</span></li>)}
    </ul>
  )
}

export function CoverageTable({ rows }: { rows: Coverage[] }) {
  if (!rows.length) return <Empty title="Tiendanube no informa stock por variante, o no hubo ventas" />
  return (
    <div className="overflow-x-auto">
      <table className="w-full text-[13.5px] min-w-[640px]">
        <thead><tr className="text-mute text-left border-b border-line"><th className="font-medium py-1.5">Producto</th><th className="font-medium py-1.5">Variante</th><th className="font-medium py-1.5 text-right">Stock</th><th className="font-medium py-1.5 text-right">Vende/día</th><th className="font-medium py-1.5 text-right">Días de stock</th><th className="font-medium py-1.5 text-right">Reponer para 30 días</th></tr></thead>
        <tbody className="divide-y divide-line">
          {rows.slice(0, 40).map((r) => (
            <tr key={`${r.product}|${r.variant}`}>
              <td className="py-1.5 text-ink max-w-[260px] truncate">{r.product}</td><td className="py-1.5 text-mute">{r.variant || '—'}</td>
              <td className="py-1.5 text-right num">{int(r.stock)}</td><td className="py-1.5 text-right num">{r.perDay.toLocaleString('es-AR', { maximumFractionDigits: 1 })}</td>
              <td className={`py-1.5 text-right num ${r.days != null && r.days < 7 ? 'text-bad font-medium' : r.days != null && r.days < 14 ? 'text-warn' : ''}`}>{r.days == null ? '∞' : int(Math.round(r.days))}</td>
              <td className={`py-1.5 text-right num ${r.suggest > 0 ? 'text-ink font-medium' : 'text-faint'}`}>{r.suggest > 0 ? int(r.suggest) : '—'}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}

export function AfterAdsTable({ rows }: { rows: ProductAfterAds[]; }) {
  if (!rows.length) return <Empty title="Sin ventas en este período" />
  return (
    <div className="overflow-x-auto">
      <table className="w-full text-[13.5px] min-w-[640px]">
        <thead><tr className="text-mute text-left border-b border-line"><th className="font-medium py-1.5">Producto</th><th className="font-medium py-1.5 text-right">Unidades</th><th className="font-medium py-1.5 text-right">Ventas netas</th><th className="font-medium py-1.5 text-right">Contribución</th><th className="font-medium py-1.5 text-right">Publicidad asignada</th><th className="font-medium py-1.5 text-right">Después de publicidad</th></tr></thead>
        <tbody className="divide-y divide-line">
          {rows.slice(0, 25).map((r) => (
            <tr key={r.name}><td className="py-1.5 text-ink max-w-[280px] truncate">{r.name}</td><td className="py-1.5 text-right num">{int(r.units)}</td><td className="py-1.5 text-right num">{money(r.net)}</td><td className="py-1.5 text-right num">{money(r.contribution)}</td><td className="py-1.5 text-right num text-mute">{money(r.adSpend)}</td><td className={`py-1.5 text-right num font-medium ${r.afterAds < 0 ? 'text-bad' : 'text-ink'}`}>{money(r.afterAds)} <span className="text-faint font-normal">{pct(r.marginAfter, 0)}</span></td></tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}

export { Panel }
