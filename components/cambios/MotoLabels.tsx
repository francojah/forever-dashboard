'use client'

import { useEffect, useMemo, useState } from 'react'

type MotoOrder = {
  id: number | string; kind?: 'venta' | 'cambio'; code?: string; extra?: string[]; number: number; created_at: string; payment_status: string; shipping_option: string
  name: string; phone: string; street: string; floor: string; locality: string; city: string
  province: string; zipcode: string; note: string; units: number; printed_at: string | null
}

const card = 'rounded-xl border border-gray-200 dark:border-zinc-800 bg-white dark:bg-zinc-900'
const btn = 'h-8 px-3 rounded-md text-xs font-medium border border-gray-200 dark:border-zinc-700 hover:bg-gray-50 dark:hover:bg-zinc-800 disabled:opacity-40'
const btnPrimary = 'h-9 px-4 rounded-md text-sm font-medium bg-zinc-900 text-white dark:bg-white dark:text-zinc-900 disabled:opacity-40'
const when = (s: string) => new Date(s).toLocaleString('es-AR', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' })

const keyOf = (o: MotoOrder) => (o.kind === 'cambio' ? `c:${o.id}` : `o:${o.id}`)

function readFormat(): 'a4' | '10x15' {
  try { return localStorage.getItem('fb-moto-formato') === '10x15' ? '10x15' : 'a4' } catch { return 'a4' }
}

/** Ventas por moto para empaquetar → PDF de etiquetas (logo + orden + destinatario + domicilio). */
export default function MotoLabels({ onCount }: { onCount?: (n: number) => void }) {
  const [orders, setOrders] = useState<MotoOrder[] | null>(null)
  const [err, setErr] = useState('')
  const [loading, setLoading] = useState(false)
  const [pending, setPending] = useState(false)
  const [sel, setSel] = useState<Set<string>>(new Set())
  const [format, setFormat] = useState<'a4' | '10x15'>('a4')

  useEffect(() => { setFormat(readFormat()) }, [])

  async function load(withPending = pending) {
    setLoading(true); setErr('')
    try {
      const r = await fetch(`/api/cambios/admin/envios-moto${withPending ? '?pendientes=1' : ''}`, { cache: 'no-store' })
      const j = await r.json()
      if (!j.ok) throw new Error(j.error || 'Error')
      const list = [...(j.orders as MotoOrder[]), ...((j.cambios as MotoOrder[]) || [])]
      setOrders(list)
      // Por defecto quedan marcadas las que todavía no se imprimieron
      setSel(new Set(list.filter((o) => !o.printed_at).map(keyOf)))
      onCount?.(list.length)
    } catch (e) { setErr((e as Error).message) }
    setLoading(false)
  }
  useEffect(() => { load(false) }, []) // eslint-disable-line react-hooks/exhaustive-deps

  const list = orders ?? []
  const notPrinted = useMemo(() => list.filter((o) => !o.printed_at), [list])
  const toggle = (k: string) => setSel((s) => { const n = new Set(s); if (n.has(k)) n.delete(k); else n.add(k); return n })

  function download() {
    if (!sel.size) return
    const chosen = list.filter((o) => sel.has(keyOf(o)))
    const ids = chosen.filter((o) => o.kind !== 'cambio').map((o) => o.id).join(',')
    const cambios = chosen.filter((o) => o.kind === 'cambio').map((o) => o.id).join(',')
    try { localStorage.setItem('fb-moto-formato', format) } catch { /* sin storage */ }
    window.open(`/api/cambios/admin/envios-moto/pdf?ids=${ids}&cambios=${cambios}&formato=${format}`, '_blank')
    // Reflejar que quedaron impresas
    setTimeout(() => load(), 2500)
  }

  return (
    <div className="space-y-3">
      <div className={card + ' p-3 flex flex-wrap items-center gap-3'}>
        <p className="text-xs text-gray-600 dark:text-zinc-400 flex-1 min-w-[220px]">
          Todo lo que sale por <b>moto</b>: ventas pagas sin empaquetar en Tiendanube y cambios por moto pendientes de hacer. Lo de Correo no aparece.
        </p>
        <label className="flex items-center gap-1.5 text-xs text-gray-700 dark:text-zinc-300">
          <input type="checkbox" checked={pending} onChange={(e) => { setPending(e.target.checked); load(e.target.checked) }} />
          Incluir pagos pendientes
        </label>
        <button className={btn} disabled={loading} onClick={() => load()}>{loading ? 'Cargando…' : 'Actualizar'}</button>
      </div>

      {err && <p className="text-sm text-red-600">{err}</p>}
      {orders && list.length === 0 && !loading && <p className="text-sm text-gray-500">No hay nada por moto para despachar.</p>}

      {list.length > 0 && (
        <>
          <div className="flex flex-wrap items-center gap-2 text-xs">
            <button className={btn} onClick={() => setSel(new Set(list.map(keyOf)))}>Todas ({list.length})</button>
            <button className={btn} onClick={() => setSel(new Set(notPrinted.map(keyOf)))}>Sin imprimir ({notPrinted.length})</button>
            <button className={btn} onClick={() => setSel(new Set())}>Ninguna</button>
          </div>

          <div className={card + ' divide-y divide-gray-100 dark:divide-zinc-800'}>
            {list.map((o) => (
              <label key={keyOf(o)} className="flex items-start gap-3 p-3 cursor-pointer">
                <input type="checkbox" className="mt-1" checked={sel.has(keyOf(o))} onChange={() => toggle(keyOf(o))} />
                <span className="flex-1 min-w-0 text-sm">
                  <span className="flex flex-wrap items-center gap-2">
                    {o.kind === 'cambio'
                      ? <><span className="text-[11px] px-2 py-0.5 rounded bg-violet-100 text-violet-800 font-medium">Cambio {o.code}</span><span className="text-xs text-gray-500">orden #{o.number}</span></>
                      : <b className="text-gray-900 dark:text-white">#{o.number}</b>}
                    <span className="text-gray-900 dark:text-white">{o.name}</span>
                    {o.payment_status !== 'paid' && <span className="text-[11px] px-2 py-0.5 rounded bg-amber-100 text-amber-800">Pago pendiente</span>}
                    {o.printed_at && <span className="text-[11px] px-2 py-0.5 rounded bg-gray-100 text-gray-600 dark:bg-zinc-800 dark:text-zinc-400">Impresa {when(o.printed_at)}</span>}
                  </span>
                  <span className="block text-xs text-gray-600 dark:text-zinc-400 mt-0.5">
                    {[o.street, o.floor].filter(Boolean).join(' · ')}{o.locality ? ` — ${o.locality}` : ''}{o.city && o.city !== o.locality ? `, ${o.city}` : ''}
                  </span>
                  <span className="block text-xs text-gray-500 mt-0.5">
                    {o.shipping_option} · {o.units} {o.units === 1 ? 'prenda' : 'prendas'} · {when(o.created_at)}{o.phone ? ` · ${o.phone}` : ''}
                  </span>
                  {o.extra?.length ? <span className="block text-xs text-gray-700 dark:text-zinc-300 mt-0.5">{o.extra.join(' · ')}</span> : null}
                  {o.note && <span className="block text-xs italic text-gray-500 mt-0.5">“{o.note}”</span>}
                </span>
              </label>
            ))}
          </div>

          <div className={card + ' p-3 flex flex-wrap items-center gap-3 sticky bottom-3'}>
            <span className="text-xs text-gray-700 dark:text-zinc-300">Formato:</span>
            <label className="flex items-center gap-1.5 text-xs"><input type="radio" checked={format === 'a4'} onChange={() => setFormat('a4')} /> Hoja A4 (4 por hoja)</label>
            <label className="flex items-center gap-1.5 text-xs"><input type="radio" checked={format === '10x15'} onChange={() => setFormat('10x15')} /> Etiqueta 10×15</label>
            <span className="flex-1" />
            <button className={btnPrimary} disabled={!sel.size} onClick={download}>Generar etiquetas ({sel.size})</button>
          </div>
        </>
      )}
    </div>
  )
}
