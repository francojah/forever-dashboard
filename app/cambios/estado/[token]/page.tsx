'use client'

import { useEffect, useState } from 'react'
import { Card, Btn, ErrorBox, money, waLink, nextMondayLabel } from '../../ui'

type Ex = {
  code: string; type: string; status: string; status_label: string; order_number: string; customer_name: string | null
  zone: string; zone_label: string; shipping_amount: number | null
  items: { name: string; variant_label: string; new_variant_label?: string | null; quantity: number }[]
  receipt_uploaded_at: string | null; moto_date: string | null; tracking_number: string | null
  created_at: string; paid_at: string | null; received_at: string | null; dispatched_at: string | null
  label_url: string | null; label_sent_at: string | null
}
type Resp = { ok: boolean; exchange: Ex; alias: string; whatsapp: string }
type Step = { label: string; detail?: string; done: boolean }

const isMoto = (e: Ex) => e.zone === 'caba' || e.zone === 'moto_gba'

function buildSteps(e: Ex): Step[] {
  const monday = nextMondayLabel()
  if (e.type !== 'cambio') {
    return [
      { label: 'Solicitud recibida', done: true },
      { label: 'Te contactamos por WhatsApp', done: e.status === 'resuelto' },
    ]
  }
  if (isMoto(e)) {
    return [
      { label: 'Pedido de cambio recibido', done: true },
      { label: 'Pago del envío confirmado', detail: 'Transferí el envío y subí el comprobante acá abajo.', done: !!e.paid_at },
      {
        label: 'Coordinamos la moto',
        detail: e.moto_date
          ? `Pasa ${e.moto_date}. Retira tu prenda y te entrega la nueva en el mismo viaje.`
          : `Una moto retira tu prenda y te entrega la nueva en el mismo viaje. Despachamos los lunes (próximo: ${monday}).`,
        done: !!e.dispatched_at,
      },
      { label: 'Cambio entregado', done: !!e.received_at },
    ]
  }
  if (e.zone === 'retiro') {
    return [
      { label: 'Pedido de cambio recibido', done: true },
      { label: 'Coordinamos día y horario', detail: e.moto_date ? `Te esperamos ${e.moto_date}.` : undefined, done: !!e.dispatched_at },
      { label: 'Cambio realizado', done: !!e.received_at },
    ]
  }
  // Correo Argentino
  return [
    { label: 'Pedido de cambio recibido', done: true },
    { label: 'Pago del envío confirmado', detail: 'Transferí el envío y subí el comprobante acá abajo.', done: !!e.paid_at },
    { label: 'Te enviamos la etiqueta', detail: 'Te mandamos la etiqueta de Correo Argentino para que despaches la prenda en cualquier sucursal.', done: !!e.label_sent_at },
    { label: 'Recibimos tu prenda', detail: 'Cuando llega a nuestro depósito la revisamos y preparamos la nueva.', done: !!e.received_at },
    { label: 'Te enviamos la nueva', detail: e.tracking_number ? `Seguimiento: ${e.tracking_number}` : `Despachamos los cambios los lunes.`, done: !!e.dispatched_at },
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

  if (notFound) return <Card><p>No encontramos este cambio. Revisá el link o <a className="underline" href="/">iniciá uno nuevo</a>.</p></Card>
  if (!data) return <p className="text-zinc-500 text-sm">Cargando…</p>

  const e = data.exchange
  const steps = buildSteps(e)
  const current = steps.findIndex((s) => !s.done)
  const finished = current === -1
  const correo = e.type === 'cambio' && (e.zone === 'correo' || e.zone === 'otro')

  return (
    <div className="space-y-4">
      <div>
        <p className="text-xs text-zinc-500">Orden #{e.order_number} · {e.zone_label}</p>
        <h1 className="text-2xl font-semibold">Cambio {e.code}</h1>
        <p className={`inline-block mt-2 text-sm px-2 py-1 rounded ${e.status === 'cancelado' ? 'bg-red-100 text-red-800' : 'bg-zinc-900 text-white'}`}>{e.status_label}</p>
      </div>

      {/* Acción pendiente del cliente: pagar */}
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

      {/* Correo: etiqueta lista para descargar */}
      {correo && e.status === 'pago_confirmado' && (
        <Card className="space-y-3 border-zinc-900">
          {e.label_url ? (
            <>
              <p className="text-[15px] font-medium">Tu etiqueta está lista</p>
              <ol className="text-sm text-zinc-700 space-y-1 list-decimal pl-5">
                <li>Descargala e imprimila.</li>
                <li>Pegala en el paquete con la prenda.</li>
                <li>Despachalo en cualquier sucursal de Correo Argentino.</li>
              </ol>
              <a href={e.label_url} className="block w-full h-12 rounded-lg bg-zinc-900 text-white text-[15px] font-medium leading-[48px] text-center">Descargar etiqueta</a>
            </>
          ) : (
            <p className="text-[15px]">Pago confirmado. <b>En breve te enviamos la etiqueta de Correo Argentino</b> para que despaches la prenda. Te avisamos por mail y WhatsApp.</p>
          )}
        </Card>
      )}

      {/* Línea de tiempo */}
      <Card>
        <ol className="space-y-4">
          {steps.map((s, i) => {
            const isCurrent = i === current && e.status !== 'cancelado'
            return (
              <li key={i} className="flex gap-3">
                <span className={`shrink-0 w-6 h-6 rounded-full flex items-center justify-center text-xs ${s.done ? 'bg-zinc-900 text-white' : isCurrent ? 'border-2 border-zinc-900 text-zinc-900' : 'border border-zinc-300 text-zinc-400'}`}>{s.done ? '✓' : i + 1}</span>
                <span className="min-w-0">
                  <span className={`block text-[15px] ${s.done || isCurrent ? 'text-zinc-900' : 'text-zinc-400'} ${isCurrent ? 'font-medium' : ''}`}>{s.label}</span>
                  {s.detail && (isCurrent || (s.done && i === steps.length - 1)) && <span className="block text-sm text-zinc-600 mt-0.5">{s.detail}</span>}
                </span>
              </li>
            )
          })}
        </ol>
      </Card>

      {e.type === 'cambio' && !finished && e.status !== 'cancelado' && (
        <p className="text-sm text-zinc-600 text-center">📦 Despachamos los cambios todos los lunes. Próximo despacho: <b>{nextMondayLabel()}</b>.</p>
      )}

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
