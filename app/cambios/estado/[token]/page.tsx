'use client'

import { useEffect, useState } from 'react'
import { Card, Btn, ErrorBox, money, waLink, nextMondayLabel } from '../../ui'

type Ex = {
  code: string; type: string; status: string; status_label: string; order_number: string; customer_name: string | null
  zone: string; zone_label: string; shipping_amount: number | null
  items: { name: string; variant_label: string; new_variant_label?: string | null; new_product_name?: string | null; price_diff?: number | null; quantity: number }[]
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
      { label: 'Pago confirmado', detail: 'Transferí el total y subí el comprobante (arriba).', done: !!e.paid_at },
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
    { label: 'Pago confirmado', detail: 'Transferí el total y subí el comprobante (arriba).', done: !!e.paid_at },
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

  if (notFound) return <main className="mx-auto max-w-xl px-4 py-8"><Card><p>No encontramos este cambio. Revisá el link o <a className="underline font-semibold" href="/">iniciá uno nuevo</a>.</p></Card></main>
  if (!data) return <main className="mx-auto max-w-xl px-4 py-8"><p className="text-neutral-500 text-sm">Cargando tu cambio…</p></main>

  const e = data.exchange
  const steps = buildSteps(e)
  const current = steps.findIndex((s) => !s.done)
  const finished = current === -1
  const diff = e.items.reduce((a, it) => a + (Number(it.price_diff) || 0), 0)
  const total = e.shipping_amount == null ? null : e.shipping_amount + diff
  const correo = e.type === 'cambio' && (e.zone === 'correo' || e.zone === 'otro')

  const cancelled = e.status === 'cancelado'
  return (
    <>
      <section className="bg-black text-white">
        <div className="mx-auto max-w-xl px-5 pt-6 pb-16">
          <p className="text-neutral-400 text-sm">Orden #{e.order_number} · {e.zone_label}</p>
          <h1 className="font-display text-[30px] leading-tight font-bold tracking-[-0.01em] mt-1">Cambio {e.code}</h1>
          <p className={`inline-flex items-center gap-2 mt-3 text-[13px] font-semibold rounded-full px-3 py-1 ${cancelled ? 'bg-[#4A1414] text-[#F7C6C6]' : 'bg-[#2A2214] text-[#E9C77A]'}`}>
            <span className={`w-1.5 h-1.5 rounded-full ${cancelled ? 'bg-[#F27A7A]' : 'bg-[#E9C77A]'}`} />
            {e.status_label}
          </p>
        </div>
      </section>

      <main className="mx-auto max-w-xl px-4 -mt-10 pb-8 space-y-5">
        {/* Acción pendiente del cliente: pagar */}
        {e.type === 'cambio' && e.status === 'pendiente_pago' && (
          <Card className="space-y-4 border-2 border-[#B8892B] shadow-[0_12px_32px_-16px_rgba(0,0,0,0.35)]">
            {total == null ? (
              <p className="text-[15px]">Estamos calculando el costo del envío. Te lo confirmamos por mail y WhatsApp.</p>
            ) : (
              <>
                <div>
                  <p className="text-[13px] font-semibold text-[#8B6914]">Tu próximo paso</p>
                  <p className="text-[15px] mt-1">Transferí por Mercado Pago</p>
                  <p className="font-display text-[32px] font-bold leading-tight">{money(total)}</p>
                  {diff > 0 && <p className="text-[13px] text-neutral-500">Envío {money(e.shipping_amount)} + diferencia de precio {money(diff)}</p>}
                </div>
                <button type="button" onClick={() => copyAlias(data.alias)}
                  className="w-full rounded-xl bg-[#F4F4F3] border border-[#E6E6E3] px-4 py-3 flex items-center justify-between">
                  <span className="text-left">
                    <span className="block text-[12px] text-neutral-500">Alias</span>
                    <span className="block font-display text-[19px] font-bold">{data.alias}</span>
                  </span>
                  <span className={`text-[13px] font-semibold ${copied ? 'text-[#1F7A4D]' : 'text-[#8B6914]'}`}>{copied ? 'Copiado ✓' : 'Copiar'}</span>
                </button>
                <p className="text-[13.5px] text-neutral-600">En el concepto poné <b className="text-black">{e.code}</b>.</p>
                <div className="pt-4 border-t border-[#EFEFEC] space-y-3">
                  <p className="text-[14px] font-semibold">{e.receipt_uploaded_at ? 'Comprobante recibido ✓' : 'Subí el comprobante'}</p>
                  {e.receipt_uploaded_at && <p className="text-[13px] text-neutral-500 -mt-2">Lo estamos revisando. Si te equivocaste, podés subir otro.</p>}
                  <label className="flex items-center gap-3 rounded-xl border border-dashed border-[#CFCFCB] px-4 py-3 cursor-pointer">
                    <span className="text-[#8B6914] text-[13px] font-semibold shrink-0">Elegir archivo</span>
                    <span className="text-[13px] text-neutral-500 truncate">{file ? file.name : 'Foto o PDF del comprobante'}</span>
                    <input type="file" accept="image/*,application/pdf" className="sr-only"
                      onChange={(ev) => setFile(ev.target.files && ev.target.files[0] ? ev.target.files[0] : null)} />
                  </label>
                  {err && <ErrorBox>{err}</ErrorBox>}
                  {msg && <p className="text-sm text-[#1F7A4D]">{msg}</p>}
                  <Btn onClick={upload} disabled={!file || uploading}>{uploading ? 'Subiendo…' : 'Enviar comprobante'}</Btn>
                </div>
              </>
            )}
          </Card>
        )}

        {/* Correo: etiqueta */}
        {correo && e.status === 'pago_confirmado' && (
          <Card className="space-y-3 border-2 border-[#B8892B] shadow-[0_12px_32px_-16px_rgba(0,0,0,0.35)]">
            <p className="text-[13px] font-semibold text-[#8B6914]">Tu próximo paso</p>
            {e.label_url ? (
              <>
                <p className="font-display text-[20px] font-bold leading-tight">Tu etiqueta está lista</p>
                <ol className="text-[14px] text-neutral-700 space-y-1.5 list-decimal pl-5">
                  <li>Descargala e imprimila.</li>
                  <li>Pegala en el paquete con la prenda.</li>
                  <li>Despachalo en cualquier sucursal de Correo Argentino.</li>
                </ol>
                <a href={e.label_url} className="block w-full h-[52px] rounded-xl bg-black text-white text-[15px] font-semibold leading-[52px] text-center">Descargar etiqueta</a>
              </>
            ) : (
              <p className="text-[15px] leading-relaxed">Pago confirmado. <b>En breve te enviamos la etiqueta de Correo Argentino</b> para que despaches la prenda. Te avisamos por mail y WhatsApp.</p>
            )}
          </Card>
        )}

        {/* Línea de tiempo */}
        <Card className={e.status === 'pendiente_pago' || (correo && e.status === 'pago_confirmado') ? '' : 'shadow-[0_12px_32px_-16px_rgba(0,0,0,0.35)]'}>
          <h2 className="font-display text-[15px] font-bold mb-4">Seguimiento</h2>
          <ol>
            {steps.map((s, i) => {
              const isCurrent = i === current && !cancelled
              const last = i === steps.length - 1
              return (
                <li key={i} className="flex gap-3">
                  <span className="flex flex-col items-center">
                    <span className={`shrink-0 w-7 h-7 rounded-full flex items-center justify-center text-[12px] font-bold
                      ${s.done ? 'bg-[#B8892B] text-white' : isCurrent ? 'border-2 border-black text-black bg-white' : 'border border-[#D9D9D6] text-neutral-400 bg-white'}`}>
                      {s.done ? <svg viewBox="0 0 24 24" className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth="3"><path d="M5 12l5 5L20 7" /></svg> : i + 1}
                    </span>
                    {!last && <span className={`w-[2px] flex-1 min-h-[18px] ${s.done ? 'bg-[#B8892B]' : 'bg-[#E6E6E3]'}`} />}
                  </span>
                  <span className={`min-w-0 ${last ? '' : 'pb-5'}`}>
                    <span className={`block text-[15px] leading-7 ${s.done || isCurrent ? 'text-black' : 'text-neutral-400'} ${isCurrent ? 'font-semibold' : ''}`}>{s.label}</span>
                    {s.detail && (isCurrent || (s.done && last)) && <span className="block text-[13.5px] text-neutral-600 leading-relaxed">{s.detail}</span>}
                  </span>
                </li>
              )
            })}
          </ol>
          {e.type === 'cambio' && !finished && !cancelled && (
            <p className="mt-5 rounded-xl bg-[#FBF6EA] text-[#6B5110] text-[13.5px] px-3 py-2.5">
              Despachamos los cambios todos los lunes. Próximo despacho: <b>{nextMondayLabel()}</b>.
            </p>
          )}
        </Card>

        <Card>
          <h2 className="font-display text-[15px] font-bold mb-3">Tu cambio</h2>
          <ul className="space-y-3">
            {e.items.map((it, i) => (
              <li key={i} className="text-[14px] leading-snug">
                <span className="block text-neutral-500">{it.name} · {it.variant_label}{it.quantity > 1 ? ` · ${it.quantity} u.` : ''}</span>
                {it.new_variant_label && (
                  <span className="block font-semibold mt-0.5">→ {it.new_product_name ? `${it.new_product_name} ` : ''}{it.new_variant_label}</span>
                )}
              </li>
            ))}
          </ul>
        </Card>

        <p className="text-xs text-neutral-500 text-center">
          ¿Dudas? <a className="underline" href={waLink(data.whatsapp, `Hola! Consulta por el cambio ${e.code}`)}>Escribinos por WhatsApp</a>
        </p>
      </main>
    </>
  )
}
