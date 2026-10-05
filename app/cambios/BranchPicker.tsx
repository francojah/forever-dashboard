'use client'

import { useEffect, useState } from 'react'
import { inputCls, selectCls } from './ui'

export type Branch = { name: string; address: string; locality: string; province: string; hours: string }
type Localidad = { id: string; nombre: string; cp: string }
type Sucursal = { name: string; address: string; locality: string; hours: string }

const norm = (s: string) => s.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '')

/**
 * Elegir desde qué sucursal de Correo Argentino va a despachar el cliente:
 * provincia → localidad → sucursal. Si el buscador del correo no responde, se escribe a mano.
 */
export default function BranchPicker({ provincias, initialProvince, value, onChange }: {
  provincias: { code: string; name: string }[]
  initialProvince: string
  value: Branch | null
  onChange: (b: Branch | null) => void
}) {
  const [prov, setProv] = useState(initialProvince || '')
  const [locs, setLocs] = useState<Localidad[]>([])
  const [loc, setLoc] = useState<Localidad | null>(null)
  const [q, setQ] = useState('')
  const [sucs, setSucs] = useState<Sucursal[] | null>(null)
  const [loading, setLoading] = useState('')
  const [manual, setManual] = useState(false)
  const [manualText, setManualText] = useState('')

  const provName = provincias.find((p) => p.code === prov)?.name || ''

  async function get(url: string) {
    const res = await fetch(url)
    const j = await res.json()
    if (!j.ok) throw new Error('fail')
    return j
  }

  // Provincia → localidades
  useEffect(() => {
    let alive = true
    setLocs([]); setLoc(null); setSucs(null); setQ(''); onChange(null)
    if (!prov) return
    setLoading('loc')
    get(`/api/cambios/correo?provincia=${prov}`)
      .then((j) => {
        if (!alive) return
        const list = j.localidades as Localidad[]
        setLocs(list)
        if (list.length === 1) setLoc(list[0]) // CABA
        setLoading('')
      })
      .catch(() => { if (alive) { setManual(true); setLoading('') } })
    return () => { alive = false }
  }, [prov]) // eslint-disable-line react-hooks/exhaustive-deps

  // Localidad → sucursales
  useEffect(() => {
    let alive = true
    setSucs(null); onChange(null)
    if (!loc) return
    setLoading('suc')
    get(`/api/cambios/correo?provincia=${prov}&localidad=${loc.id}`)
      .then((j) => { if (alive) { setSucs(j.sucursales as Sucursal[]); setLoading('') } })
      .catch(() => { if (alive) { setManual(true); setLoading('') } })
    return () => { alive = false }
  }, [loc]) // eslint-disable-line react-hooks/exhaustive-deps

  const matches = q.trim().length >= 2 ? locs.filter((l) => norm(l.nombre).includes(norm(q)) || l.cp.startsWith(q.trim())).slice(0, 40) : []
  const [sq, setSq] = useState('')
  const sucList = (sucs ?? []).filter((s) => !sq.trim() || norm(`${s.name} ${s.address}`).includes(norm(sq)))

  if (manual) {
    return (
      <div className="space-y-2">
        <p className="text-[13px] text-neutral-600">No pudimos cargar el listado del correo. Escribí la sucursal desde donde vas a despachar (nombre o dirección y localidad).</p>
        <input className={inputCls} placeholder="Ej: Sucursal Caballito, Av. Rivadavia 5050" value={manualText}
          onChange={(e) => {
            setManualText(e.target.value)
            const t = e.target.value.trim()
            onChange(t.length >= 3 ? { name: t, address: '', locality: '', province: provName, hours: '' } : null)
          }} />
      </div>
    )
  }

  return (
    <div className="space-y-3">
      <label className="block">
        <span className="block text-[13px] font-semibold mb-1.5">Provincia</span>
        <select className={selectCls} value={prov} onChange={(e) => setProv(e.target.value)}>
          <option value="">Elegí la provincia…</option>
          {provincias.map((p) => <option key={p.code} value={p.code}>{p.name}</option>)}
        </select>
      </label>

      {prov && locs.length > 1 && (
        <div>
          <span className="block text-[13px] font-semibold mb-1.5">Localidad</span>
          {loc ? (
            <div className="flex items-center justify-between gap-3 rounded-xl border border-black px-4 py-3">
              <span className="text-[15px]">{loc.nombre}{loc.cp ? ` (${loc.cp})` : ''}</span>
              <button type="button" className="text-[13px] font-semibold text-[#8B6914]" onClick={() => { setLoc(null); setQ('') }}>Cambiar</button>
            </div>
          ) : (
            <>
              <input className={inputCls} placeholder="Escribí tu localidad o código postal" value={q} onChange={(e) => setQ(e.target.value)} />
              {q.trim().length >= 2 && (
                <ul className="mt-2 max-h-56 overflow-y-auto rounded-xl border border-[#E6E6E3] divide-y divide-[#EFEFEC] bg-white">
                  {matches.length === 0 && <li className="px-4 py-3 text-[13px] text-neutral-500">No encontramos esa localidad. Probá sin acentos o con el código postal.</li>}
                  {matches.map((l) => (
                    <li key={l.id}>
                      <button type="button" className="w-full text-left px-4 py-3 text-[14.5px] active:bg-neutral-100" onClick={() => setLoc(l)}>
                        {l.nombre}{l.cp ? <span className="text-neutral-500"> · {l.cp}</span> : null}
                      </button>
                    </li>
                  ))}
                </ul>
              )}
            </>
          )}
        </div>
      )}

      {loading === 'loc' && <p className="text-[13px] text-neutral-500">Cargando localidades…</p>}
      {loading === 'suc' && <p className="text-[13px] text-neutral-500">Buscando sucursales…</p>}

      {loc && sucs && (
        <div>
          <span className="block text-[13px] font-semibold mb-1.5">Sucursal donde vas a despachar</span>
          {sucs.length === 0 && <p className="text-[13px] text-neutral-500">No hay sucursales en esa localidad. Elegí otra cercana.</p>}
          {sucs.length > 8 && (
            <input className={`${inputCls} mb-2`} placeholder="Buscar por nombre o calle" value={sq} onChange={(e) => setSq(e.target.value)} />
          )}
          <ul className="max-h-72 overflow-y-auto space-y-2 pr-0.5">
            {sucList.map((s) => {
              const selected = !!value && value.name === s.name && value.address === s.address
              return (
                <li key={`${s.name}|${s.address}`}>
                  <button type="button"
                    onClick={() => onChange({ name: s.name, address: s.address, locality: s.locality || loc.nombre, province: provName, hours: s.hours })}
                    className={`w-full text-left rounded-xl border px-4 py-3 transition-colors ${selected ? 'border-black bg-[#FBF6EA]' : 'border-[#E6E6E3] bg-white'}`}>
                    <span className="flex items-start justify-between gap-3">
                      <span className="min-w-0">
                        <span className="block text-[14.5px] font-semibold leading-tight">{s.name}</span>
                        <span className="block text-[13px] text-neutral-600 mt-0.5">{s.address}</span>
                        {s.hours && <span className="block text-[12px] text-neutral-500 mt-0.5">{s.hours}</span>}
                      </span>
                      <span className={`shrink-0 mt-0.5 w-5 h-5 rounded-full ${selected ? 'bg-[#B8892B] border-[#B8892B]' : 'border-2 border-[#D9D9D6]'}`} aria-hidden />
                    </span>
                  </button>
                </li>
              )
            })}
          </ul>
        </div>
      )}

      <button type="button" className="text-[12.5px] underline text-neutral-500" onClick={() => { setManual(true); onChange(null) }}>
        No encuentro mi sucursal
      </button>
    </div>
  )
}
