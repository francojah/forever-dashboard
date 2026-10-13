'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { Panel } from '../ui'
import { money, int, pct } from '@/lib/faro/format'
import { GOAL_LABEL, goalProgress, type Goal } from '@/lib/faro/insights'

type Metric = Goal['metric']
const ORDER: Metric[] = ['net_sales', 'orders', 'profit', 'cpa', 'margin']

/** Objetivos del mes: meta por indicador, avance contra el ritmo del mes y alerta cuando te desviás. */
export default function Goals({ month, goals, actual, dayShare, canEdit, missing }: {
  month: string; goals: Goal[]; actual: Record<Metric, number | null>; dayShare: number; canEdit: boolean; missing: boolean
}) {
  const router = useRouter()
  const [edit, setEdit] = useState<Metric | null>(null)
  const [val, setVal] = useState('')
  const [msg, setMsg] = useState<string | null>(null)
  const fmt = (m: Metric, v: number | null) => (v == null ? '—' : GOAL_LABEL[m].kind === 'money' ? money(v) : GOAL_LABEL[m].kind === 'int' ? int(v) : pct(v, 1))

  async function save(metric: Metric) {
    const raw = val.replace(/\./g, '').replace(',', '.')
    const target = GOAL_LABEL[metric].kind === 'pct' ? Number(raw) / 100 : Number(raw)
    const r = await fetch('/api/v2/goals', { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ month, metric, target: Number.isFinite(target) ? target : 0 }) })
    const j = await r.json().catch(() => ({}))
    if (!r.ok) return setMsg(j.error || 'No se pudo guardar')
    setEdit(null); setMsg(null); router.refresh()
  }

  return (
    <Panel title="Objetivos del mes" description="Metas por indicador. El avance se compara con el ritmo del mes: a mitad de mes deberías llevar la mitad." padded={false}>
      {missing && <p className="px-5 pt-3 text-[13px] text-warn">Falta correr la migración 20261015_decisiones.sql para guardar objetivos.</p>}
      <ul className="divide-y divide-line">
        {ORDER.map((m) => {
          const g = goals.find((x) => x.metric === m)
          const a = actual[m]
          const prog = g && a != null ? goalProgress(g, a, dayShare) : null
          const tone = !prog ? 'bg-sunken' : prog.status === 'ok' ? 'bg-good' : prog.status === 'warn' ? 'bg-warn' : 'bg-bad'
          return (
            <li key={m} className="px-5 py-3 grid grid-cols-[1fr_auto] sm:grid-cols-[180px_1fr_auto_auto] items-center gap-x-4 gap-y-1 text-[13.5px]">
              <span className="text-ink font-medium">{GOAL_LABEL[m].label}</span>
              <div className="col-span-2 sm:col-span-1 flex items-center gap-3">
                <div className="h-2 flex-1 rounded-full bg-sunken overflow-hidden"><div className={`h-full rounded-full ${tone}`} style={{ width: `${prog ? Math.min(100, Math.round(prog.pace * 100)) : 0}%` }} /></div>
                <span className="num text-mute w-28 text-right">{prog ? `${Math.round(prog.pace * 100)}% del ritmo` : 'sin meta'}</span>
              </div>
              <span className="num text-ink">{fmt(m, a)}<span className="text-faint"> / {g ? fmt(m, g.target) : '—'}</span></span>
              {canEdit && (edit === m ? (
                <span className="flex gap-1.5">
                  <input autoFocus value={val} onChange={(e) => setVal(e.target.value)} onKeyDown={(e) => { if (e.key === 'Enter') save(m); if (e.key === 'Escape') setEdit(null) }} placeholder={GOAL_LABEL[m].kind === 'pct' ? '%' : 'meta'} className="w-28 rounded-md border border-line bg-surface px-2 py-1 num" />
                  <button onClick={() => save(m)} className="rounded-md bg-ink text-bg px-2 py-1 text-[12.5px]">OK</button>
                </span>
              ) : (
                <button onClick={() => { setEdit(m); setVal(g ? String(GOAL_LABEL[m].kind === 'pct' ? Math.round(g.target * 1000) / 10 : Math.round(g.target)) : '') }} className="text-[12.5px] text-mute hover:text-ink underline">{g ? 'Cambiar' : 'Poner meta'}</button>
              ))}
            </li>
          )
        })}
      </ul>
      {msg && <p className="px-5 pb-3 text-[13px] text-bad">{msg}</p>}
    </Panel>
  )
}
