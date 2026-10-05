'use client'

import { useState } from 'react'
import { Card, Btn, Chip, ErrorBox, inputCls, money, waLink, splitLabel, sortSizes, nextMondayLabel } from './ui'
import BranchPicker, { type Branch } from './BranchPicker'

type Item = {
  key: string; product_id: number; variant_id: number | null; name: string; variant_label: string; quantity: number
  image: string | null; exchangeable: boolean; base_price: number
}
type CatVariant = { variant_id: number; label: string; price: number; available: number }
type CatProduct = { product_id: number; name: string; image: string | null; is_pack: boolean; variants: CatVariant[] }
type Lookup = {
  ok: true
  order: {
    number: number; customerName: string; hasPhone: boolean; zone: string; zoneLabel: string; shippingAmount: number | null; deadline: string
    provinceCode?: string; needsAddress?: boolean; needsBranch?: boolean
  }
  items: Item[]
  catalog: CatProduct[]
  active: { code: string; token: string; type: string; status: string }[]
  reasons: { id: string; label: string }[]
  alias: string
  whatsapp: string
  provincias?: { code: string; name: string }[]
  storeUrl?: string
}
type Sel = { checked: boolean; reason: string; productId: string; color: string; size: string }

const targetsFor = (it: Item, catalog: CatProduct[]) => {
  const list = catalog.filter((c) => c.product_id === it.product_id || !c.is_pack)
  return list.sort((a, b) => (a.product_id === it.product_id ? -1 : b.product_id === it.product_id ? 1 : 0))
}
const diffFor = (it: Item, v: CatVariant | undefined) => (v ? Math.max(0, Math.round((v.price - it.base_price) * it.quantity)) : 0)
const minPrice = (p: CatProduct) => Math.min(...p.variants.map((v) => v.price))

function findVariant(prod: CatProduct | undefined, color: string, size: string) {
  if (!prod) return undefined
  return prod.variants.find((v) => {
    const s = splitLabel(v.label)
    return s.color === color && s.size === size
  })
}

export default function CambiosPage() {
  const [orderNumber, setOrderNumber] = useState('')
  const [email, setEmail] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [data, setData] = useState<Lookup | null>(null)
  const [sel, setSel] = useState<Record<string, Sel>>({})
  const [phone, setPhone] = useState('')
  const [note, setNote] = useState('')
  const [ship, setShip] = useState({ full_name: '', phone: '', street: '', floor: '', locality: '', notes: '' })
  const [branch, setBranch] = useState<Branch | null>(null)
  const setS = (k: keyof typeof ship, v: string) => setShip((x) => ({ ...x, [k]: v }))

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
      const exch = (r.items as Item[]).filter((i) => i.exchangeable)
      for (const it of r.items as Item[]) {
        init[it.key] = { checked: exch.length === 1 && it.exchangeable, reason: '', productId: String(it.product_id), color: '', size: '' }
      }
      setSel(init); setData(r)
      if (typeof window !== 'undefined') window.scrollTo(0, 0)
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
  const variantOf = (it: Item) => {
    const s = sel[it.key]
    const prod = data?.catalog.find((c) => String(c.product_id) === s?.productId)
    return findVariant(prod, s?.color ?? '', s?.size ?? '')
  }
  const missing = chosen.some((it) => !sel[it.key].reason || !variantOf(it))
  const needPhone = data ? !data.order.hasPhone : false
  const diff = chosen.reduce((a, it) => a + diffFor(it, variantOf(it)), 0)
  const shipping = data ? data.order.shippingAmount : null
  const total = shipping == null ? null : shipping + diff
  const needsAddress = !!data?.order.needsAddress
  const needsBranch = !!data?.order.needsBranch
  const addressOk = !needsAddress || (
    ship.full_name.trim().split(/\s+/).length >= 2 && ship.phone.replace(/\D/g, '').length >= 8 &&
    ship.street.trim().length >= 5 && /\d/.test(ship.street) && ship.locality.trim().length >= 2
  )
  const branchOk = !needsBranch || !!branch
  const canSubmit = !!chosen.length && !missing && addressOk && branchOk && !(!needsAddress && needPhone && phone.trim().length < 8)
  const pendingHint = !chosen.length ? 'Elegí la prenda que querés cambiar'
    : missing ? 'Completá motivo, color y talle'
    : !addressOk ? 'Completá los datos para la moto'
    : !branchOk ? 'Elegí la sucursal de Correo Argentino'
    : !canSubmit ? 'Completá tu WhatsApp' : ''
  const waText = data
    ? `Hola! Quiero hacer una consulta por la orden #${data.order.number}: ` + chosen.map((it) => `${it.name} ${it.variant_label}`).join(', ')
    : ''

  async function onSubmit() {
    if (!data) return
    setError(''); setLoading(true)
    try {
      const r = await post('/api/cambios/submit', {
        orderNumber, email, phone: needsAddress ? ship.phone : phone, note, type: 'cambio',
        shipping: needsAddress ? ship : undefined,
        branch: needsBranch ? branch : undefined,
        items: chosen.map((it) => ({
          key: it.key, reason: sel[it.key].reason,
          new_product_id: Number(sel[it.key].productId), new_variant_id: variantOf(it)?.variant_id,
        })),
      })
      if (!r.ok) { setError(r.reason || 'No pudimos registrar el pedido.'); setLoading(false); return }
      window.location.href = `/cambios/estado/${r.token}`
    } catch {
      setError('No pudimos conectarnos. Probá de nuevo.')
      setLoading(false)
    }
  }

  // ── Paso 1: buscar el pedido ─────────────────────────────────────
  if (!data) {
    return (
      <>
        <section className="bg-black text-white">
          <div className="mx-auto max-w-xl px-5 pt-8 pb-20">
            <h1 className="font-display text-[34px] leading-[1.05] font-bold tracking-[-0.02em]">¿No te quedó como esperabas?</h1>
            <div className="h-[3px] w-12 bg-[#B8892B] mt-4" />
            <p className="mt-4 text-[16px] leading-relaxed text-neutral-300 max-w-[34ch]">
              Cambiá el talle, el color o elegí otro producto. Lo resolvés acá en un par de minutos.
            </p>
          </div>
        </section>

        <main className="mx-auto max-w-xl px-4 -mt-12 pb-8 space-y-6">
          <Card className="shadow-[0_12px_32px_-16px_rgba(0,0,0,0.35)] space-y-4 p-5">
            <label className="block">
              <span className="block text-[13px] font-semibold mb-1.5">Número de orden</span>
              <input className={inputCls} inputMode="numeric" placeholder="Ej: 1351" value={orderNumber}
                onChange={(e) => setOrderNumber(e.target.value)} />
            </label>
            <label className="block">
              <span className="block text-[13px] font-semibold mb-1.5">Email de la compra</span>
              <input className={inputCls} type="email" autoCapitalize="none" autoCorrect="off" placeholder="tu@email.com" value={email}
                onChange={(e) => setEmail(e.target.value)} />
            </label>
            {error && <ErrorBox>{error}</ErrorBox>}
            <Btn onClick={onLookup} disabled={loading || !orderNumber || !email}>{loading ? 'Buscando tu pedido…' : 'Buscar mi pedido'}</Btn>
            <p className="text-xs text-neutral-500 text-center">El número de orden está en el mail de confirmación de tu compra.</p>
          </Card>

          <ol className="relative grid grid-cols-3 gap-2 px-1">
            <span aria-hidden className="absolute left-[16%] right-[16%] top-4 h-px bg-[#D9C08A]" />
            {['Buscá tu pedido', 'Elegí talle, color o producto', 'Coordinamos el envío'].map((t, i) => (
              <li key={t} className="relative text-center">
                <span className="font-display mx-auto w-8 h-8 rounded-full bg-[#F4F4F3] border-2 border-[#B8892B] text-[#8B6914] text-sm font-bold flex items-center justify-center">{i + 1}</span>
                <span className="block mt-2 text-[12.5px] leading-snug text-neutral-700">{t}</span>
              </li>
            ))}
          </ol>

          <div className="rounded-2xl bg-white border border-[#E6E6E3] divide-y divide-[#EFEFEC]">
            <p className="flex gap-3 items-center p-4 text-[14px]"><Icon d="M8 2v4M16 2v4M3 10h18M5 4h14a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2z" />Tenés 10 días desde que recibiste tu pedido.</p>
            <p className="flex gap-3 items-center p-4 text-[14px]"><Icon d="M3 7h11v10H3zM14 10h4l3 3v4h-7M7 20a2 2 0 1 0 0-4 2 2 0 0 0 0 4zM17 20a2 2 0 1 0 0-4 2 2 0 0 0 0 4z" />Despachamos los cambios todos los lunes.</p>
          </div>
        </main>
      </>
    )
  }

  // ── Paso 2: elegir el cambio ─────────────────────────────────────
  const o = data.order
  return (
    <>
      <section className="bg-black text-white">
        <div className="mx-auto max-w-xl px-5 pt-6 pb-8">
          <p className="text-neutral-400 text-sm">Orden #{o.number}</p>
          <h1 className="font-display text-[28px] leading-tight font-bold tracking-[-0.01em] mt-1">
            {o.customerName ? `Hola ${o.customerName}, armemos tu cambio` : 'Armemos tu cambio'}
          </h1>
        </div>
      </section>

      <main className={`mx-auto max-w-xl px-4 pt-5 space-y-5 ${otherReason ? 'pb-8' : 'pb-40'}`}>
        {data.active.length > 0 && (
          <Card className="border-[#E9D5A6] bg-[#FBF6EA]">
            <p className="text-sm">Ya tenés una solicitud en curso para esta orden:</p>
            {data.active.map((a) => (
              <a key={a.code} href={`/cambios/estado/${a.token}`} className="block mt-1 font-semibold underline">{a.code}: ver estado</a>
            ))}
          </Card>
        )}

        <h2 className="font-display text-[17px] font-bold px-1">{data.items.length > 1 ? '¿Qué prendas querés cambiar?' : 'Tu prenda'}</h2>

        {data.items.map((it) => {
          const s = sel[it.key]
          const disabled = !it.exchangeable
          const targets = targetsFor(it, data.catalog)
          const prod = targets.find((c) => String(c.product_id) === s?.productId)
          const parts = (prod?.variants ?? []).map((v) => ({ v, ...splitLabel(v.label) }))
          const colors = Array.from(new Set(parts.map((p) => p.color))).filter((c) => c !== '')
          const sizes = Array.from(new Set(parts.filter((p) => !colors.length || p.color === s?.color).map((p) => p.size))).filter((x) => x !== '').sort(sortSizes)
          const v = variantOf(it)
          const d = diffFor(it, v)
          const pickColor = (c: string) => upd(it.key, { color: c, size: '' })
          const needColor = colors.length > 0
          return (
            <section key={it.key} className={`rounded-2xl border bg-white overflow-hidden transition-colors ${s?.checked ? 'border-black' : 'border-[#E6E6E3]'}`}>
              <button type="button" disabled={disabled} onClick={() => upd(it.key, { checked: !s?.checked })}
                className="w-full flex items-center gap-3 p-3 text-left disabled:opacity-50">
                {it.image
                  ? <img src={it.image} alt="" className="w-14 h-[68px] object-cover rounded-lg bg-neutral-100" />
                  : <span className="w-14 h-[68px] rounded-lg bg-neutral-100" />}
                <span className="flex-1 min-w-0">
                  <span className="block text-[15px] font-semibold leading-tight">{it.name}</span>
                  <span className="block text-[13px] text-neutral-500 mt-0.5">{it.variant_label}{it.quantity > 1 ? ` · ${it.quantity} unidades` : ''}</span>
                  {disabled && <span className="block text-[12px] text-neutral-500 mt-0.5">Por higiene, esta prenda no tiene cambio</span>}
                </span>
                {!disabled && (
                  <span className={`shrink-0 w-6 h-6 rounded-full flex items-center justify-center ${s?.checked ? 'bg-[#B8892B] text-white' : 'border-2 border-[#D9D9D6]'}`} aria-hidden>
                    {s?.checked && <svg viewBox="0 0 24 24" className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth="3"><path d="M5 12l5 5L20 7" /></svg>}
                  </span>
                )}
              </button>

              {s?.checked && (
                <div className="border-t border-[#EFEFEC] p-4 space-y-5">
                  <div>
                    <p className="text-[13px] font-semibold mb-2">¿Por qué la cambiás?</p>
                    <div className="flex flex-wrap gap-2">
                      {data.reasons.map((r) => (
                        <Chip key={r.id} selected={s.reason === r.id} onClick={() => upd(it.key, { reason: r.id })}>{r.label.replace(' (te atendemos por WhatsApp)', '')}</Chip>
                      ))}
                    </div>
                  </div>

                  {s.reason && s.reason !== 'otro' && (
                    <>
                      <div>
                        <p className="text-[13px] font-semibold mb-2">¿Por cuál la querés?</p>
                        <div className="flex gap-2 overflow-x-auto pb-1 snap-x">
                          {targets.map((c) => {
                            const active = String(c.product_id) === s.productId
                            const same = c.product_id === it.product_id
                            return (
                              <button key={c.product_id} type="button" onClick={() => upd(it.key, { productId: String(c.product_id), color: '', size: '' })}
                                className={`snap-start shrink-0 w-[132px] rounded-xl border text-left overflow-hidden transition-colors ${active ? 'border-black ring-1 ring-black' : 'border-[#E6E6E3]'}`}>
                                <span className="relative block aspect-[4/5] bg-neutral-100">
                                  {c.image && <img src={c.image} alt="" className="w-full h-full object-cover" />}
                                  {same && <span className="absolute top-1.5 left-1.5 text-[10px] font-semibold bg-black text-white rounded-full px-2 py-0.5">Mismo modelo</span>}
                                </span>
                                <span className="block px-2 py-2">
                                  <span className="block text-[12.5px] font-semibold leading-tight line-clamp-2">{c.name}</span>
                                  <span className="block text-[12px] text-neutral-500 mt-0.5">{money(minPrice(c))}</span>
                                </span>
                              </button>
                            )
                          })}
                        </div>
                      </div>

                      {needColor && (
                        <div>
                          <p className="text-[13px] font-semibold mb-2">Color {s.color && <span className="font-normal text-neutral-500">· {s.color}</span>}</p>
                          <div className="flex flex-wrap gap-2">
                            {colors.map((c) => {
                              const any = parts.some((p) => p.color === c && p.v.available >= it.quantity)
                              return <Chip key={c} selected={s.color === c} disabled={!any} onClick={() => pickColor(c)}>{c}</Chip>
                            })}
                          </div>
                        </div>
                      )}

                      {(!needColor || s.color) && sizes.length > 0 && (
                        <div>
                          <p className="text-[13px] font-semibold mb-2">Talle</p>
                          <div className="flex flex-wrap gap-2">
                            {sizes.map((z) => {
                              const pv = findVariant(prod, needColor ? s.color : '', z)
                              const ok = !!pv && pv.available >= it.quantity
                              const dd = diffFor(it, pv)
                              return <Chip key={z} selected={s.size === z} disabled={!ok} onClick={() => upd(it.key, { size: z })} sub={dd > 0 ? `+${money(dd)}` : undefined}>{z}</Chip>
                            })}
                          </div>
                        </div>
                      )}

                      {v && (
                        <div className={`rounded-xl px-3 py-2.5 text-[13.5px] ${d > 0 ? 'bg-[#FBF6EA] text-[#6B5110]' : 'bg-[#F4F4F3] text-neutral-700'}`}>
                          Te llevás <b>{prod?.name} {v.label}</b>. {d > 0 ? <>Diferencia a abonar: <b>{money(d)}</b>.</> : 'Sin diferencia de precio.'}
                        </div>
                      )}
                    </>
                  )}
                </div>
              )}
            </section>
          )
        })}

        <p className="text-[12.5px] text-neutral-500 px-1">Si el producto nuevo cuesta más, abonás la diferencia. Si cuesta menos, la diferencia no se reintegra.</p>

        {otherReason ? (
          <Card className="space-y-3 border-[#E9D5A6] bg-[#FBF6EA]">
            <p className="text-[15px]">Para otros motivos lo resolvemos por WhatsApp, así te atendemos personalmente.</p>
            <a href={waLink(data.whatsapp, waText)} className="block w-full h-[52px] rounded-xl bg-[#1FA855] text-white text-[15px] font-semibold leading-[52px] text-center">Escribir por WhatsApp</a>
          </Card>
        ) : (
          <>
            {needsAddress ? (
              <Card className="space-y-4">
                <div>
                  <h2 className="font-display text-[15px] font-bold">Datos para la moto</h2>
                  <p className="text-[13px] text-neutral-600 mt-1">Ahí pasa a retirar tu prenda y te deja la nueva.</p>
                </div>
                <Field label="Nombre y apellido"><input className={inputCls} autoComplete="name" value={ship.full_name} onChange={(e) => setS('full_name', e.target.value)} /></Field>
                <Field label="WhatsApp"><input className={inputCls} type="tel" autoComplete="tel" placeholder="11 1234 5678" value={ship.phone} onChange={(e) => setS('phone', e.target.value)} /></Field>
                <Field label="Dirección (calle y altura)"><input className={inputCls} autoComplete="address-line1" placeholder="Ej: Av. Cabildo 2349" value={ship.street} onChange={(e) => setS('street', e.target.value)} /></Field>
                <div className="grid grid-cols-2 gap-3">
                  <Field label="Piso / depto (opcional)"><input className={inputCls} autoComplete="address-line2" value={ship.floor} onChange={(e) => setS('floor', e.target.value)} /></Field>
                  <Field label="Localidad o barrio"><input className={inputCls} autoComplete="address-level2" value={ship.locality} onChange={(e) => setS('locality', e.target.value)} /></Field>
                </div>
                <Field label="Indicaciones para la moto (opcional)"><input className={inputCls} placeholder="Timbre, entre calles, horario…" value={ship.notes} onChange={(e) => setS('notes', e.target.value)} /></Field>
              </Card>
            ) : (
              <>
                {needsBranch && (
                  <Card className="space-y-4">
                    <div>
                      <h2 className="font-display text-[15px] font-bold">¿Desde qué sucursal vas a despachar?</h2>
                      <p className="text-[13px] text-neutral-600 mt-1">Elegí la sucursal de Correo Argentino que te quede cómoda. Te mandamos la etiqueta para llevar el paquete ahí.</p>
                    </div>
                    <BranchPicker provincias={data.provincias ?? []} initialProvince={o.provinceCode ?? ''} value={branch} onChange={setBranch} />
                  </Card>
                )}
                <Card className="space-y-4">
                  <h2 className="font-display text-[15px] font-bold">Tus datos de contacto</h2>
                  <Field label={`WhatsApp${needPhone ? '' : ' (opcional)'}`}><input className={inputCls} type="tel" placeholder="11 1234 5678" value={phone} onChange={(e) => setPhone(e.target.value)} /></Field>
                </Card>
              </>
            )}

            <Card className="space-y-4">
              <Field label="Comentario (opcional)"><textarea className={`${inputCls} h-24 py-3`} value={note} onChange={(e) => setNote(e.target.value)} /></Field>
            </Card>

            <Card className="space-y-2">
              <h2 className="font-display text-[15px] font-bold mb-1">Resumen</h2>
              <Row label={`Envío del cambio · ${o.zoneLabel}`} value={shipping === 0 ? 'Sin costo' : money(shipping)} />
              {diff > 0 && <Row label="Diferencia de precio" value={money(diff)} />}
              <div className="flex justify-between items-baseline pt-2 border-t border-[#EFEFEC]">
                <span className="font-semibold">Total a transferir</span>
                <span className="font-display text-[20px] font-bold">{total === 0 ? 'Sin costo' : money(total)}</span>
              </div>
              <p className="text-[12.5px] text-neutral-600 pt-1 leading-relaxed">
                {o.zone === 'correo'
                  ? 'Te mandamos por mail la etiqueta de Correo Argentino para que despaches la prenda en la sucursal que elegiste. Cuando llega, te enviamos la nueva.'
                  : o.zone === 'retiro'
                  ? 'Te confirmamos día y horario para hacer el cambio.'
                  : 'Una moto retira tu prenda y te entrega la nueva en el mismo viaje.'}
                {shipping == null && ' Te confirmamos el costo del envío por mail y WhatsApp.'}
                {' '}Despachamos los cambios los lunes (próximo: {nextMondayLabel()}).
              </p>
            </Card>

            {error && <ErrorBox>{error}</ErrorBox>}
          </>
        )}

        <Btn variant="light" onClick={() => { setData(null); setError('') }}>Buscar otro pedido</Btn>
        <p className="text-xs text-neutral-500 text-center">
          ¿Dudas? <a className="underline" href={waLink(data.whatsapp)}>Escribinos por WhatsApp</a>
        </p>
        <p className="text-center"><a className="text-[13px] font-semibold text-[#8B6914]" href={data.storeUrl || 'https://www.foreverbasics.com.ar'}>Volver a la tienda</a></p>
      </main>

      {!otherReason && (
        <div className="fixed bottom-0 inset-x-0 z-20 bg-white/95 border-t border-[#E6E6E3]" style={{ paddingBottom: 'env(safe-area-inset-bottom)' }}>
          {pendingHint && <p className="mx-auto max-w-xl px-4 pt-2 text-[12px] text-[#8B6914] font-medium">{pendingHint}</p>}
          <div className="mx-auto max-w-xl px-4 py-3 flex items-center gap-3">
            <div className="min-w-0">
              <p className="text-[11px] text-neutral-500 leading-none">Total a transferir</p>
              <p className="font-display text-[18px] font-bold leading-tight mt-1">{!chosen.length ? '—' : total === 0 ? 'Sin costo' : money(total)}</p>
            </div>
            <Btn className="flex-1" onClick={onSubmit} disabled={loading || !canSubmit}>
              {loading ? 'Confirmando…' : 'Confirmar cambio'}
            </Btn>
          </div>
        </div>
      )}
    </>
  )
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="block">
      <span className="block text-[13px] font-semibold mb-1.5">{label}</span>
      {children}
    </label>
  )
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex justify-between gap-3 text-[14px]">
      <span className="text-neutral-600">{label}</span>
      <span className="font-medium whitespace-nowrap">{value}</span>
    </div>
  )
}

function Icon({ d }: { d: string }) {
  return (
    <svg viewBox="0 0 24 24" className="w-5 h-5 shrink-0 text-[#B8892B]" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <path d={d} />
    </svg>
  )
}
