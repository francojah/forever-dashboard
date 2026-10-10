'use client'

import { useMemo, useState } from 'react'
import Link from 'next/link'
import type { TreeNode } from '@/lib/faro/adsTree'
import { money, int, ratio, pct } from '@/lib/faro/format'
import { Badge, Empty } from '../ui'

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

type Sort = 'spend' | 'cpa' | 'roas' | 'hook' | 'ctr' | 'purchases'
const SORTS: { key: Sort; label: string }[] = [
  { key: 'spend', label: 'Gasto' }, { key: 'purchases', label: 'Compras' }, { key: 'cpa', label: 'Costo por compra' },
  { key: 'roas', label: 'ROAS' }, { key: 'ctr', label: 'CTR' }, { key: 'hook', label: 'Hook rate' },
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

export default function CreativeGallery({ cards, maxCpa, periodLabel }: { cards: CreativeCard[]; maxCpa: number | null; periodLabel: string }) {
  const [sort, setSort] = useState<Sort>('spend')
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
      return c.isVideo ? div(m.video3s, m.impressions) ?? -1 : -1
    }
    return cards
      .filter((c) => (!onlyActive || c.active) && (!minSpend || c.m.spend > 0))
      .sort((a, b) => val(b) - val(a))
  }, [cards, sort, onlyActive, minSpend])

  const totals = useMemo(() => {
    const s = list.reduce((a, c) => ({ spend: a.spend + c.m.spend, purchases: a.purchases + c.m.purchases }), { spend: 0, purchases: 0 })
    const winners = list.filter((c) => verdict(c, maxCpa)?.label === 'ganador').length
    const losers = list.filter((c) => verdict(c, maxCpa)?.label === 'gastó sin vender')
    return { ...s, winners, wasted: losers.reduce((a, c) => a + c.m.spend, 0), losers: losers.length }
  }, [list, maxCpa])

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center gap-3 text-[13.5px]">
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
        </span>
      </div>

      {list.length === 0 ? <Empty title={`Sin creativos con gasto en ${periodLabel.toLowerCase()}`} /> : (
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
                  {v && <div className="absolute top-2 right-2" title={v.why}><Badge tone={v.tone}>{v.label}</Badge></div>}
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
                  {c.body && <p className="text-[12px] text-mute line-clamp-2" title={c.body}>{c.body}</p>}
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
