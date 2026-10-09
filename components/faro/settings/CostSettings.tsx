'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { Panel } from '../ui'
import type { WorkspaceSettings, PaymentFee } from '@/lib/faro/settings'
import { SUGGESTED_PAYMENT_FEES, PAYMENT_METHOD_LABELS } from '@/lib/faro/settings'
import { pct } from '@/lib/faro/format'

/** Parámetros que no se pueden detectar solos. Al guardar, el espacio queda "configurado". */
export default function CostSettings({ canEdit, settings, detected }: { canEdit: boolean; settings: WorkspaceSettings; detected: { method: string; share: number }[] }) {
  const router = useRouter()
  const [s, setS] = useState<WorkspaceSettings>(settings)
  const [saving, setSaving] = useState(false)
  const [saved, setSaved] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const methods = Array.from(new Set([...detected.map((d) => d.method), ...s.payment_fees.map((f) => f.method).filter((m) => m !== '*')]))
  const feeOf = (m: string) => s.payment_fees.find((f) => f.method === m)?.pct
  const setFee = (m: string, v: string) => {
    const others = s.payment_fees.filter((f) => f.method !== m)
    const n = v === '' ? null : Number(v.replace(',', '.'))
    setS({ ...s, payment_fees: n == null || !isFinite(n) ? others : [...others, { method: m, pct: n } as PaymentFee] })
    setSaved(false)
  }
  const num = (k: keyof WorkspaceSettings) => (e: React.ChangeEvent<HTMLInputElement>) => { setS({ ...s, [k]: Number(e.target.value.replace(',', '.')) || 0 }); setSaved(false) }

  function suggest() {
    const fees = [...s.payment_fees]
    for (const m of [...methods, '*']) {
      if (fees.some((f) => f.method === m)) continue
      const sug = SUGGESTED_PAYMENT_FEES.find((x) => x.method === m) || (m === '*' ? SUGGESTED_PAYMENT_FEES.find((x) => x.method === '*') : undefined)
      if (sug) fees.push({ method: m, pct: sug.pct })
    }
    setS({ ...s, payment_fees: fees })
  }

  async function save() {
    setSaving(true); setError(null)
    const r = await fetch('/api/v2/settings', { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ ...s, configured: true }) })
    setSaving(false)
    if (!r.ok) { setError((await r.json().catch(() => ({}))).error || 'No se pudo guardar'); return }
    setSaved(true)
    router.refresh()
  }

  const field = 'rounded-lg border border-line bg-surface px-3 py-2 text-[14px] w-28 text-right num'
  return (
    <div className="grid lg:grid-cols-2 gap-5 items-start">
      <Panel title="Comisiones de cobro" description="Lo que te cobra la pasarela (Mercado Pago, Pago Nube, etc.) por cada medio. Los medios salen de tus ventas de los últimos 90 días.">
        <table className="w-full text-[13.5px]">
          <thead><tr className="text-mute text-left"><th className="font-medium pb-2">Medio de pago</th><th className="font-medium pb-2 text-right">De tus ventas</th><th className="font-medium pb-2 text-right">Comisión %</th></tr></thead>
          <tbody className="divide-y divide-line">
            {methods.map((m) => (
              <tr key={m}>
                <td className="py-2 text-ink">{PAYMENT_METHOD_LABELS[m] || m}</td>
                <td className="py-2 text-right num text-mute">{pct(detected.find((d) => d.method === m)?.share ?? 0)}</td>
                <td className="py-2 text-right"><input disabled={!canEdit} inputMode="decimal" value={feeOf(m) ?? ''} placeholder="sin cargar" onChange={(e) => setFee(m, e.target.value)} className={field} aria-label={`Comisión ${m}`} /></td>
              </tr>
            ))}
            <tr>
              <td className="py-2 text-ink">Cualquier otro medio</td><td />
              <td className="py-2 text-right"><input disabled={!canEdit} inputMode="decimal" value={feeOf('*') ?? ''} placeholder="sin cargar" onChange={(e) => setFee('*', e.target.value)} className={field} aria-label="Comisión otros medios" /></td>
            </tr>
          </tbody>
        </table>
        {canEdit && <button onClick={suggest} className="mt-3 text-[13px] underline underline-offset-2 text-mute hover:text-ink">Completar los vacíos con valores típicos (revisalos con tu liquidación)</button>}
        <p className="mt-2 text-[12.5px] text-mute">Si ofrecés cuotas sin interés, sumá su costo financiero a la comisión de tarjeta de crédito.</p>
      </Panel>

      <div className="flex flex-col gap-5">
        <Panel title="Costos por venta">
          <div className="flex flex-col gap-3 text-[13.5px]">
            <label className="flex items-center justify-between gap-3">Comisión de la plataforma (% de ventas netas)<input disabled={!canEdit} inputMode="decimal" value={s.platform_fee_pct} onChange={num('platform_fee_pct')} className={field} /></label>
            <label className="flex items-center justify-between gap-3">Packaging e insumos por orden ($)<input disabled={!canEdit} inputMode="decimal" value={s.packaging_per_order} onChange={num('packaging_per_order')} className={field} /></label>
            <label className="flex items-center justify-between gap-3">Ingresos Brutos (% de ventas netas)<input disabled={!canEdit} inputMode="decimal" value={s.iibb_pct} onChange={num('iibb_pct')} className={field} /></label>
          </div>
        </Panel>
        <Panel title="Impuestos de la publicidad" description="Meta factura la pauta más IVA y percepciones. Según tu régimen, una parte es costo y otra se recupera.">
          <div className="flex flex-col gap-3 text-[13.5px]">
            <label className="flex items-center justify-between gap-3">Régimen fiscal
              <select disabled={!canEdit} value={s.tax_regime} onChange={(e) => { const r = e.target.value as WorkspaceSettings['tax_regime']; setS({ ...s, tax_regime: r, ad_tax_pct: r === 'responsable_inscripto' ? 0 : r === 'monotributo' ? 21 : s.ad_tax_pct }); setSaved(false) }} className="rounded-lg border border-line bg-surface px-3 py-2">
                <option value="monotributo">Monotributo</option>
                <option value="responsable_inscripto">Responsable inscripto</option>
                <option value="otro">Otro</option>
              </select>
            </label>
            <label className="flex items-center justify-between gap-3">Parte no recuperable (% sobre la pauta)<input disabled={!canEdit} inputMode="decimal" value={s.ad_tax_pct} onChange={num('ad_tax_pct')} className={field} /></label>
            <p className="text-[12.5px] text-mute">Monotributo: el IVA del 21% es costo. Responsable inscripto: el IVA es crédito fiscal. La percepción del 30% (RG 5617) es un adelanto recuperable: afecta la caja, no la ganancia.</p>
          </div>
        </Panel>
        <Panel title="Productos sin costo cargado">
          <div className="flex flex-col gap-3 text-[13.5px]">
            <label className="flex items-center gap-2"><input disabled={!canEdit} type="checkbox" checked={s.use_platform_cost} onChange={(e) => { setS({ ...s, use_platform_cost: e.target.checked }); setSaved(false) }} /> Usar el costo cargado en Tiendanube cuando exista</label>
            <label className="flex items-center justify-between gap-3">Si no hay ningún costo, estimar como % del precio<input disabled={!canEdit} inputMode="decimal" value={s.cost_fallback_pct} onChange={num('cost_fallback_pct')} className={field} /></label>
          </div>
        </Panel>
        {canEdit && (
          <div className="flex items-center gap-3">
            <button onClick={save} disabled={saving} className="rounded-lg bg-ink text-surface px-4 py-2.5 text-[14px] font-semibold disabled:opacity-60">{saving ? 'Guardando' : 'Guardar costos'}</button>
            {saved && <span className="text-good text-[13.5px]">Guardado. Todos los números se recalculan con estos valores.</span>}
            {error && <span className="text-bad text-[13.5px]">{error}</span>}
          </div>
        )}
      </div>
    </div>
  )
}
