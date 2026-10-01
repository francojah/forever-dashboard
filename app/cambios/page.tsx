'use client'

import { useState } from 'react'
import { Card, Btn, ErrorBox, inputCls, selectCls, money, waLink } from './ui'

type Option = { variant_id: number; label: string; same: boolean; available: number }
type Item = {
  key: string; name: string; variant_label: string; quantity: number; image: string | null
  exchangeable: boolean; options: Option[]
}
type Lookup = {
  ok: true
  order: { number: number; customerName: string; hasPhone: boolean; zone: string; zoneLabel: string; shippingAmount: number | null; deadline: string }
  items: Item[]
  active: { code: string; token: string; type: string; status: string }[]
  reasons: { id: string; label: string }[]
  alias: string
  whatsapp: string
}
type Sel = { checked: boolean; reason: string; newVariant: string }
type Kind = 'cambio' | 'otro_modelo'

const KINDS: { id: Kind; label: string; hint: string }[] = [
  { id: 'cambio', label: 'Cambiar talle o color', hint: 'Mismo modelo, otro talle o color.' },
  { id: 'otro_modelo', label: 'Quiero otro modelo', hint: 'Lo coordinamos por WhatsApp.' },
]

export default function CambiosPage() {
  const [orderNumber, setOrderNumber] = useState('')
  const [email, setEmail] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [data, setData] = useState<Lookup | null>(null)
  const [kind, setKind] = useState<Kind>('cambio')
  const [sel, setSel] = useState<Record<string, Sel>>({})
  const [phone, setPhone] = useState('')
  const [note, setNote] = useState('')

  async function post(url: string, body: unknown) {
    const res = await fetch(url, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) })
    return res.json()
  }

  async function onLookup() {
    setError(''); setLoading(true)
    try {
      const r = await post('/api/cambios/lookup', { orderNumber, email })
      if (!r.ok) { setError(r.reason || 'No encontramos la orden.'); setLoading(false); return }
      const init: Record<string, Sel> = {}
      for (const it of r.items as Item[]) init[it.key] = { checked: r.items.length === 1, reason: '', newVariant: '' }
      setSel(init); setData(r)
    } catch {
      setError('No pudimos conectarnos. Revisá tu conexión y probá de nuevo.')
    }
    setLoading(false)
  }

  function upd(key: string, patch: Partial<Sel>) {
    setSel((s) => ({ ...s, [key]: { ...s[key], ...patch } }))
  }

  const chosen = data ? data.items.filter((it) => sel[it.key]?.checked) : []
  const otherReason = chosen.some((it) => sel[it.key].reason === 'otro')
  const missing = chosen.some((it) => !sel[it.key].reason || (kind === 'cambio' && !sel[it.key].newVariant))
  const waText = data
    ? `Hola! Quiero hacer una consulta por la orden #${data.order.number}: ` + chosen.map((it) => `${it.name} ${it.variant_label}`).join(', ')
    : ''
  const needPhone = data ? !data.order.hasPhone : false

  async function onSubmit() {
    if (!data) return
    setError(''); setLoading(true)
    try {
      const r = await post('/api/cambios/submit', {
        orderNumber, email, phone, note, type: kind,
        items: chosen.map((it) => ({ key: it.key, reason: sel[it.key].reason, new_variant_id: sel[it.key].newVariant ? Number(sel[it.key].newVariant) : null })),
      })
      if (!r.ok) { setError(r.reason || 'No pudimos registrar el pedido.'); setLoading(false); return }
      window.location.href = `/cambios/estado/${r.token}`
    } catch {
      setError('No pudimos conectarnos. Probá de nuevo.')
      setLoading(false)
    }
  }

  // ── Paso 1: buscar la orden ─────────────────────────────────────
  if (!data) {
    return (
      <div className="space-y-5">
        <div className="pt-2">
          <p className="text-xs tracking-[0.18em] text-zinc-500 uppercase">Cambios</p>
          <h1 className="text-[28px] leading-tight font-semibold mt-1">¿No te quedó como esperabas?</h1>
          <p className="text-zinc-600 mt-2 text-[15px]">Cambiá el talle o el color en un par de minutos.</p>
        </div>

        <ol className="grid grid-cols-3 gap-2">
          {[
            ['1', 'Buscá tu pedido'],
            ['2', 'Elegí talle o color'],
            ['3', 'Coordinamos el envío'],
          ].map(([n, t]) => (
            <li key={n} className="bg-white rounded-xl border border-zinc-200 px-2 py-3 text-center">
              <span className="mx-auto mb-1.5 w-6 h-6 rounded-full bg-zinc-900 text-white text-xs flex items-center justify-center">{n}</span>
              <span className="block text-[13px] leading-tight">{t}</span>
            </li>
          ))}
        </ol>

        <Card className="space-y-3">
          <label className="block">
            <span className="text-sm text-zinc-600">Número de orden</span>
            <input className={inputCls} inputMode="numeric" placeholder="Ej: 1351" value={orderNumber}
              onChange={(e) => setOrderNumber(e.target.value)} />
          </label>
          <label className="block">
            <span className="text-sm text-zinc-600">Email con el que compraste</span>
            <input className={inputCls} type="email" autoCapitalize="none" autoCorrect="off" placeholder="tu@email.com" value={email}
              onChange={(e) => setEmail(e.target.value)} />
          </label>
          {error && <ErrorBox>{error}</ErrorBox>}
          <Btn onClick={onLookup} disabled={loading || !orderNumber || !email}>{loading ? 'Buscando…' : 'Buscar mi pedido'}</Btn>
          <p className="text-xs text-zinc-500 text-center">El número de orden está en el mail de confirmación de tu compra.</p>
        </Card>

        <ul className="text-[13px] text-zinc-600 space-y-1.5 px-1">
          <li>• Tenés 10 días desde que recibiste tu pedido.</li>
          <li>• Despachamos los cambios todos los lunes.</li>
        </ul>
      </div>
    )
  }

  // ── Paso 2: elegir qué cambiar ─────────────────────────────────
  const o = data.order
  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-2xl font-semibold">{o.customerName ? `Hola ${o.customerName}` : 'Tu pedido'}</h1>
        <p className="text-zinc-600 mt-1 text-[15px]">Orden #{o.number}</p>
      </div>

      {data.active.length > 0 && (
        <Card className="bg-amber-50 border-amber-200">
          <p className="text-sm">Ya tenés una solicitud en curso para esta orden:</p>
          {data.active.map((a) => (
            <a key={a.code} href={`/cambios/estado/${a.token}`} className="block mt-1 font-medium underline">{a.code} — ver estado</a>
          ))}
        </Card>
      )}

      <Card className="space-y-2">
        <p className="text-sm font-medium">¿Qué necesitás?</p>
        {KINDS.map((k) => (
          <label key={k.id} className={`flex items-start gap-3 rounded-lg border p-3 ${kind === k.id ? 'border-zinc-900 bg-zinc-50' : 'border-zinc-200'}`}>
            <input type="radio" name="kind" className="mt-1" checked={kind === k.id} onChange={() => setKind(k.id)} />
            <span><span className="block text-[15px]">{k.label}</span><span className="block text-xs text-zinc-500">{k.hint}</span></span>
          </label>
        ))}
      </Card>

      <Card className="space-y-3">
        <p className="text-sm font-medium">{data.items.length > 1 ? 'Elegí las prendas' : 'Tu prenda'}</p>
        {data.items.map((it) => {
          const s = sel[it.key]
          const disabled = !it.exchangeable
          return (
            <div key={it.key} className={`rounded-lg border p-3 ${s?.checked ? 'border-zinc-900' : 'border-zinc-200'} ${disabled ? 'opacity-50' : ''}`}>
              <label className="flex items-center gap-3">
                <input type="checkbox" disabled={disabled} checked={!!s?.checked} onChange={(e) => upd(it.key, { checked: e.target.checked })} />
                {it.image && <img src={it.image} alt="" className="w-12 h-14 object-cover rounded" />}
                <span className="flex-1 min-w-0">
                  <span className="block text-[15px] leading-tight">{it.name}</span>
                  <span className="block text-xs text-zinc-500">{it.variant_label}{it.quantity > 1 ? ` · x${it.quantity}` : ''}</span>
                  {disabled && <span className="block text-xs text-zinc-500">Por higiene, esta prenda no tiene cambio</span>}
                </span>
              </label>
              {s?.checked && (
                <div className="mt-3 space-y-2">
                  <select className={selectCls} value={s.reason} onChange={(e) => upd(it.key, { reason: e.target.value })}>
                    <option value="">Motivo…</option>
                    {data.reasons.map((r) => <option key={r.id} value={r.id}>{r.label}</option>)}
                  </select>
                  {kind === 'cambio' && s.reason !== 'otro' && (
                    <select className={selectCls} value={s.newVariant} onChange={(e) => upd(it.key, { newVariant: e.target.value })}>
                      <option value="">Cambiar por…</option>
                      {it.options.map((op) => (
                        <option key={op.variant_id} value={op.variant_id} disabled={op.available < it.quantity}>
                          {op.label}{op.same ? ' (el mismo)' : ''}{op.available < it.quantity ? ' — sin stock' : ''}
                        </option>
                      ))}
                    </select>
                  )}
                </div>
              )}
            </div>
          )
        })}
      </Card>

      <Card className="space-y-3">
        <label className="block">
          <span className="text-sm text-zinc-600">WhatsApp de contacto{needPhone ? '' : ' (opcional)'}</span>
          <input className={inputCls} type="tel" placeholder="11 1234 5678" value={phone} onChange={(e) => setPhone(e.target.value)} />
        </label>
        <label className="block">
          <span className="text-sm text-zinc-600">Comentario (opcional)</span>
          <textarea className={`${inputCls} h-20 py-2`} value={note} onChange={(e) => setNote(e.target.value)} />
        </label>
      </Card>

      {otherReason && (
        <Card className="space-y-3 bg-amber-50 border-amber-200">
          <p className="text-[15px]">Para otros motivos, escribinos por WhatsApp y lo resolvemos ahí.</p>
          <a href={waLink(data.whatsapp, waText)} className="block w-full h-12 rounded-lg bg-[#25D366] text-white text-[15px] font-medium leading-[48px] text-center">Escribir por WhatsApp</a>
        </Card>
      )}

      {kind === 'cambio' && !otherReason && (
        <Card className="space-y-1">
          <div className="flex justify-between text-[15px]"><span>Envío</span><span>{o.zoneLabel}</span></div>
          <div className="flex justify-between text-[15px] font-semibold"><span>{o.shippingAmount === 0 ? 'Costo' : 'A transferir'}</span><span>{o.shippingAmount === 0 ? 'Sin costo' : money(o.shippingAmount)}</span></div>
          <p className="text-xs text-zinc-500 pt-1">
            {o.shippingAmount === 0
              ? 'Te confirmamos día y horario para hacer el cambio.'
              : o.zone === 'correo'
              ? 'Te mandamos la etiqueta de Correo Argentino para que despaches la prenda, y cuando llega te enviamos la nueva.'
              : 'Una moto retira tu prenda y te entrega la nueva en el mismo viaje.'}
            {o.shippingAmount == null && ' Te confirmamos el monto por mail y WhatsApp.'}
            {' '}Despachamos los cambios los lunes.
          </p>
        </Card>
      )}

      {error && <ErrorBox>{error}</ErrorBox>}
      {!otherReason && <Btn onClick={onSubmit} disabled={loading || !chosen.length || missing || (needPhone && phone.trim().length < 8)}>
        {loading ? 'Enviando…' : kind === 'cambio' ? 'Confirmar cambio' : 'Enviar solicitud'}
      </Btn>}
      <Btn variant="light" onClick={() => { setData(null); setError('') }}>Volver</Btn>
      <p className="text-xs text-zinc-500 text-center">
        ¿Dudas? <a className="underline" href={waLink(data.whatsapp)}>Escribinos por WhatsApp</a>
      </p>
    </div>
  )
}
