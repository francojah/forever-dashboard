'use client'

import { useEffect, useState } from 'react'
import { Card, Btn, ErrorBox, money, waLink } from '../../ui'

type Ex = {
  code: string; type: string; status: string; status_label: string; order_number: string; customer_name: string | null
  zone: string; zone_label: string; shipping_amount: number | null
  items: { name: string; variant_label: string; new_variant_label?: string | null; quantity: number }[]
  receipt_uploaded_at: string | null; moto_date: string | null; tracking_number: string | null
  created_at: string; paid_at: string | null; received_at: string | null; dispatched_at: string | null
}
type Resp = { ok: boolean; exchange: Ex; alias: string; returnAddress: string; whatsapp: string }

function steps(e: Ex) {
  if (e.type !== 'cambio') {
    return [
      { label: 'Solicitud recibida', done: true },
      { label: 'Te contactamos por WhatsApp', done: e.status === 'resuelto' },
      { label: 'Resuelto', done: e.status === 'resuelto' },
    ]
  }
  const paid = !!e.paid_at
  if (e.zone === 'correo' || e.zone === 'otro') {
    return [
      { label: 'Pedido de cambio recibido', done: true },
      { label: 'Pago del envío confirmado', done: paid },
      { label: 'Recibimos tu prenda', done: !!e.received_at },
      { label: 'Te enviamos la nueva', done: !!e.dispatched_at },
    ]
  }
  if (e.zone === 'retiro') {
    return [
      { label: 'Pedido de cambio recibido', done: true },
      { label: 'Día coordinado en el punto de retiro', done: !!e.dispatched_at },
      { label: 'Cambio realizado', done: !!e.received_at },
    ]
  }
  return [
    { label: 'Pedido de cambio recibido', done: true },
    { label: 'Pago del envío confirmado', done: paid },
    { label: 'Moto coordinada: retira y entrega', done: !!e.dispatched_at },
  ]
}

export default function EstadoPage({ params }: { params: { token: string } }) {
  const [data, setData] = useState<Resp | null>(null)
  const [notFound, setNotFound] = useState(false)
  const [file, setFile] = useState<File | null>(null)
  const [uploading, setUploading] = useState(false)
  const [msg, setMsg] = useState('')
  const [err, setErr] = useState('')
  const [copied, setCopied] = useState(false)

  async function load() {
    try {
      const res = await fetch(`/api/cambios/status?token=${encodeURIComponent(params.token)}`, { cache: 'no-store' })
      const j = await res.json()
      if (!j.ok) setNotFound(true); else setData(j)
    } catch { setNotFound(true) }
  }
  useEffect(() => { load() }, []) // eslint-disable-line react-hooks/exhaustive-deps

  async function upload() {
    if (!file) return
    setErr(''); setMsg(''); setUploading(true)
    try {
      const fd = new FormData()
      fd.append('token', params.token)
      fd.append('file', file)
      const res = await fetch('/api/cambios/receipt', { method: 'POST', body: fd })
      const j = await res.json()
      if (!j.ok) setErr(j.reason || 'No pudimos subir el archivo.')
      else { setMsg('¡Listo! Recibimos tu comprobante. Te avisamos cuando lo confirmemos.'); setFile(null); await load() }
    } catch { setErr('No pudimos subir el archivo. Probá de nuevo.') }
    setUploading(false)
  }

  function copyAlias(alias: string) {
    try {
      const ta = document.createElement('textarea')
      ta.value = alias; document.body.appendChild(ta); ta.select(); document.execCommand('copy'); document.body.removeChild(ta)
      setCopied(true); setTimeout(() => setCopied(false), 2000)
    } catch { /* algunos webviews no permiten copiar */ }
  }

  if (notFound) return <Card><p>No encontramos este cambio. Revisá el link o <a className="underline" href="/cambios">iniciá uno nuevo</a>.</p></Card>
  if (!data) return <p className="text-zinc-500 text-sm">Cargando…</p>

  const e = data.exchange
  const st = steps(e)
  return (
    <div className="space-y-4">
      <div>
        <p className="text-xs text-zinc-500">Orden #{e.order_number}</p>
        <h1 className="text-2xl font-semibold">Cambio {e.code}</h1>
        <p className={`inline-block mt-2 text-sm px-2 py-1 rounded ${e.status === 'cancelado' ? 'bg-red-100 text-red-800' : 'bg-zinc-900 text-white'}`}>{e.status_label}</p>
      </div>

      {e.type === 'cambio' && e.status === 'pendiente_pago' && (
        <Card className="space-y-3 border-zinc-900">
          {e.shipping_amount == null ? (
            <p className="text-[15px]">Estamos calculando el costo del envío. Te lo confirmamos por mail y WhatsApp.</p>
          ) : (
            <>
              <p className="text-[15px]">Transferí <b>{money(e.shipping_amount)}</b> por Mercado Pago al alias:</p>
              <button type="button" onClick={() => copyAlias(data.alias)}
                className="w-full h-12 rounded-lg bg-zinc-100 font-mono text-lg flex items-center justify-center gap-2">
                {data.alias} <span className="text-xs text-zinc-500 font-sans">{copied ? 'copiado ✓' : 'tocar para copiar'}</span>
              </button>
              <p className="text-sm text-zinc-600">En el concepto poné <b>{e.code}</b>.</p>
              <div className="pt-2 border-t border-zinc-200 space-y-2">
                <p className="text-sm font-medium">{e.receipt_uploaded_at ? 'Comprobante recibido ✓ (podés subir otro si te equivocaste)' : 'Subí el comprobante'}</p>
                <input type="file" accept="image/*,application/pdf" className="block w-full text-sm"
                  onChange={(ev) => setFile(ev.target.files && ev.target.files[0] ? ev.target.files[0] : null)} />
                {err && <ErrorBox>{err}</ErrorBox>}
                {msg && <p className="text-sm text-green-700">{msg}</p>}
                <Btn onClick={upload} disabled={!file || uploading}>{uploading ? 'Subiendo…' : 'Enviar comprobante'}</Btn>
              </div>
            </>
          )}
        </Card>
      )}

      {e.type === 'cambio' && (e.zone === 'correo' || e.zone === 'otro') && e.status === 'pago_confirmado' && (
        <Card className="space-y-2 border-zinc-900">
          <p className="text-[15px] font-medium">Mandá la prenda por Correo Argentino a:</p>
          <p className="text-[15px]">{data.returnAddress}</p>
          <p className="text-sm text-zinc-600">Escribí <b>{e.code}</b> en el paquete. Cuando la recibamos te enviamos la nueva.</p>
        </Card>
      )}

      {e.moto_date && (
        <Card><p className="text-[15px]">{e.zone === 'retiro'
          ? <>Te esperamos en el punto de retiro: <b>{e.moto_date}</b>. Llevá la prenda a cambiar.</>
          : <>La moto pasa: <b>{e.moto_date}</b>. Tené lista la prenda para entregar.</>}</p></Card>
      )}
      {e.tracking_number && <Card><p className="text-[15px]">Seguimiento Correo Argentino: <b>{e.tracking_number}</b></p></Card>}

      <Card>
        <ol className="space-y-3">
          {st.map((s, i) => (
            <li key={i} className="flex items-center gap-3">
              <span className={`w-6 h-6 rounded-full flex items-center justify-center text-xs ${s.done ? 'bg-zinc-900 text-white' : 'border border-zinc-300 text-zinc-400'}`}>{s.done ? '✓' : i + 1}</span>
              <span className={`text-[15px] ${s.done ? '' : 'text-zinc-500'}`}>{s.label}</span>
            </li>
          ))}
        </ol>
      </Card>

      <Card>
        <p className="text-sm font-medium mb-2">Prendas</p>
        <ul className="space-y-1 text-[15px]">
          {e.items.map((it, i) => (
            <li key={i}>{it.name} — {it.variant_label}{it.new_variant_label ? <> → <b>{it.new_variant_label}</b></> : null}{it.quantity > 1 ? ` (x${it.quantity})` : ''}</li>
          ))}
        </ul>
      </Card>

      <p className="text-xs text-zinc-500 text-center">
        ¿Dudas? <a className="underline" href={waLink(data.whatsapp, `Hola! Consulta por el cambio ${e.code}`)}>Escribinos por WhatsApp</a>
      </p>
    </div>
  )
}
