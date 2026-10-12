'use client'

import { useEffect, useState } from 'react'
import { money, int, pct } from '@/lib/faro/format'

interface Row { key: string; label: string; spend: number; impressions: number; clicks: number; lpv: number; purchases: number; value: number }
const TABS: [string, string][] = [['edad', 'Edad'], ['genero', 'Género'], ['provincia', 'Provincia'], ['ubicacion', 'Ubicación'], ['plataforma', 'Plataforma']]

/** Dónde rinde: gasto, compras y costo por compra por segmento, contra el máximo rentable. */
export default function Breakdown({ accountId, id, from, to, maxCpa }: { accountId: string; id: string; from: string; to: string; maxCpa: number | null }) {
  const [by, setBy] = useState('edad')
  const [rows, setRows] = useState<Row[] | null>(null)
  const [err, setErr] = useState<string | null>(null)
  useEffect(() => {
    setRows(null); setErr(null)
    fetch(`/api/v2/meta/breakdown?account=${accountId}&id=${id}&by=${by}&from=${from}&to=${to}`).then((r) => r.json())
      .then((j) => { if (j.error) setErr(j.error); else setRows(j.rows || []) }).catch(() => setErr('No se pudo cargar'))
  }, [accountId, id, by, from, to])
  const total = (rows || []).reduce((a, r) => a + r.spend, 0) || 1
  const list = by === 'provincia' ? (rows || []).slice(0, 10) : rows || []
  return (
    <section>
      <div className="flex items-center justify-between gap-2 mb-2">
        <p className="text-[13px] text-mute">Dónde rinde</p>
        <div className="flex flex-wrap gap-1 text-[12px]">
          {TABS.map(([k, l]) => <button key={k} onClick={() => setBy(k)} className={`rounded-md px-2 py-0.5 ${by === k ? 'bg-ink text-bg' : 'text-mute hover:text-ink border border-line'}`}>{l}</button>)}
        </div>
      </div>
      {err ? <p className="text-[12.5px] text-bad">{err}</p> : rows == null ? <div className="h-24 rounded bg-sunken animate-pulse" /> : list.length === 0 ? <p className="text-[12.5px] text-faint">Sin datos en el período.</p> : (
        <table className="w-full text-[12.5px]">
          <thead><tr className="text-mute text-left"><th className="font-medium py-1">Segmento</th><th className="font-medium py-1 text-right">Gasto</th><th className="font-medium py-1 text-right">Compras</th><th className="font-medium py-1 text-right">Costo/compra</th></tr></thead>
          <tbody>
            {list.map((r) => {
              const cpa = r.purchases > 0 ? r.spend / r.purchases : null
              return (
                <tr key={r.key} className="border-t border-line/60">
                  <td className="py-1.5 pr-2">
                    <span className="block text-ink truncate max-w-[150px]" title={r.label}>{r.label}</span>
                    <span className="block h-1 mt-1 rounded-full bg-sunken"><span className="block h-full rounded-full bg-ink/35" style={{ width: `${(r.spend / total) * 100}%` }} /></span>
                  </td>
                  <td className="py-1.5 text-right num">{money(r.spend)}<span className="block text-[11px] text-faint">{pct(r.spend / total)}</span></td>
                  <td className="py-1.5 text-right num">{int(r.purchases)}</td>
                  <td className={`py-1.5 text-right num ${cpa != null && maxCpa != null ? (cpa <= maxCpa ? 'text-good' : 'text-bad') : 'text-faint'}`}>{cpa != null ? money(cpa) : r.spend > (maxCpa || 0) * 0.5 ? 'sin compras' : '—'}</td>
                </tr>
              )
            })}
          </tbody>
        </table>
      )}
    </section>
  )
}
