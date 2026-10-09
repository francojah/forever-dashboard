'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { money } from '@/lib/faro/format'
import { monthLabel } from '@/lib/faro/dates'
import { Panel, Empty } from '../ui'

type Kind = 'fixed' | 'extra' | 'cash'
interface Row { id: string; [k: string]: unknown }

const CFG: Record<Kind, { url: string; title: string; description: string; empty: string }> = {
  fixed: { url: '/api/v2/fixed-costs', title: 'Costos fijos', description: 'Se cobran todos los meses entre "desde" y "hasta". Cambiar uno no reescribe los meses anteriores: cargá la fecha desde la que rige.', empty: 'Sin costos fijos cargados' },
  extra: { url: '/api/v2/extra-costs', title: 'Costos del mes', description: 'Gastos puntuales que sí son del resultado: una compra de packaging, un flete, una sesión de fotos.', empty: 'Sin costos puntuales' },
  cash: { url: '/api/v2/cash', title: 'Movimientos de caja', description: 'Compras de mercadería, retiros y aportes. No entran en el resultado (la mercadería ya está en el costo de cada venta), pero sirven para saber cuánta plata salió.', empty: 'Sin movimientos de caja' },
}

const CASH_TYPES: Record<string, string> = { compra_mercaderia: 'Compra de mercadería', retiro: 'Retiro de socios', aporte: 'Aporte', otro: 'Otro' }

export default function CostTable({ kind, canEdit, defaultMonth }: { kind: Kind; canEdit: boolean; defaultMonth?: string }) {
  const router = useRouter()
  const cfg = CFG[kind]
  const today = new Date().toISOString().slice(0, 10)
  const [rows, setRows] = useState<Row[] | null>(null)
  const [form, setForm] = useState<Record<string, string>>({})
  const [error, setError] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)

  const reset = () => setForm(kind === 'fixed' ? { name: '', amount: '', valid_from: `${today.slice(0, 7)}-01`, valid_to: '' }
    : kind === 'extra' ? { description: '', amount: '', month: defaultMonth || today.slice(0, 7), category: 'otro' }
    : { description: '', amount: '', date: today, type: 'compra_mercaderia' })
  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => { reset(); load() }, [kind])
  const load = () => fetch(cfg.url).then((r) => r.json()).then((j) => setRows(j.rows || [])).catch(() => setRows([]))

  async function add(e: React.FormEvent) {
    e.preventDefault()
    setSaving(true); setError(null)
    const body: Record<string, unknown> = { ...form, amount: Number(String(form.amount).replace(/\./g, '').replace(',', '.')) }
    if (kind === 'fixed' && !form.valid_to) body.valid_to = null
    const r = await fetch(cfg.url, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) })
    const j = await r.json().catch(() => ({}))
    setSaving(false)
    if (!r.ok) { setError(j.error || 'No se pudo guardar'); return }
    reset(); load(); router.refresh()
  }
  async function remove(id: string) {
    if (!window.confirm('¿Borrar este registro?')) return
    await fetch(`${cfg.url}?id=${id}`, { method: 'DELETE' })
    load(); router.refresh()
  }
  async function endToday(id: string) {
    await fetch(cfg.url, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ id, valid_to: today }) })
    load(); router.refresh()
  }

  const input = 'rounded-lg border border-line bg-surface px-2.5 py-1.5 text-[13.5px]'
  return (
    <Panel title={cfg.title} description={cfg.description} padded={false}>
      {canEdit && (
        <form onSubmit={add} className="px-5 pb-4 flex flex-wrap items-end gap-2 text-[13px]">
          {kind === 'fixed' && <>
            <label className="flex flex-col gap-1 text-mute">Nombre<input required value={form.name || ''} onChange={(e) => setForm({ ...form, name: e.target.value })} className={`${input} w-48 text-ink`} placeholder="Sueldo, alquiler, app…" /></label>
            <label className="flex flex-col gap-1 text-mute">Monto mensual<input required inputMode="decimal" value={form.amount || ''} onChange={(e) => setForm({ ...form, amount: e.target.value })} className={`${input} w-32 text-ink`} /></label>
            <label className="flex flex-col gap-1 text-mute">Desde<input type="date" required value={form.valid_from || ''} onChange={(e) => setForm({ ...form, valid_from: e.target.value })} className={`${input} text-ink`} /></label>
            <label className="flex flex-col gap-1 text-mute">Hasta (opcional)<input type="date" value={form.valid_to || ''} onChange={(e) => setForm({ ...form, valid_to: e.target.value })} className={`${input} text-ink`} /></label>
          </>}
          {kind === 'extra' && <>
            <label className="flex flex-col gap-1 text-mute">Descripción<input required value={form.description || ''} onChange={(e) => setForm({ ...form, description: e.target.value })} className={`${input} w-56 text-ink`} /></label>
            <label className="flex flex-col gap-1 text-mute">Monto<input required inputMode="decimal" value={form.amount || ''} onChange={(e) => setForm({ ...form, amount: e.target.value })} className={`${input} w-32 text-ink`} /></label>
            <label className="flex flex-col gap-1 text-mute">Mes<input type="month" required value={form.month || ''} onChange={(e) => setForm({ ...form, month: e.target.value })} className={`${input} text-ink`} /></label>
          </>}
          {kind === 'cash' && <>
            <label className="flex flex-col gap-1 text-mute">Tipo
              <select value={form.type || 'compra_mercaderia'} onChange={(e) => setForm({ ...form, type: e.target.value })} className={`${input} text-ink`}>
                {Object.entries(CASH_TYPES).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
              </select>
            </label>
            <label className="flex flex-col gap-1 text-mute">Descripción<input value={form.description || ''} onChange={(e) => setForm({ ...form, description: e.target.value })} className={`${input} w-56 text-ink`} /></label>
            <label className="flex flex-col gap-1 text-mute">Monto<input required inputMode="decimal" value={form.amount || ''} onChange={(e) => setForm({ ...form, amount: e.target.value })} className={`${input} w-32 text-ink`} /></label>
            <label className="flex flex-col gap-1 text-mute">Fecha<input type="date" required value={form.date || ''} onChange={(e) => setForm({ ...form, date: e.target.value })} className={`${input} text-ink`} /></label>
          </>}
          <button disabled={saving} className="rounded-lg bg-ink text-surface px-3.5 py-2 font-medium disabled:opacity-60">{saving ? 'Guardando' : 'Agregar'}</button>
          {error && <p className="w-full text-bad">{error}</p>}
        </form>
      )}
      {rows == null ? <p className="px-5 pb-5 text-mute">Cargando…</p> : rows.length === 0 ? <div className="px-5"><Empty title={cfg.empty} /></div> : (
        <table className="w-full text-[13.5px]">
          <tbody className="divide-y divide-line border-t border-line">
            {rows.map((r) => (
              <tr key={r.id}>
                <td className="px-5 py-2.5 text-ink">
                  {kind === 'fixed' ? String(r.name) : kind === 'cash' ? `${CASH_TYPES[String(r.type)] || r.type}${r.description ? ` · ${r.description}` : ''}` : String(r.description || r.category)}
                  <span className="block text-[12px] text-mute">
                    {kind === 'fixed' ? `desde ${r.valid_from}${r.valid_to ? ` hasta ${r.valid_to}` : ', sin fecha de fin'}` : kind === 'extra' ? monthLabel(String(r.month)) : String(r.date)}
                  </span>
                </td>
                <td className="px-2 py-2.5 text-right num">{money(Number(r.amount))}</td>
                <td className="px-5 py-2.5 text-right whitespace-nowrap">
                  {canEdit && kind === 'fixed' && !r.valid_to && <button onClick={() => endToday(r.id)} className="text-[12.5px] text-mute hover:text-ink mr-3">Dar de baja hoy</button>}
                  {canEdit && <button onClick={() => remove(r.id)} className="text-[12.5px] text-mute hover:text-bad">Borrar</button>}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </Panel>
  )
}
