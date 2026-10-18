'use client'

import { useEffect, useMemo, useState } from 'react'
import MotoLabels from './MotoLabels'
import ReasonsReport from './ReasonsReport'

type Item = {
  product_id: number; variant_id: number | null; name: string; variant_label: string; quantity: number; reason?: string
  new_variant_id?: number | null; new_variant_label?: string | null; new_product_name?: string | null; price_diff?: number | null; tn_stock: number | null; stock_alert: boolean
  new_product_id?: number | null; image?: string | null; new_image?: string | null
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
  const [tab, setTab] = useState<'activos' | 'stock' | 'historial' | 'moto' | 'motivos'>('activos')
  const [motoCount, setMotoCount] = useState<number | null>(null)
  const [busy, setBusy] = useState<string | null>(null)
  const [flash, setFlash] = useState('')
  const [stage, setStage] = useState<Stage | 'todos'>('todos')
  const [q, setQ] = useState('')

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
      else if (j.stockError) alertMsg(`${row.code}: guardado, pero el STOCK no se movió en Tiendanube (${j.stockError}). Quedó en "Ajustes de stock".`)
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
      // La reserva se aplica sola al confirmar el cambio; si quedó pendiente (falló Tiendanube o es un cambio viejo), aparece acá
      if (!r.stock_out_done && r.items.some((it) => it.new_variant_id)) {
        for (const it of r.items) out.push({ row: r, kind: 'out', text: `${it.quantity} × ${shortName(it.new_product_name || it.name)} · ${it.new_variant_label}` })
      }
      if (r.received_at && r.item_condition === 'ok' && !r.stock_in_done) {
        for (const it of r.items) out.push({ row: r, kind: 'in', text: `${it.quantity} × ${shortName(it.name)} · ${it.variant_label}` })
      }
      if (r.received_at && r.item_condition === 'fallada' && !r.stock_in_done) {
        for (const it of r.items) out.push({ row: r, kind: 'skip', text: `${it.quantity} × ${shortName(it.name)} · ${it.variant_label}` })
      }
    }
    return out
  }, [rows])

  const stockLog = useMemo(() => {
    const out: { at: string; code: string; type: string; detail: string | null }[] = []
    for (const r of rows) for (const e of r.events || []) {
      if (['stock_reserva', 'stock_ingreso', 'stock_liberado', 'stock_error'].includes(e.type)) out.push({ at: e.at, code: r.code, type: e.type, detail: e.detail })
    }
    return out.sort((a, b) => b.at.localeCompare(a.at)).slice(0, 25)
  }, [rows])

  const alerts = active.filter((r) => r.items.some((i) => i.stock_alert))
  const stageCount = (id: Stage) => active.filter((r) => stageOf(r) === id).length
  const match = (r: Row) => {
    const t = q.trim().toLowerCase().replace(/^#/, '')
    if (!t) return true
    return [r.code, r.customer_name, r.order_number, r.email, r.phone].some((x) => (x || '').toLowerCase().includes(t))
  }
  const ORDER: Record<string, number> = { pago: 0, coordinar: 1, despachar: 2, esperando: 3, whatsapp: 4 }
  const shown = (tab === 'activos'
    ? active.filter((r) => stage === 'todos' || stageOf(r) === stage).sort((x, y) => (ORDER[stageOf(x) || ''] ?? 9) - (ORDER[stageOf(y) || ''] ?? 9) || x.created_at.localeCompare(y.created_at))
    : history).filter(match)

  return (
    <div className={variant === 'standalone' ? 'mx-auto max-w-3xl p-4 space-y-4' : 'p-4 sm:p-6 max-w-5xl space-y-4'}>
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-xl font-semibold text-gray-900 dark:text-white">{variant === 'standalone' && userName ? `Hola ${userName}` : 'Cambios'}</h1>
          <p className="text-xs text-gray-500 dark:text-zinc-400">Las prendas se reservan y reingresan solas en Tiendanube. Arriba ves cuántos cambios hay en cada etapa: tocá una para filtrar.</p>
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
        {([['activos', `Activos (${active.length})`], ['stock', `Ajustes de stock (${new Set(stockTasks.filter((t) => t.kind !== 'skip').map((t) => t.row.id)).size})`], ['historial', `Historial (${history.length})`], ['moto', `Despacho moto${motoCount != null ? ` (${motoCount})` : ''}`], ['motivos', 'Motivos']] as const).map(([k, l]) => (
          <button key={k} onClick={() => setTab(k)}
            className={`px-3 py-2 text-sm -mb-px border-b-2 whitespace-nowrap ${tab === k ? 'border-zinc-900 dark:border-white font-medium text-gray-900 dark:text-white' : 'border-transparent text-gray-500'}`}>{l}</button>
        ))}
      </div>

      {!data && !err && <p className="text-sm text-gray-500">Cargando…</p>}

      {tab === 'moto' && <MotoLabels onCount={setMotoCount} />}
      {tab === 'motivos' && data && <ReasonsReport rows={rows} reasons={data.reasons} />}

      {tab === 'stock' && (
        <div className="space-y-4">
          <p className="text-xs text-gray-600 dark:text-zinc-400">
            El stock se mueve solo en Tiendanube: <b>resta</b> la prenda nueva cuando el cliente confirma, la <b>devuelve</b> si se cancela y <b>suma</b> la que vuelve cuando marcás &quot;Prenda recibida OK&quot; (las falladas no). Acá aparece solo lo que no se pudo hacer solo.
          </p>
          {stockTasks.length === 0 && <div className={card + ' p-4 text-sm text-gray-500'}>No hay ajustes pendientes: todo el stock está al día.</div>}
          {Array.from(new Set(stockTasks.map((t) => t.row.id))).map((id) => {
            const ts = stockTasks.filter((t) => t.row.id === id)
            const row = ts[0].row
            return (['out', 'in', 'skip'] as const).filter((k) => ts.some((t) => t.kind === k)).map((k) => (
              <div key={id + k} className={card + ' p-3 space-y-2'}>
                <div className="flex flex-wrap items-center gap-2">
                  <span className="font-semibold text-sm text-gray-900 dark:text-white">{row.code}</span>
                  <span className="text-xs text-gray-500">{row.customer_name} · {row.status_label}</span>
                  <span className={`ml-auto text-[11px] px-2 py-0.5 rounded-full font-medium ${k === 'out' ? 'bg-amber-100 text-amber-800' : k === 'in' ? 'bg-emerald-100 text-emerald-800' : 'bg-gray-100 text-gray-600'}`}>
                    {k === 'out' ? 'Falta descontar la prenda nueva' : k === 'in' ? 'Falta sumar la prenda devuelta' : 'Llegó fallada: no se suma'}
                  </span>
                </div>
                <ul className="text-sm space-y-0.5">
                  {ts.filter((t) => t.kind === k).map((t, i) => <li key={i} className={k === 'skip' ? 'text-gray-500 line-through' : 'text-gray-800 dark:text-zinc-200'}>{t.text}</li>)}
                </ul>
                <div className="flex flex-wrap gap-2">
                  {k !== 'skip' && (
                    <button className={btnPrimary} disabled={busy !== null} onClick={() => act(row, k === 'out' ? 'stock_apply_out' : 'stock_apply_in')}>
                      {k === 'out' ? 'Descontar en Tiendanube' : 'Sumar en Tiendanube'}
                    </button>
                  )}
                  <button className={btn} disabled={busy !== null} onClick={() => act(row, k === 'out' ? 'stock_out' : 'stock_in', { value: true })}>
                    {k === 'skip' ? 'Entendido' : 'Ya lo hice a mano'}
                  </button>
                </div>
              </div>
            ))
          })}
          {stockLog.length > 0 && (
            <div>
              <p className="text-xs font-medium text-gray-700 dark:text-zinc-300 mb-1.5">Movimientos recientes</p>
              <ul className={card + ' divide-y divide-gray-100 dark:divide-zinc-800 text-xs'}>
                {stockLog.map((e, i) => (
                  <li key={i} className="px-3 py-2 flex gap-2">
                    <span className="text-gray-400 shrink-0">{new Date(e.at).toLocaleString('es-AR', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' })}</span>
                    <span className="text-gray-500 shrink-0">{e.code}</span>
                    <span className={e.type === 'stock_error' ? 'text-red-700' : 'text-gray-800 dark:text-zinc-200'}>
                      {e.type === 'stock_reserva' ? 'Reservado ' : e.type === 'stock_ingreso' ? 'Reingresado ' : e.type === 'stock_liberado' ? 'Liberado ' : 'No se pudo: '}{e.detail}
                    </span>
                  </li>
                ))}
              </ul>
            </div>
          )}
        </div>
      )}

      {(tab === 'activos' || tab === 'historial') && (
        <div className="space-y-3">
          {tab === 'activos' && (
            <div className="grid grid-cols-2 sm:grid-cols-5 gap-2">
              {STAGES.map((st) => {
                const n = stageCount(st.id)
                const on = stage === st.id
                return (
                  <button key={st.id} title={st.hint} onClick={() => setStage(on ? 'todos' : st.id)}
                    className={`text-left rounded-xl border p-3 transition-colors ${on ? 'border-zinc-900 bg-zinc-900 text-white dark:bg-white dark:text-zinc-900' : 'border-gray-200 dark:border-zinc-800 bg-white dark:bg-zinc-900'} ${n === 0 && !on ? 'opacity-60' : ''}`}>
                    <span className="block text-2xl font-bold leading-none">{n}</span>
                    <span className={`block text-xs mt-1 ${on ? '' : 'text-gray-600 dark:text-zinc-400'}`}>{st.label}</span>
                  </button>
                )
              })}
            </div>
          )}
          <div className="flex items-center gap-2">
            <input className={input + ' flex-1 h-9 text-sm'} placeholder="Buscar por código, nombre, orden, mail o teléfono" value={q} onChange={(e) => setQ(e.target.value)} />
            {(stage !== 'todos' || q) && <button className={btn + ' h-9'} onClick={() => { setStage('todos'); setQ('') }}>Ver todos</button>}
          </div>
          {shown.length === 0 && data && <p className="text-sm text-gray-500">Nada por acá.</p>}
          {shown.map((r) => <ExchangeCard key={r.id} r={r} busy={busy} act={act} reasons={data?.reasons ?? []} reload={load} notify={alertMsg} />)}
        </div>
      )}
    </div>
  )
}

// ── Etapas para el resumen y los filtros ──
type Stage = 'pago' | 'coordinar' | 'esperando' | 'despachar' | 'whatsapp'
const STAGES: { id: Stage; label: string; hint: string }[] = [
  { id: 'pago', label: 'Esperando pago', hint: 'Revisar comprobantes y confirmar transferencias' },
  { id: 'coordinar', label: 'Para coordinar', hint: 'Moto o etiqueta de Correo pendiente' },
  { id: 'esperando', label: 'Esperando prenda', hint: 'La moto tiene que pasar o el cliente tiene que despachar' },
  { id: 'despachar', label: 'Para despachar', hint: 'Prenda recibida: mandar la nueva' },
  { id: 'whatsapp', label: 'Por WhatsApp', hint: 'Otro modelo u otros motivos' },
]
function stageOf(r: Row): Stage | null {
  if (r.type !== 'cambio') return r.status === 'revision' ? 'whatsapp' : null
  const moto = r.zone === 'caba' || r.zone === 'moto_gba' || r.zone === 'retiro'
  if (r.status === 'pendiente_pago') return 'pago'
  if (r.status === 'pago_confirmado') return 'coordinar'
  if (r.status === 'etiqueta_enviada') return 'esperando'
  if (r.status === 'despachado' && moto && !r.received_at) return 'esperando'
  if (r.status === 'prenda_recibida') return 'despachar'
  return null
}

const SIZES = ['XXS', 'XS', 'S', 'M', 'L', 'XL', 'XXL', '2XL', 'XXXL', '3XL', '4XL']
function parts(label: string | null | undefined) {
  const ps = (label || '').split('/').map((x) => x.trim()).filter(Boolean)
  const size = ps.find((x) => SIZES.includes(x.toUpperCase()) || /^\d{1,2}$/.test(x)) || ''
  return { size, color: ps.filter((x) => x !== size).join(' / ') }
}
const shortName = (n: string | null | undefined) => (n || '').replace(/100\s*%/g, '').replace(/\b(Algod[oó]n|Premium)\b/gi, '').replace(/\s+/g, ' ').trim()
function ago(s: string) {
  const h = Math.floor((Date.now() - new Date(s).getTime()) / 3600000)
  if (h < 1) return 'recién'
  if (h < 24) return `hace ${h} h`
  const d = Math.floor(h / 24)
  return d === 1 ? 'hace 1 día' : `hace ${d} días`
}

function Garment({ img, name, label, tone }: { img?: string | null; name: string; label: string; tone: 'out' | 'in' }) {
  const p = parts(label)
  return (
    <div className="flex items-center gap-2 sm:gap-2.5 min-w-0">
      {img
        ? <img src={img} alt="" className="w-10 h-12 sm:w-12 sm:h-14 rounded-md object-cover bg-gray-100 shrink-0" />
        : <span className="w-10 h-12 sm:w-12 sm:h-14 rounded-md bg-gray-100 dark:bg-zinc-800 shrink-0" />}
      <span className="min-w-0">
        <span className={`block text-[10px] font-semibold uppercase tracking-wide ${tone === 'out' ? 'text-gray-500' : 'text-[#8B6914]'}`}>{tone === 'out' ? 'Devuelve' : 'Recibe'}</span>
        <span className="block text-[13px] font-medium text-gray-900 dark:text-white leading-tight break-words line-clamp-2">{shortName(name)}</span>
        <span className="flex flex-wrap items-center gap-x-1.5 gap-y-0.5 mt-1">
          {p.size && <span className={`inline-flex items-center justify-center min-w-[28px] h-6 px-1.5 rounded text-xs font-bold ${tone === 'out' ? 'bg-gray-100 text-gray-800 dark:bg-zinc-800 dark:text-zinc-200' : 'bg-zinc-900 text-white dark:bg-white dark:text-zinc-900'}`}>{p.size}</span>}
          {p.color && <span className="text-xs text-gray-600 dark:text-zinc-400 leading-tight">{p.color}</span>}
        </span>
      </span>
    </div>
  )
}

function Progress({ r }: { r: Row }) {
  if (r.type !== 'cambio') return null
  const moto = r.zone === 'caba' || r.zone === 'moto_gba' || r.zone === 'retiro'
  const steps = moto
    ? [['Pago', !!r.paid_at], ['Moto coordinada', !!r.dispatched_at], ['Cambio hecho', !!r.received_at]] as const
    : [['Pago', !!r.paid_at], ['Etiqueta', !!r.label_sent_at || r.status === 'etiqueta_enviada' || !!r.received_at], ['Prenda recibida', !!r.received_at], ['Despachado', !!r.tracking_number]] as const
  return (
    <ol className="flex items-center gap-1.5">
      {steps.map(([l, done], i) => (
        <li key={l} className="flex items-center gap-1.5">
          <span className={`w-2 h-2 rounded-full ${done ? 'bg-[#B8892B]' : 'bg-gray-300 dark:bg-zinc-700'}`} />
          <span className={`text-[11px] ${done ? 'text-gray-800 dark:text-zinc-200' : 'text-gray-400'}`}>{l}</span>
          {i < steps.length - 1 && <span className="w-3 h-px bg-gray-300 dark:bg-zinc-700" />}
        </li>
      ))}
    </ol>
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
  const reasonLabel = (id?: string) => (reasons.find((x) => x.id === id)?.label || id || '').replace(' (te atendemos por WhatsApp)', '')
  const isMoto = r.zone === 'caba' || r.zone === 'moto_gba' || r.zone === 'retiro'
  const a = r.address || {}
  const labelText = [a.branch ? `Punto de retiro: ${a.branch}` : '', a.name || r.customer_name, (a.street || '') + (a.floor ? ` ${a.floor}` : ''), [a.locality, a.city].filter(Boolean).join(', '), `${a.province || ''} (${a.zipcode || ''})`, r.phone ? `Tel: ${r.phone}` : ''].filter(Boolean).join('\n')
  const phone = waPhone(r.phone)
  const dis = busy !== null
  const diff = r.items.reduce((s, it) => s + (Number(it.price_diff) || 0), 0)
  const total = r.shipping_amount == null ? null : r.shipping_amount + diff
  const units = r.items.reduce((s, it) => s + (it.quantity || 1), 0)
  const closed = r.status === 'cancelado' || r.status === 'resuelto' || (r.status === 'despachado' && (!isMoto || !!r.received_at))

  // Próximo paso: qué hay que hacer ahora, en una frase
  let next = ''
  if (r.type !== 'cambio') next = r.status === 'revision' ? 'Resolver con el cliente por WhatsApp.' : ''
  else if (r.status === 'pendiente_pago') next = r.shipping_amount == null ? 'Cargá el monto del envío para que el cliente pueda transferir.'
    : r.receipt_url ? `Revisá el comprobante (${fmt(total)}) y confirmá la transferencia.` : `Esperando que el cliente transfiera ${fmt(total)}.`
  else if (r.status === 'pago_confirmado') next = r.zone === 'retiro' ? 'Coordiná día y horario con el cliente.' : isMoto ? 'Coordiná la moto: retira la prenda y entrega la nueva en el mismo viaje.' : 'Generá la etiqueta en Mi Correo y subila: el cliente la recibe por mail.'
  else if (r.status === 'etiqueta_enviada') next = 'Esperando que el cliente despache la prenda. Cuando llegue, marcá cómo vino.'
  else if (r.status === 'despachado' && isMoto && !r.received_at) next = `La moto pasa ${r.moto_date || 'en la fecha coordinada'}. Cuando vuelva, marcá cómo llegó la prenda.`
  else if (r.status === 'prenda_recibida') next = 'Despachá la prenda nueva por Correo y cargá el número de seguimiento.'

  return (
    <article className={card + ' overflow-hidden'}>
      {/* Encabezado */}
      <header className="px-4 pt-4 pb-3 flex flex-wrap items-start justify-between gap-x-3 gap-y-2">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <span className="text-base font-bold text-gray-900 dark:text-white">{r.code}</span>
            <span className={`text-[11px] px-2 py-0.5 rounded-full font-medium ${statusTone(r.status)}`}>{r.status_label}</span>
            <span className="text-[11px] px-2 py-0.5 rounded-full bg-gray-100 text-gray-700 dark:bg-zinc-800 dark:text-zinc-300">{isMoto ? (r.zone === 'retiro' ? '📍 ' : '🛵 ') : '📦 '}{r.zone_label}</span>
            {r.type !== 'cambio' && <span className="text-[11px] px-2 py-0.5 rounded-full bg-violet-100 text-violet-800">{r.type === 'reembolso' ? 'Reembolso' : 'Otro modelo'}</span>}
            {r.email_ok === false && <span className="text-[11px] px-2 py-0.5 rounded-full bg-red-100 text-red-800 font-medium" title={r.email_detail || ''}>Mail no enviado</span>}
          </div>
          <p className="mt-1 text-sm text-gray-900 dark:text-white">{r.customer_name} <span className="text-xs text-gray-500">· Orden #{r.order_number} · {ago(r.created_at)}</span></p>
        </div>
        <Progress r={r} />
      </header>

      {/* Prendas: qué devuelve y qué recibe */}
      <div className="px-4 pb-3">
        <p className="text-[11px] font-semibold uppercase tracking-wide text-gray-500 mb-2">{units} {units === 1 ? 'prenda' : 'prendas'} a cambiar</p>
        <ul className="space-y-2">
          {r.items.map((it, i) => (
            <li key={i} className="rounded-lg border border-gray-100 dark:border-zinc-800 bg-gray-50/60 dark:bg-zinc-950/40 p-2.5">
              <div className="grid grid-cols-[1fr_auto_1fr] items-center gap-2">
                <Garment img={it.image} name={it.name} label={it.variant_label} tone="out" />
                <span className="text-gray-400 text-lg" aria-hidden>→</span>
                {it.new_variant_label
                  ? <Garment img={it.new_image} name={it.new_product_name || it.name} label={it.new_variant_label} tone="in" />
                  : <span className="text-xs text-gray-500">A definir por WhatsApp</span>}
              </div>
              <div className="flex flex-wrap items-center gap-1.5 mt-2">
                {it.quantity > 1 && <span className="text-[11px] px-2 py-0.5 rounded-full bg-zinc-900 text-white font-semibold">× {it.quantity}</span>}
                {it.reason && <span className="text-[11px] px-2 py-0.5 rounded-full bg-white dark:bg-zinc-900 border border-gray-200 dark:border-zinc-700 text-gray-700 dark:text-zinc-300">{reasonLabel(it.reason)}</span>}
                {it.new_product_name && it.new_product_name !== it.name && <span className="text-[11px] px-2 py-0.5 rounded-full bg-violet-50 text-violet-800 border border-violet-200">Cambia de modelo</span>}
                {it.price_diff ? <span className="text-[11px] px-2 py-0.5 rounded-full bg-[#FBF6EA] text-[#6B5110] border border-[#E9D5A6] font-medium">Paga diferencia {fmt(it.price_diff)}</span> : null}
                {it.stock_alert && <span className="text-[11px] px-2 py-0.5 rounded-full bg-red-100 text-red-800 font-medium">Sin stock en TN ({it.tn_stock})</span>}
              </div>
            </li>
          ))}
        </ul>
        {r.customer_note && <p className="mt-2 text-xs italic text-gray-600 dark:text-zinc-400">“{r.customer_note}”</p>}
      </div>

      {/* Próximo paso */}
      {!closed && next && (
        <div className="mx-4 mb-3 rounded-lg border border-[#E9D5A6] bg-[#FBF6EA] dark:bg-[#2A2214] dark:border-[#5A4520] p-3 space-y-2.5">
          <p className="text-[13px] text-[#4A380B] dark:text-[#E9C77A]"><b>Próximo paso:</b> {next}</p>
          <div className="flex flex-wrap items-center gap-2">
            {r.type === 'cambio' && r.status === 'pendiente_pago' && (
              <>
                {r.receipt_url && <a href={r.receipt_url} target="_blank" rel="noreferrer" className={btn + ' inline-flex items-center bg-white'}>Ver comprobante</a>}
                {r.shipping_amount == null && (
                  <>
                    <input className={input + ' w-28'} placeholder="Monto envío" inputMode="numeric" value={amount} onChange={(e) => setAmount(e.target.value)} />
                    <button className={btn + ' bg-white'} disabled={dis || !amount} onClick={() => act(r, 'set_amount', { amount: Number(amount.replace(/\D/g, '')) })}>Guardar monto</button>
                  </>
                )}
                <button className={btnPrimary} disabled={dis || r.shipping_amount == null} onClick={() => act(r, 'confirm_payment')}>Transferencia OK</button>
              </>
            )}
            {r.type === 'cambio' && isMoto && (r.status === 'pago_confirmado' || (r.status === 'despachado' && !r.received_at)) && (
              <>
                <input className={input + ' w-52'} placeholder={r.zone === 'retiro' ? 'Ej: sábado 10 a 13 hs' : 'Ej: lunes 14 a 20 hs'} value={moto} onChange={(e) => setMoto(e.target.value)} />
                <button className={r.status === 'pago_confirmado' ? btnPrimary : btn + ' bg-white'} disabled={dis || !moto} onClick={() => act(r, 'set_moto', { date: moto })}>
                  {r.status === 'pago_confirmado' ? (r.zone === 'retiro' ? 'Día coordinado' : 'Moto coordinada') : 'Cambiar día'}
                </button>
              </>
            )}
            {r.type === 'cambio' && !isMoto && (r.status === 'pago_confirmado' || r.status === 'etiqueta_enviada') && (
              <>
                <label className={btn + ' bg-white inline-flex items-center cursor-pointer'}>
                  {labelFile ? labelFile.name.slice(0, 22) : r.label_url ? 'Elegir otra etiqueta' : 'Elegir etiqueta (PDF)'}
                  <input type="file" accept="application/pdf,image/*" className="sr-only" onChange={(e) => setLabelFile(e.target.files && e.target.files[0] ? e.target.files[0] : null)} />
                </label>
                {labelFile && <button className={btnPrimary} disabled={dis || uploadingLabel} onClick={uploadLabel}>{uploadingLabel ? 'Subiendo…' : 'Subir y avisar al cliente'}</button>}
                {r.label_url && <a href={r.label_url} target="_blank" rel="noreferrer" className={btn + ' inline-flex items-center bg-white'}>Ver etiqueta</a>}
              </>
            )}
            {r.type === 'cambio' && ((!isMoto && (r.status === 'pago_confirmado' || r.status === 'etiqueta_enviada')) || (isMoto && r.status === 'despachado' && !r.received_at)) && (
              <>
                <button className={btnPrimary} disabled={dis} onClick={() => act(r, 'mark_received', { condition: 'ok' })}>{r.zone === 'retiro' ? 'Cambio hecho · prenda OK' : 'Prenda recibida OK'}</button>
                <button className={btn + ' bg-white'} disabled={dis} onClick={() => act(r, 'mark_received', { condition: 'fallada' })}>Llegó fallada</button>
              </>
            )}
            {r.type === 'cambio' && !isMoto && r.status === 'prenda_recibida' && (
              <>
                <input className={input + ' w-48'} placeholder="N° de seguimiento" value={tracking} onChange={(e) => setTracking(e.target.value)} />
                <button className={btnPrimary} disabled={dis || !tracking} onClick={() => act(r, 'set_tracking', { tracking })}>Despachado</button>
              </>
            )}
            {r.type !== 'cambio' && r.status === 'revision' && (
              <button className={btnPrimary} disabled={dis} onClick={() => act(r, 'resolve')}>{r.type === 'reembolso' ? 'Reintegrado' : 'Resuelto'}</button>
            )}
          </div>
        </div>
      )}

      {/* Datos y herramientas */}
      <div className="px-4 py-3 border-t border-gray-100 dark:border-zinc-800 grid sm:grid-cols-3 gap-3 text-xs text-gray-700 dark:text-zinc-300">
        <div>
          <p className="text-[11px] font-semibold uppercase tracking-wide text-gray-500 mb-1">Contacto</p>
          <p className="truncate">{r.email}</p>
          {r.phone && <p>{r.phone}</p>}
        </div>
        <div>
          <p className="text-[11px] font-semibold uppercase tracking-wide text-gray-500 mb-1">{isMoto ? 'Dirección' : 'Despacha desde'}</p>
          {isMoto
            ? <p>{a.street ? <>{a.street}{a.floor ? ` ${a.floor}` : ''}{a.locality ? ` · ${a.locality}` : ''}{a.notes ? <span className="text-gray-500"> · {a.notes}</span> : null}</> : <span className="text-gray-400">Sin cargar</span>}</p>
            : <p>{a.dispatch_branch?.name ? <>{a.dispatch_branch.name}{a.dispatch_branch.address ? ` · ${a.dispatch_branch.address}` : ''}{a.dispatch_branch.locality ? ` · ${a.dispatch_branch.locality}` : ''}</> : <span className="text-gray-400">Sin sucursal</span>}</p>}
          {r.moto_date && <p className="mt-0.5">Moto: <b>{r.moto_date}</b></p>}
          {r.tracking_number && <p className="mt-0.5">Seguimiento: <b>{r.tracking_number}</b></p>}
        </div>
        <div>
          <p className="text-[11px] font-semibold uppercase tracking-wide text-gray-500 mb-1">Pago</p>
          {r.type === 'cambio' ? (
            <p><b className="text-gray-900 dark:text-white">{total === 0 ? 'Sin costo' : fmt(total)}</b>{diff > 0 && <span className="text-gray-500"> (envío {fmt(r.shipping_amount)} + dif. {fmt(diff)})</span>}</p>
          ) : <p className="text-gray-400">—</p>}
          <p className="mt-0.5">{r.paid_at ? `Confirmado ${date(r.paid_at)}` : r.receipt_url ? <a href={r.receipt_url} target="_blank" rel="noreferrer" className="underline">Comprobante {date(r.receipt_uploaded_at)}</a> : <span className="text-gray-400">Sin comprobante</span>}</p>
          {r.received_at && <p className="mt-0.5">Prenda {r.item_condition === 'fallada' ? <b className="text-red-700">fallada</b> : 'OK'} · {date(r.received_at)}</p>}
        </div>
      </div>

      <footer className="px-4 py-2.5 border-t border-gray-100 dark:border-zinc-800 flex flex-wrap items-center gap-2">
        {phone && <a className={btn + ' inline-flex items-center'} target="_blank" rel="noreferrer" href={`https://wa.me/${phone}?text=${encodeURIComponent(r.whatsapp_text)}`}>WhatsApp</a>}
        {r.type === 'cambio' && <a className={btn + ' inline-flex items-center'} href={`/api/cambios/admin/${r.id}/etiqueta-pdf`} target="_blank" rel="noreferrer">Etiqueta PDF</a>}
        {!isMoto && r.type === 'cambio' && <button className={btn} onClick={() => { navigator.clipboard?.writeText(labelText); notify('Datos copiados') }}>Copiar datos</button>}
        {r.email_ok === false && <button className={btn + ' text-red-700 border-red-300'} disabled={dis} onClick={() => act(r, 'resend_email')}>Reenviar mail</button>}
        <span className="flex-1" />
        <button className={btn} onClick={() => setOpen(!open)}>{open ? 'Ocultar detalle' : 'Historial y más'}</button>
      </footer>

      {open && (
        <div className="px-4 pb-4 space-y-2 text-xs">
          {!isMoto && r.type === 'cambio' && <pre className="whitespace-pre-wrap rounded-md bg-gray-50 dark:bg-zinc-950 p-2 text-gray-700 dark:text-zinc-300">{labelText}</pre>}
          <div className="flex gap-2">
            <input className={input + ' flex-1'} placeholder="Nota interna" value={note} onChange={(e) => setNote(e.target.value)} />
            <button className={btn} disabled={dis} onClick={() => act(r, 'note', { text: note })}>Guardar nota</button>
          </div>
          <p className="text-gray-500">Link del cliente: <a className="underline" href={`/cambios/estado/${r.status_token}`} target="_blank" rel="noreferrer">estado</a> · Envío original: {r.shipping_option}</p>
          <ul className="text-gray-500 space-y-0.5">
            {(r.events || []).map((ev, i) => <li key={i}>{new Date(ev.at).toLocaleString('es-AR')} — {ev.type}{ev.detail ? ` (${ev.detail})` : ''}</li>)}
          </ul>
          <div className="flex flex-wrap gap-2">
            <button className={btn} disabled={dis} onClick={() => act(r, 'resend_email')}>Reenviar el mail de este estado</button>
            {r.status !== 'cancelado' && (
              <button className={btn + ' text-red-600'} disabled={dis} onClick={() => { if (window.confirm(`¿Cancelar ${r.code}? Se libera la prenda reservada.`)) act(r, 'cancel') }}>Cancelar solicitud</button>
            )}
          </div>
        </div>
      )}
    </article>
  )
}
