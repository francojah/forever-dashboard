'use client'

import { useEffect, useMemo, useState } from 'react'

type MotoOrder = {
  id: number; number: number; created_at: string; payment_status: string; shipping_option: string
  name: string; phone: string; street: string; floor: string; locality: string; city: string
  province: string; zipcode: string; note: string; units: number; printed_at: string | null
}

const card = 'rounded-xl border border-gray-200 dark:border-zinc-800 bg-white dark:bg-zinc-900'
const btn = 'h-8 px-3 rounded-md text-xs font-medium border border-gray-200 dark:border-zinc-700 hover:bg-gray-50 dark:hover:bg-zinc-800 disabled:opacity-40'
const btnPrimary = 'h-9 px-4 rounded-md text-sm font-medium bg-zinc-900 text-white dark:bg-white dark:text-zinc-900 disabled:opacity-40'
const when = (s: string) => new Date(s).toLocaleString('es-AR', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' })

function readFormat(): 'a4' | '10x15' {
  try { return localStorage.getItem('fb-moto-formato') === '10x15' ? '10x15' : 'a4' } catch { return 'a4' }
}

/** Ventas por moto para empaquetar → PDF de etiquetas (logo + orden + destinatario + domicilio). */
export default function MotoLabels({ onCount }: { onCount?: (n: number) => void }) {
  const [orders, setOrders] = useState<MotoOrder[] | null>(null)
  const [err, setErr] = useState('')
  const [loading, setLoading] = useState(false)
  const [pending, setPending] = useState(false)
  const [sel, setSel] = useState<Set<number>>(new Set())
  const [format, setFormat] = useState<'a4' | '10x15'>('a4')

  useEffect(() => { setFormat(readFormat()) }, [])

  async function load(withPending = pending) {
    setLoading(true); setErr('')
    try {
      const r = await fetch(`/api/cambios/admin/envios-moto${withPending ? '?pendientes=1' : ''}`, { cache: 'no-store' })
      const j = await r.json()
      if (!j.ok) throw new Error(j.error || 'Error')
      const list = j.orders as MotoOrder[]
      setOrders(list)
      // Por defecto quedan marcadas las que todavía no se imprimieron
      setSel(new Set(list.filter((o) => !o.printed_at).map((o) => o.id)))
      onCount?.(list.length)
    } catch (e) { setErr((e as Error).message) }
    setLoading(false)
  }
  useEffect(() => { load(false) }, []) // eslint-disable-line react-hooks/exhaustive-deps

  const list = orders ?? []
  const notPrinted = useMemo(() => list.filter((o) => !o.printed_at), [list])
  const toggle = (id: number) => setSel((s) => { const n = new Set(s); if (n.has(id)) n.delete(id); else n.add(id); return n })

  function download() {
    if (!sel.size) return
    const ids = list.filter((o) => sel.has(o.id)).map((o) => o.id).join(',')
    try { localStorage.setItem('fb-moto-formato', format) } catch { /* sin storage */ }
    window.open(`/api/cambios/admin/envios-moto/pdf?ids=${ids}&formato=${format}`, '_blank')
    // Reflejar que quedaron impresas
    setTimeout(() => load(), 2500)
  }

  return (
    <div className="space-y-3">
      <div className={card + ' p-3 flex flex-wrap items-center gap-3'}>
        <p className="text-xs text-gray-600 dark:text-zinc-400 flex-1 min-w-[220px]">
          Ventas con envío por <b>moto</b>, pagas y sin empaquetar en Tiendanube. Las de Correo no aparecen.
        </p>
        <label className="flex items-center gap-1.5 text-xs text-gray-700 dark:text-zinc-300">
          <input type="checkbox" checked={pending} onChange={(e) => { setPending(e.target.checked); load(e.target.checked) }} />
          Incluir pagos pendientes
        </label>
        <button className={btn} disabled={loading} onClick={() => load()}>{loading ? 'Cargando…' : 'Actualizar'}</button>
      </div>

      {err && <p className="text-sm text-red-600">{err}</p>}
      {orders && list.length === 0 && !loading && <p className="text-sm text-gray-500">No hay ventas por moto para empaquetar.</p>}

      {list.length > 0 && (
        <>
          <div className="flex flex-wrap items-center gap-2 text-xs">
            <button className={btn} onClick={() => setSel(new Set(list.map((o) => o.id)))}>Todas ({list.length})</button>
            <button className={btn} onClick={() => setSel(new Set(notPrinted.map((o) => o.id)))}>Sin imprimir ({notPrinted.length})</button>
            <button className={btn} onClick={() => setSel(new Set())}>Ninguna</button>
          </div>

          <div className={card + ' divide-y divide-gray-100 dark:divide-zinc-800'}>
            {list.map((o) => (
              <label key={o.id} className="flex items-start gap-3 p-3 cursor-pointer">
                <input type="checkbox" className="mt-1" checked={sel.has(o.id)} onChange={() => toggle(o.id)} />
                <span className="flex-1 min-w-0 text-sm">
                  <span className="flex flex-wrap items-center gap-2">
                    <b className="text-gray-900 dark:text-white">#{o.number}</b>
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
