'use client'

import { useEffect, useMemo, useState } from 'react'
import { useRouter } from 'next/navigation'
import { Panel, Badge } from '../ui'
import { money } from '@/lib/faro/format'

interface Variant { id: string; name: string; price: number; stock: number | null; platform_cost: number | null; cost: number | null }
interface Product { id: string; name: string; image: string | null; stock: number | null; cost: number | null; variants: Variant[] }

/**
 * Costo por producto (y por variante si difiere). Se puede pegar desde Excel:
 * una línea por producto con "nombre o ID ; costo" (también acepta tab o coma).
 */
export default function ProductCosts({ canEdit, stores, fallbackPct, usePlatform }: { canEdit: boolean; stores: { id: string; name: string }[]; fallbackPct: number; usePlatform: boolean }) {
  const router = useRouter()
  const [store, setStore] = useState(stores[0]?.id || '')
  const [products, setProducts] = useState<Product[] | null>(null)
  const [edits, setEdits] = useState<Record<string, string>>({})   // `${pid}|${vid}` → valor
  const [validFrom, setValidFrom] = useState('')
  const [paste, setPaste] = useState('')
  const [open, setOpen] = useState<Set<string>>(new Set())
  const [msg, setMsg] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)
  const [q, setQ] = useState('')

  useEffect(() => {
    if (!store) return
    setProducts(null)
    fetch(`/api/v2/costs?store=${store}`).then((r) => r.json()).then((j) => setProducts(j.products || [])).catch(() => setProducts([]))
  }, [store])

  const list = useMemo(() => (products || []).filter((p) => !q || p.name.toLowerCase().includes(q.toLowerCase())), [products, q])
  const missing = (products || []).filter((p) => p.cost == null && p.variants.every((v) => v.cost == null && (!usePlatform || !v.platform_cost))).length

  function applyPaste() {
    if (!products) return
    const byName = new Map(products.map((p) => [p.name.trim().toLowerCase(), p.id]))
    const ids = new Set(products.map((p) => p.id))
    const next = { ...edits }
    let ok = 0, bad = 0
    for (const line of paste.split(/\r?\n/)) {
      if (!line.trim()) continue
      const parts = line.split(/\t|;|,(?=[^,]*$)/).map((x) => x.trim())
      if (parts.length < 2) { bad++; continue }
      const key = parts[0].toLowerCase()
      const pid = ids.has(parts[0]) ? parts[0] : byName.get(key)
      const val = Number(parts[parts.length - 1].replace(/[$\s.]/g, '').replace(',', '.'))
      if (!pid || !isFinite(val)) { bad++; continue }
      next[`${pid}|`] = String(val); ok++
    }
    setEdits(next)
    setMsg(`${ok} costos listos para guardar${bad ? `; ${bad} líneas no coincidieron con ningún producto` : ''}.`)
    setPaste('')
  }

  async function save() {
    setSaving(true); setMsg(null)
    const items = Object.entries(edits).map(([k, v]) => {
      const [product_id, variant_id] = k.split('|')
      const p = products?.find((x) => x.id === product_id)
      return { product_id, variant_id: variant_id || '', unit_cost: v.trim() === '' ? null : Number(v.replace(',', '.')), name: p?.name || '', valid_from: validFrom || undefined }
    })
    const r = await fetch('/api/v2/costs', { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ store_id: store, items }) })
    const j = await r.json().catch(() => ({}))
    setSaving(false)
    if (!r.ok) { setMsg(j.error || 'No se pudo guardar'); return }
    setMsg(`Guardado: ${j.saved} costos.`)
    setEdits({})
    fetch(`/api/v2/costs?store=${store}`).then((r) => r.json()).then((j) => setProducts(j.products || []))
    router.refresh()
  }

  const cell = 'w-28 rounded-lg border border-line bg-surface px-2.5 py-1.5 text-right num text-[13.5px]'
  return (
    <div className="flex flex-col gap-5 pb-24">
      <Panel title="Costo de cada producto" description={`Lo que te cuesta producir o comprar una unidad. Sin costo cargado se usa ${usePlatform ? 'el costo de Tiendanube y, si no hay, ' : ''}el ${fallbackPct}% del precio.`}
        actions={stores.length > 1 ? <select value={store} onChange={(e) => setStore(e.target.value)} className="rounded-lg border border-line bg-surface px-2.5 py-1.5 text-[13.5px]">{stores.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}</select> : undefined}>
        <div className="flex flex-wrap items-center gap-3 mb-4 text-[13.5px]">
          <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Buscar producto" className="rounded-lg border border-line bg-surface px-3 py-1.5 w-56" />
          {products && <span className="text-mute">{products.length} productos · {missing > 0 ? <span className="text-warn">{missing} sin ningún costo</span> : 'todos con costo'}</span>}
        </div>
        {!products ? <p className="text-mute py-6">Cargando productos de la tienda…</p> : (
          <div className="overflow-x-auto">
            <table className="w-full text-[13.5px] min-w-[620px]">
              <thead><tr className="text-mute text-left border-b border-line"><th className="font-medium py-2">Producto</th><th className="font-medium py-2 text-right">Precio</th><th className="font-medium py-2 text-right">En Tiendanube</th><th className="font-medium py-2 text-right">Costo en Faro</th></tr></thead>
              <tbody className="divide-y divide-line">
                {list.map((p) => {
                  const k = `${p.id}|`
                  const platform = p.variants.find((v) => v.platform_cost)?.platform_cost ?? null
                  const price = p.variants[0]?.price ?? 0
                  return [
                    <tr key={p.id}>
                      <td className="py-2 pr-2">
                        <div className="flex items-center gap-2">
                          {/* eslint-disable-next-line @next/next/no-img-element */}
                          {p.image && <img src={p.image} alt="" className="w-8 h-8 rounded object-cover border border-line" />}
                          <div className="min-w-0">
                            <p className="text-ink truncate max-w-[300px]" title={p.name}>{p.name}</p>
                            {p.variants.length > 1 && <button onClick={() => { const s = new Set(open); if (s.has(p.id)) s.delete(p.id); else s.add(p.id); setOpen(s) }} className="text-[12px] text-mute hover:text-ink">{open.has(p.id) ? 'Ocultar variantes' : `${p.variants.length} variantes · costo distinto por variante`}</button>}
                          </div>
                        </div>
                      </td>
                      <td className="py-2 text-right num text-mute">{money(price)}</td>
                      <td className="py-2 text-right num text-mute">{platform ? money(platform) : '—'}</td>
                      <td className="py-2 text-right">
                        <input disabled={!canEdit} inputMode="decimal" value={edits[k] ?? (p.cost != null ? String(p.cost) : '')} placeholder={platform && usePlatform ? String(platform) : 'sin cargar'} onChange={(e) => setEdits({ ...edits, [k]: e.target.value })} className={`${cell} ${edits[k] != null ? 'border-beacon' : ''}`} aria-label={`Costo ${p.name}`} />
                      </td>
                    </tr>,
                    ...(open.has(p.id) ? p.variants.map((v) => {
                      const vk = `${p.id}|${v.id}`
                      return (
                        <tr key={vk} className="bg-sunken/50">
                          <td className="py-1.5 pl-10 text-mute">{v.name || 'Variante'} {v.stock != null && <Badge>{v.stock} u</Badge>}</td>
                          <td className="py-1.5 text-right num text-mute">{money(v.price)}</td>
                          <td className="py-1.5 text-right num text-mute">{v.platform_cost ? money(v.platform_cost) : '—'}</td>
                          <td className="py-1.5 text-right"><input disabled={!canEdit} inputMode="decimal" value={edits[vk] ?? (v.cost != null ? String(v.cost) : '')} placeholder="igual al producto" onChange={(e) => setEdits({ ...edits, [vk]: e.target.value })} className={`${cell} ${edits[vk] != null ? 'border-beacon' : ''}`} aria-label={`Costo ${v.name}`} /></td>
                        </tr>
                      )
                    }) : []),
                  ]
                })}
              </tbody>
            </table>
          </div>
        )}
      </Panel>

      {canEdit && (
        <Panel title="Pegar desde Excel" description="Una línea por producto: nombre exacto (o ID de Tiendanube) y costo, separados por tab, punto y coma o coma.">
          <textarea value={paste} onChange={(e) => setPaste(e.target.value)} rows={4} placeholder={'Remera Clasica 100% Algodon Premium\t6280\nPack Boxer x3; 22500'} className="w-full rounded-lg border border-line bg-surface px-3 py-2 text-[13.5px] font-mono" />
          <button onClick={applyPaste} disabled={!paste.trim() || !products} className="mt-2 rounded-lg border border-line px-3 py-1.5 text-[13.5px] font-medium hover:bg-sunken disabled:opacity-50">Aplicar a la tabla</button>
        </Panel>
      )}

      {(Object.keys(edits).length > 0 || msg) && canEdit && (
        <div className="fixed bottom-0 inset-x-0 lg:left-60 z-30 border-t border-line bg-surface">
          <div className="max-w-[1240px] mx-auto px-4 lg:px-8 py-3 flex flex-wrap items-center gap-3 text-[13.5px]">
            {msg && <span className="text-ink">{msg}</span>}
            {Object.keys(edits).length > 0 && (
              <>
                <label className="flex items-center gap-2 text-mute ml-auto">Rige desde
                  <input type="date" value={validFrom} onChange={(e) => setValidFrom(e.target.value)} className="rounded-lg border border-line bg-surface px-2 py-1.5" />
                  <span className="text-faint">(vacío = para todo el historial)</span>
                </label>
                <button onClick={() => setEdits({})} className="text-mute hover:text-ink">Descartar</button>
                <button onClick={save} disabled={saving} className="rounded-lg bg-ink text-surface px-4 py-2 font-semibold disabled:opacity-60">{saving ? 'Guardando' : `Guardar ${Object.keys(edits).length} costos`}</button>
              </>
            )}
          </div>
        </div>
      )}
    </div>
  )
}
