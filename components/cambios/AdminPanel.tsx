'use client'

import { useEffect, useMemo, useState } from 'react'
import MotoLabels from './MotoLabels'

type Item = {
  product_id: number; variant_id: number | null; name: string; variant_label: string; quantity: number; reason?: string
  new_variant_id?: number | null; new_variant_label?: string | null; new_product_name?: string | null; price_diff?: number | null; tn_stock: number | null; stock_alert: boolean
}
type Row = {
  id: string; code: string; status_token: string; type: string; status: string; status_label: string
  order_number: string; customer_name: string | null; email: string; phone: string | null
  zone: string; zone_label: string; shipping_option: string | null; shipping_amount: number | null
  address: { dispatch_branch?: { name?: string; address?: string; locality?: string; province?: string; hours?: string } | null; notes?: string; branch?: string; name?: string; street?: string; floor?: string; locality?: string; city?: string; province?: string; zipcode?: string }
  items: Item[]; customer_note: string | null; receipt_url: string | null; receipt_uploaded_at: string | null
  paid_at: string | null; received_at: string | null; item_condition: string | null
  moto_date: string | null; tracking_number: string | null; dispatched_at: string | null
  stock_out_done: boolean; stock_in_done: boolean; internal_note: string | null
  label_url: string | null; label_sent_at: string | null
  email_ok: boolean | null; email_detail: string | null
  whatsapp_text: string; created_at: string; events: { at: string; type: string; detail: string | null }[]
}
type Data = { ok: boolean; rows: Row[]; emailEnabled: boolean; reasons: { id: string; label: string }[]; portalUrl: string }

const card = 'rounded-xl border border-gray-200 dark:border-zinc-800 bg-white dark:bg-zinc-900'
const btn = 'h-8 px-3 rounded-md text-xs font-medium border border-gray-200 dark:border-zinc-700 hover:bg-gray-50 dark:hover:bg-zinc-800 disabled:opacity-40'
const btnPrimary = 'h-8 px-3 rounded-md text-xs font-medium bg-zinc-900 text-white dark:bg-white dark:text-zinc-900 disabled:opacity-40'
const input = 'h-8 px-2 rounded-md text-xs border border-gray-200 dark:border-zinc-700 bg-white dark:bg-zinc-950'

const ACTIVE = ['pendiente_pago', 'pago_confirmado', 'etiqueta_enviada', 'prenda_recibida', 'revision']
const fmt = (n: number | null) => (n == null ? 'a confirmar' : '$' + Math.round(n).toLocaleString('es-AR'))
const date = (s: string | null) => (s ? new Date(s).toLocaleDateString('es-AR', { day: '2-digit', month: '2-digit' }) : '')

function waPhone(p: string | null) {
  let d = (p || '').replace(/\D/g, '')
  if (!d) return ''
  if (d.startsWith('54')) d = d.slice(2)
  if (d.startsWith('0')) d = d.slice(1)
  if (d.startsWith('9')) d = d.slice(1)
  d = d.replace(/^(\d{2,4})15(\d{6,8})$/, '$1$2') // quita el 15 viejo
  return '549' + d
}

function statusTone(s: string) {
  if (s === 'pendiente_pago' || s === 'revision' || s === 'pago_confirmado') return 'bg-amber-100 text-amber-800 dark:bg-amber-950/40 dark:text-amber-300'
  if (s === 'cancelado') return 'bg-red-100 text-red-800 dark:bg-red-950/40 dark:text-red-300'
  if (s === 'despachado' || s === 'resuelto') return 'bg-emerald-100 text-emerald-800 dark:bg-emerald-950/40 dark:text-emerald-300'
  return 'bg-blue-100 text-blue-800 dark:bg-blue-950/40 dark:text-blue-300'
}

export default function CambiosAdminPanel({ variant = 'dashboard', userName, onLogout }: { variant?: 'dashboard' | 'standalone'; userName?: string; onLogout?: () => void }) {
  const [data, setData] = useState<Data | null>(null)
  const [err, setErr] = useState('')
  const [tab, setTab] = useState<'activos' | 'stock' | 'historial' | 'moto'>('activos')
  const [motoCount, setMotoCount] = useState<number | null>(null)
  const [busy, setBusy] = useState<string | null>(null)
  const [flash, setFlash] = useState('')

  async function load() {
    try {
      const r = await fetch('/api/cambios/admin', { cache: 'no-store' })
      const j = await r.json()
      if (!j.ok) setErr(j.error || 'Error'); else { setData(j); setErr('') }
    } catch (e) { setErr((e as Error).message) }
  }
  useEffect(() => { load() }, [])

  async function act(row: Row, action: string, extra: Record<string, unknown> = {}) {
    setBusy(row.id + action)
    try {
      const r = await fetch(`/api/cambios/admin/${row.id}`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ action, ...extra }),
      })
      const j = await r.json()
      if (!j.ok) alertMsg(j.error || 'Error')
      else if (j.emailKind) alertMsg(j.emailSent ? `${row.code}: listo, mail enviado al cliente` : `${row.code}: guardado, pero el MAIL NO SALIÓ (${j.emailError || 'error'}). Reintentá desde el cambio.`)
      else alertMsg(`${row.code}: actualizado`)
      await load()
    } catch (e) { alertMsg((e as Error).message) }
    setBusy(null)
  }
  function alertMsg(m: string) { setFlash(m); setTimeout(() => setFlash(''), 7000) }
  async function testEmail() {
    setBusy('test-email')
    try {
      const r = await fetch('/api/cambios/admin/test-email', { method: 'POST' })
      const j = await r.json()
      alertMsg(j.ok ? `Mail de prueba enviado a ${j.to}. Revisá la casilla.` : `El mail de prueba NO salió: ${j.error || 'error'}`)
    } catch (e) { alertMsg((e as Error).message) }
    setBusy(null)
  }

  const rows = data?.rows ?? []
  const active = rows.filter((r) => ACTIVE.includes(r.status) || (r.status === 'despachado' && r.type === 'cambio' && (r.zone === 'caba' || r.zone === 'moto_gba') && !r.received_at))
  const history = rows.filter((r) => !active.includes(r))
  const stockTasks = useMemo(() => {
    const out: { row: Row; kind: 'out' | 'in' | 'skip'; text: string }[] = []
    for (const r of rows) {
      if (r.type !== 'cambio' || r.status === 'cancelado') continue
      if (r.dispatched_at && !r.stock_out_done) {
        for (const it of r.items) out.push({ row: r, kind: 'out', text: `Restar ${it.quantity} × ${it.new_product_name || it.name} ${it.new_variant_label}` })
      }
      if (r.received_at && r.item_condition === 'ok' && !r.stock_in_done) {
        for (const it of r.items) out.push({ row: r, kind: 'in', text: `Sumar ${it.quantity} × ${it.name} ${it.variant_label}` })
      }
      if (r.received_at && r.item_condition === 'fallada' && !r.stock_in_done) {
        for (const it of r.items) out.push({ row: r, kind: 'skip', text: `No sumar (fallada): ${it.name} ${it.variant_label}` })
      }
    }
    return out
  }, [rows])

  const alerts = active.filter((r) => r.items.some((i) => i.stock_alert))

  return (
    <div className={variant === 'standalone' ? 'mx-auto max-w-3xl p-4 space-y-4' : 'p-4 sm:p-6 max-w-5xl space-y-4'}>
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-xl font-semibold text-gray-900 dark:text-white">{variant === 'standalone' && userName ? `Hola ${userName}` : 'Cambios'}</h1>
          <p className="text-xs text-gray-500 dark:text-zinc-400">No crea órdenes ni modifica stock en Tiendanube: solo deja una nota en la venta original.</p>
        </div>
        {variant === 'standalone' && onLogout && (
          <button className={btn} onClick={onLogout}>Salir</button>
        )}
        {data && variant === 'dashboard' && (
          <div className="flex items-center gap-2">
            <a href={data.portalUrl} target="_blank" rel="noreferrer" className={btn + ' inline-flex items-center'}>Abrir portal</a>
            <button className={btn} onClick={() => { navigator.clipboard?.writeText(data.portalUrl); alertMsg('Link del portal copiado') }}>Copiar link</button>
          </div>
        )}
      </div>

      {data && !data.emailEnabled && (
        <div className="rounded-lg border border-red-200 bg-red-50 dark:bg-red-950/30 dark:border-red-900 text-red-900 dark:text-red-200 text-xs p-3">
          <b>Los mails al cliente no están saliendo:</b> falta cargar la contraseña de aplicación de Zoho (ZOHO_SMTP_PASS) en Vercel. Hasta entonces avisá cada paso con el botón WhatsApp.
        </div>
      )}
      {data && data.emailEnabled && (
        <div className="flex items-center justify-between gap-3 rounded-lg border border-gray-200 dark:border-zinc-800 bg-white dark:bg-zinc-900 text-xs p-3 text-gray-700 dark:text-zinc-300">
          <span>El cliente recibe un mail en cada cambio de estado. Si alguno falla, el cambio queda marcado como «Mail no enviado».</span>
          <button className={btn + ' shrink-0'} disabled={busy !== null} onClick={testEmail}>Probar mail</button>
        </div>
      )}
      {alerts.length > 0 && (
        <div className="rounded-lg border border-red-200 bg-red-50 dark:bg-red-950/30 dark:border-red-900 text-red-800 dark:text-red-200 text-xs p-3">
          Sin stock suficiente en Tiendanube para: {alerts.map((r) => r.code).join(', ')}. Ofrecé otra opción al cliente.
        </div>
      )}
      {flash && <div className="fixed bottom-4 right-4 z-50 rounded-lg bg-zinc-900 text-white text-sm px-4 py-2 shadow-lg">{flash}</div>}
      {err && <p className="text-sm text-red-600">{err}</p>}

      <div className="flex gap-1 border-b border-gray-200 dark:border-zinc-800 overflow-x-auto">
        {([['activos', `Activos (${active.length})`], ['stock', `Ajustes de stock (${stockTasks.filter((t) => t.kind !== 'skip').length})`], ['historial', `Historial (${history.length})`], ['moto', `Etiquetas moto${motoCount != null ? ` (${motoCount})` : ''}`]] as const).map(([k, l]) => (
          <button key={k} onClick={() => setTab(k)}
            className={`px-3 py-2 text-sm -mb-px border-b-2 whitespace-nowrap ${tab === k ? 'border-zinc-900 dark:border-white font-medium text-gray-900 dark:text-white' : 'border-transparent text-gray-500'}`}>{l}</button>
        ))}
      </div>

      {!data && !err && <p className="text-sm text-gray-500">Cargando…</p>}

      {tab === 'moto' && <MotoLabels onCount={setMotoCount} />}

      {tab === 'stock' && (
        <div className={card + ' divide-y divide-gray-100 dark:divide-zinc-800'}>
          {stockTasks.length === 0 && <p className="p-4 text-sm text-gray-500">No hay ajustes pendientes.</p>}
          {stockTasks.map((t, i) => (
            <div key={i} className="p-3 flex items-center justify-between gap-3 text-sm">
              <span className={t.kind === 'skip' ? 'text-gray-500 line-through' : 'text-gray-900 dark:text-white'}>
                <span className="text-xs text-gray-400 mr-2">{t.row.code}</span>{t.text}
              </span>
              <button className={btn} disabled={busy !== null}
                onClick={() => act(t.row, t.kind === 'out' ? 'stock_out' : 'stock_in', { value: true })}>
                {t.kind === 'skip' ? 'Descartar' : 'Hecho en TN'}
              </button>
            </div>
          ))}
        </div>
      )}

      {(tab === 'activos' || tab === 'historial') && (
        <div className="space-y-3">
          {(tab === 'activos' ? active : history).length === 0 && data && <p className="text-sm text-gray-500">Nada por acá.</p>}
          {(tab === 'activos' ? active : history).map((r) => <ExchangeCard key={r.id} r={r} busy={busy} act={act} reasons={data?.reasons ?? []} reload={load} notify={alertMsg} />)}
        </div>
      )}
    </div>
  )
}

function ExchangeCard({ r, busy, act, reasons, reload, notify }: {
  r: Row; busy: string | null; act: (r: Row, a: string, e?: Record<string, unknown>) => void; reasons: { id: string; label: string }[]
  reload: () => Promise<void>; notify: (m: string) => void
}) {
  const [labelFile, setLabelFile] = useState<File | null>(null)
  const [uploadingLabel, setUploadingLabel] = useState(false)
  async function uploadLabel() {
    if (!labelFile) return
    setUploadingLabel(true)
    try {
      const fd = new FormData(); fd.append('file', labelFile)
      const res = await fetch(`/api/cambios/admin/${r.id}/label`, { method: 'POST', body: fd })
      const j = await res.json()
      if (!j.ok) notify(j.error || 'Error al subir')
      else notify(j.emailSent ? `${r.code}: etiqueta subida y mail enviado` : `${r.code}: etiqueta subida, pero el MAIL NO SALIÓ (${j.emailError || 'error'})`)
      setLabelFile(null); await reload()
    } catch (e) { notify((e as Error).message) }
    setUploadingLabel(false)
  }
  const [amount, setAmount] = useState('')
  const [moto, setMoto] = useState(r.moto_date || '')
  const [tracking, setTracking] = useState(r.tracking_number || '')
  const [note, setNote] = useState(r.internal_note || '')
  const [open, setOpen] = useState(false)
  const reasonLabel = (id?: string) => reasons.find((x) => x.id === id)?.label || id || ''
  const isMoto = r.zone === 'caba' || r.zone === 'moto_gba' || r.zone === 'retiro'
  const a = r.address || {}
  const labelText = [a.branch ? `Punto de retiro: ${a.branch}` : '', a.name || r.customer_name, a.street + (a.floor ? ` ${a.floor}` : ''), [a.locality, a.city].filter(Boolean).join(', '), `${a.province || ''} (${a.zipcode || ''})`, r.phone ? `Tel: ${r.phone}` : ''].filter(Boolean).join('\n')
  const phone = waPhone(r.phone)
  const dis = busy !== null

  return (
    <div className={card + ' p-4 space-y-3'}>
      <div className="flex flex-wrap items-center gap-2">
        <span className="font-semibold text-gray-900 dark:text-white">{r.code}</span>
        <span className={`text-[11px] px-2 py-0.5 rounded ${statusTone(r.status)}`}>{r.status_label}</span>
        {r.type !== 'cambio' && <span className="text-[11px] px-2 py-0.5 rounded bg-violet-100 text-violet-800 dark:bg-violet-950/40 dark:text-violet-300">{r.type === 'reembolso' ? 'Reembolso' : 'Otro modelo'}</span>}
        <span className="text-xs text-gray-500">{r.zone_label} · Orden #{r.order_number} · {date(r.created_at)}</span>
        {r.email_ok === false && (
          <span className="text-[11px] px-2 py-0.5 rounded bg-red-100 text-red-800 font-medium" title={r.email_detail || ''}>Mail no enviado</span>
        )}
      </div>

      <div className="grid sm:grid-cols-2 gap-3 text-sm">
        <div>
          <p className="text-gray-900 dark:text-white">{r.customer_name}</p>
          <p className="text-xs text-gray-500">{r.email}{r.phone ? ` · ${r.phone}` : ''}</p>
          <ul className="mt-2 space-y-1">
            {r.items.map((it, i) => (
              <li key={i} className="text-xs text-gray-700 dark:text-zinc-300">
                {it.name} <b>{it.variant_label}</b>{it.new_variant_label ? <> → <b>{it.new_product_name ? `${it.new_product_name} ` : ''}{it.new_variant_label}</b></> : null}{it.price_diff ? <span className="text-[#8B6914] font-medium"> (+{fmt(it.price_diff)})</span> : null}{it.quantity > 1 ? ` x${it.quantity}` : ''}
                <span className="text-gray-400"> · {reasonLabel(it.reason)}</span>
                {it.stock_alert && <span className="ml-1 text-red-600 font-medium">· sin stock en TN ({it.tn_stock})</span>}
              </li>
            ))}
          </ul>
          {r.address?.dispatch_branch?.name && (
            <p className="mt-2 text-xs text-gray-700">Despacha desde: <b>{r.address.dispatch_branch.name}</b>{r.address.dispatch_branch.address ? ` · ${r.address.dispatch_branch.address}` : ''}{r.address.dispatch_branch.locality ? ` · ${r.address.dispatch_branch.locality}` : ''}{r.address.dispatch_branch.province ? ` (${r.address.dispatch_branch.province})` : ''}</p>
          )}
          {isMoto && r.address?.street && (
            <p className="mt-2 text-xs text-gray-700">Dirección: <b>{r.address.street}{r.address.floor ? ` ${r.address.floor}` : ''}</b>{r.address.locality ? ` · ${r.address.locality}` : ''}{r.address.notes ? ` · ${r.address.notes}` : ''}</p>
          )}
          {r.customer_note && <p className="mt-2 text-xs italic text-gray-500">“{r.customer_note}”</p>}
        </div>
        <div className="space-y-1 text-xs">
          {r.type === 'cambio' && (() => {
            const diff = r.items.reduce((a, it) => a + (Number(it.price_diff) || 0), 0)
            const total = r.shipping_amount == null ? null : r.shipping_amount + diff
            return <p>Total: <b className="text-gray-900 dark:text-white">{total === 0 ? 'sin costo' : fmt(total)}</b>{diff > 0 && <span className="text-gray-500"> (envío {fmt(r.shipping_amount)} + dif. {fmt(diff)})</span>}</p>
          })()}
          {r.receipt_url
            ? <p>Comprobante: <a href={r.receipt_url} target="_blank" rel="noreferrer" className="underline text-blue-600">ver ({date(r.receipt_uploaded_at)})</a></p>
            : r.type === 'cambio' && r.status === 'pendiente_pago' && <p className="text-gray-500">Sin comprobante todavía</p>}
          {r.moto_date && <p>Moto: {r.moto_date}</p>}
          {r.tracking_number && <p>Seguimiento: {r.tracking_number}</p>}
          {r.label_url && <p>Etiqueta: <a href={r.label_url} target="_blank" rel="noreferrer" className="underline text-blue-600">ver ({date(r.label_sent_at)})</a></p>}
          {r.received_at && <p>Prenda recibida {date(r.received_at)} · {r.item_condition === 'fallada' ? 'fallada' : 'en buen estado'}</p>}
        </div>
      </div>

      {/* Acciones según estado */}
      <div className="flex flex-wrap items-center gap-2 pt-2 border-t border-gray-100 dark:border-zinc-800">
        {r.type === 'cambio' && r.status === 'pendiente_pago' && (
          <>
            {r.shipping_amount == null && (
              <>
                <input className={input + ' w-28'} placeholder="Monto envío" inputMode="numeric" value={amount} onChange={(e) => setAmount(e.target.value)} />
                <button className={btn} disabled={dis || !amount} onClick={() => act(r, 'set_amount', { amount: Number(amount.replace(/\D/g, '')) })}>Guardar monto</button>
              </>
            )}
            <button className={btnPrimary} disabled={dis || r.shipping_amount == null} onClick={() => act(r, 'confirm_payment')}>Transferencia OK</button>
          </>
        )}
        {r.type === 'cambio' && isMoto && (r.status === 'pago_confirmado' || (r.status === 'despachado' && !r.received_at)) && (
          <>
            <input className={input + ' w-48'} placeholder={r.zone === 'retiro' ? 'Ej: sábado 10 a 13 hs' : 'Ej: jueves 14 a 20 hs'} value={moto} onChange={(e) => setMoto(e.target.value)} />
            <button className={r.status === 'pago_confirmado' ? btnPrimary : btn} disabled={dis || !moto} onClick={() => act(r, 'set_moto', { date: moto })}>
              {r.status === 'pago_confirmado' ? (r.zone === 'retiro' ? 'Día coordinado' : 'Moto coordinada') : 'Actualizar día'}
            </button>
          </>
        )}
        {r.type === 'cambio' && !isMoto && (r.status === 'pago_confirmado' || r.status === 'etiqueta_enviada') && (
          <>
            <input type="file" accept="application/pdf,image/*" className="text-xs max-w-[190px]" onChange={(e) => setLabelFile(e.target.files && e.target.files[0] ? e.target.files[0] : null)} />
            <button className={r.label_url ? btn : btnPrimary} disabled={dis || !labelFile || uploadingLabel} onClick={uploadLabel}>
              {uploadingLabel ? 'Subiendo…' : r.label_url ? 'Reemplazar etiqueta' : 'Subir etiqueta'}
            </button>
          </>
        )}
        {r.type === 'cambio' && ((!isMoto && (r.status === 'pago_confirmado' || r.status === 'etiqueta_enviada')) || (isMoto && r.status === 'despachado' && !r.received_at)) && (
          <>
            <button className={btnPrimary} disabled={dis} onClick={() => act(r, 'mark_received', { condition: 'ok' })}>{r.zone === 'retiro' ? 'Cambio hecho, prenda OK' : 'Prenda recibida OK'}</button>
            <button className={btn} disabled={dis} onClick={() => act(r, 'mark_received', { condition: 'fallada' })}>Recibida fallada</button>
          </>
        )}
        {r.type === 'cambio' && !isMoto && (r.status === 'prenda_recibida' || r.status === 'despachado') && (
          <>
            <input className={input + ' w-48'} placeholder="N° de seguimiento" value={tracking} onChange={(e) => setTracking(e.target.value)} />
            <button className={r.status === 'prenda_recibida' ? btnPrimary : btn} disabled={dis || !tracking} onClick={() => act(r, 'set_tracking', { tracking })}>
              {r.status === 'prenda_recibida' ? 'Despachado' : 'Actualizar seguimiento'}
            </button>
          </>
        )}
        {r.type !== 'cambio' && r.status === 'revision' && (
          <button className={btnPrimary} disabled={dis} onClick={() => act(r, 'resolve')}>{r.type === 'reembolso' ? 'Reintegrado' : 'Resuelto'}</button>
        )}

        <span className="flex-1" />
        {phone && <a className={btn + ' inline-flex items-center'} target="_blank" rel="noreferrer" href={`https://wa.me/${phone}?text=${encodeURIComponent(r.whatsapp_text)}`}>WhatsApp</a>}
        {r.type === 'cambio' && (
          <a className={(isMoto ? btnPrimary : btn) + ' inline-flex items-center'} href={`/api/cambios/admin/${r.id}/etiqueta-pdf`} target="_blank" rel="noreferrer">Etiqueta PDF</a>
        )}
        {!isMoto && r.type === 'cambio' && (
          <button className={btn} onClick={() => { navigator.clipboard?.writeText(labelText) }}>Copiar datos</button>
        )}
        {r.email_ok === false && (
          <button className={btn + ' text-red-700 border-red-300'} disabled={dis} onClick={() => act(r, 'resend_email')}>Reenviar mail</button>
        )}
        <button className={btn} onClick={() => setOpen(!open)}>{open ? 'Menos' : 'Más'}</button>
      </div>

      {open && (
        <div className="space-y-2 text-xs">
          {!isMoto && r.type === 'cambio' && <pre className="whitespace-pre-wrap rounded-md bg-gray-50 dark:bg-zinc-950 p-2 text-gray-700 dark:text-zinc-300">{labelText}</pre>}
          <div className="flex gap-2">
            <input className={input + ' flex-1'} placeholder="Nota interna" value={note} onChange={(e) => setNote(e.target.value)} />
            <button className={btn} disabled={dis} onClick={() => act(r, 'note', { text: note })}>Guardar nota</button>
          </div>
          <p className="text-gray-500">Link del cliente: <a className="underline" href={`/cambios/estado/${r.status_token}`} target="_blank" rel="noreferrer">estado</a> · Envío original: {r.shipping_option}</p>
          <ul className="text-gray-400 space-y-0.5">
            {(r.events || []).map((ev, i) => <li key={i}>{new Date(ev.at).toLocaleString('es-AR')} — {ev.type}{ev.detail ? ` (${ev.detail})` : ''}</li>)}
          </ul>
          <button className={btn} disabled={dis} onClick={() => act(r, 'resend_email')}>Reenviar el mail de este estado</button>
          {r.status !== 'cancelado' && (
            <button className={btn + ' text-red-600'} disabled={dis} onClick={() => { if (window.confirm(`¿Cancelar ${r.code}?`)) act(r, 'cancel') }}>Cancelar solicitud</button>
          )}
        </div>
      )}
    </div>
  )
}
