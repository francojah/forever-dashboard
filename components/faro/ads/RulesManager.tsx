'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { money } from '@/lib/faro/format'
import { METRICS, ACTIONS, TEMPLATES, type Rule, type RuleMetric, type RuleAction, type RuleLevel } from '@/lib/faro/rules'

const LEVELS: Record<RuleLevel, string> = { campaign: 'Campañas', adset: 'Ad sets', ad: 'Anuncios' }
type Draft = Omit<Rule, 'id'> & { id?: string }

function sentence(r: Omit<Rule, 'id'>) {
  const cond = r.metric === 'frequency_over' ? `frecuencia mayor a ${r.threshold}`
    : r.metric === 'ctr_under' ? `CTR menor a ${r.threshold}%`
      : r.metric === 'cpa_under' ? `costo por compra debajo del ${r.threshold}% del máximo`
        : r.metric === 'no_purchases' ? `gastó ${r.threshold}% del costo máximo sin vender`
          : `costo por compra arriba del ${r.threshold}% del máximo`
  const act = r.action === 'pause' ? 'proponer pausar' : r.action === 'notify' ? 'avisar' : `proponer ${r.action === 'budget_up' ? 'subir' : 'bajar'} el presupuesto ${r.action_pct}%`
  return `${LEVELS[r.level]} con ${cond} en los últimos ${r.days} días → ${act}.`
}

export default function RulesManager({ initialRules, missing, canEdit, plans, thisMonth, nextMonth, avgMonthly }: {
  initialRules: Rule[]; missing: boolean; canEdit: boolean
  plans: Record<string, number>; thisMonth: string; nextMonth: string; avgMonthly: number | null
}) {
  const router = useRouter()
  const [rules, setRules] = useState(initialRules)
  const [draft, setDraft] = useState<Draft | null>(null)
  const [err, setErr] = useState<string | null>(missing ? 'Falta correr la migración 20261012_ads_extras.sql en Supabase para guardar reglas y planes.' : null)
  const [busy, setBusy] = useState(false)
  const [planVals, setPlanVals] = useState<Record<string, string>>({ [thisMonth]: plans[thisMonth] ? String(plans[thisMonth]) : '', [nextMonth]: plans[nextMonth] ? String(plans[nextMonth]) : '' })
  const [planMsg, setPlanMsg] = useState<string | null>(null)

  async function call(method: string, body?: unknown, qs = '') {
    setBusy(true); setErr(null)
    try {
      const r = await fetch(`/api/v2/meta/rules${qs}`, { method, headers: { 'Content-Type': 'application/json' }, body: body ? JSON.stringify(body) : undefined })
      const j = await r.json()
      if (!r.ok) throw new Error(j.error || 'No se pudo guardar')
      const list = await fetch('/api/v2/meta/rules').then((x) => x.json())
      setRules(list.rules || [])
      router.refresh()
      return true
    } catch (e) { setErr((e as Error).message); return false } finally { setBusy(false) }
  }

  async function save() {
    if (!draft) return
    const ok = draft.id ? await call('PATCH', draft) : await call('POST', draft)
    if (ok) setDraft(null)
  }

  async function savePlan(month: string) {
    setPlanMsg(null)
    const amount = Number(String(planVals[month] || '0').replace(/[^\d]/g, '')) || 0
    const r = await fetch('/api/v2/meta/plan', { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ month, amount }) })
    const j = await r.json().catch(() => ({}))
    setPlanMsg(r.ok ? 'Plan guardado.' : j.error || 'No se pudo guardar')
    if (r.ok) router.refresh()
  }

  const monthName = (m: string) => new Date(`${m}-15T12:00:00`).toLocaleDateString('es-AR', { month: 'long', year: 'numeric' })

  return (
    <div className="flex flex-col gap-4">
      {err && <p className="rounded-lg border border-warn/40 bg-warn/5 px-3 py-2 text-[13px] text-ink">{err}</p>}

      {/* Plan mensual */}
      <section className="rounded-panel border border-line bg-surface p-4">
        <h2 className="text-[15px] font-semibold text-ink">Plan de inversión mensual</h2>
        <p className="text-[13px] text-mute mt-0.5">Cuánto querés invertir en Meta en el mes. En Campañas vas a ver el avance, la proyección de cierre y el presupuesto diario que te deja en el plan.{avgMonthly ? ` Promedio de los últimos 3 meses: ${money(avgMonthly)}.` : ''}</p>
        <div className="mt-3 flex flex-wrap gap-4">
          {[thisMonth, nextMonth].map((m) => (
            <label key={m} className="flex flex-col gap-1 text-[13px]">
              <span className="text-mute capitalize">{monthName(m)}</span>
              <span className="flex gap-2">
                <input inputMode="numeric" disabled={!canEdit} value={planVals[m]} onChange={(e) => setPlanVals({ ...planVals, [m]: e.target.value })} placeholder="Sin plan" className="w-40 rounded-lg border border-line bg-surface px-3 py-1.5 num" />
                {canEdit && <button onClick={() => savePlan(m)} className="rounded-md border border-line px-3 py-1.5 hover:bg-sunken">Guardar</button>}
              </span>
            </label>
          ))}
        </div>
        {planMsg && <p className="mt-2 text-[12.5px] text-mute">{planMsg}</p>}
      </section>

      {/* Reglas */}
      <section className="rounded-panel border border-line bg-surface p-4">
        <div className="flex flex-wrap items-baseline gap-2">
          <h2 className="text-[15px] font-semibold text-ink">Reglas</h2>
          <p className="text-[13px] text-mute">Revisan los últimos días completos y <strong className="font-medium text-ink">proponen</strong> cambios en Campañas. Nada se publica sin tu aprobación y los protegidos no se tocan.</p>
          {canEdit && !draft && <button onClick={() => setDraft({ ...TEMPLATES[0], name: '' })} className="ml-auto rounded-md bg-ink text-surface px-3 py-1.5 text-[13px]">Nueva regla</button>}
        </div>

        {rules.length === 0 && !draft && (
          <div className="mt-3">
            <p className="text-[13px] text-mute">Todavía no tenés reglas. Empezá con una de estas:</p>
            <ul className="mt-2 grid gap-2 sm:grid-cols-2">
              {TEMPLATES.map((t) => (
                <li key={t.name} className="rounded-lg border border-line p-3 text-[13px]">
                  <p className="font-medium text-ink">{t.name}</p>
                  <p className="text-mute mt-0.5">{sentence(t)}</p>
                  {canEdit && <button disabled={busy || missing} onClick={() => call('POST', t)} className="mt-2 rounded-md border border-line px-2.5 py-1 hover:bg-sunken disabled:opacity-50">Usar</button>}
                </li>
              ))}
            </ul>
          </div>
        )}

        {rules.length > 0 && (
          <ul className="mt-3 flex flex-col divide-y divide-line">
            {rules.map((r) => (
              <li key={r.id} className="py-2.5 flex flex-wrap items-center gap-x-3 gap-y-1 text-[13px]">
                <span className="min-w-0 flex-1">
                  <span className={`font-medium ${r.active ? 'text-ink' : 'text-mute line-through'}`}>{r.name}</span>
                  <span className="block text-mute">{sentence(r)}</span>
                </span>
                {canEdit && (
                  <span className="flex gap-2">
                    <button disabled={busy} onClick={() => call('PATCH', { ...r, active: !r.active })} className="rounded-md border border-line px-2.5 py-1 hover:bg-sunken">{r.active ? 'Pausar' : 'Activar'}</button>
                    <button disabled={busy} onClick={() => setDraft({ ...r })} className="rounded-md border border-line px-2.5 py-1 hover:bg-sunken">Editar</button>
                    <button disabled={busy} onClick={() => call('DELETE', undefined, `?id=${r.id}`)} className="rounded-md border border-line px-2.5 py-1 hover:bg-sunken text-bad">Borrar</button>
                  </span>
                )}
              </li>
            ))}
          </ul>
        )}

        {draft && (
          <div className="mt-3 rounded-lg border border-line p-3 flex flex-col gap-3 text-[13.5px]">
            <label className="flex flex-col gap-1">Nombre<input value={draft.name} onChange={(e) => setDraft({ ...draft, name: e.target.value })} placeholder={METRICS[draft.metric].label} className="rounded-lg border border-line bg-surface px-3 py-2" /></label>
            <div className="grid gap-3 sm:grid-cols-3">
              <label className="flex flex-col gap-1">Aplica a
                <select value={draft.level} onChange={(e) => { const level = e.target.value as RuleLevel; setDraft({ ...draft, level, action: level === 'ad' && draft.action.startsWith('budget') ? 'pause' : draft.action }) }} className="rounded-lg border border-line bg-surface px-3 py-2">
                  {(Object.keys(LEVELS) as RuleLevel[]).map((l) => <option key={l} value={l}>{LEVELS[l]}</option>)}
                </select>
              </label>
              <label className="flex flex-col gap-1">Condición
                <select value={draft.metric} onChange={(e) => { const metric = e.target.value as RuleMetric; setDraft({ ...draft, metric, threshold: METRICS[metric].def }) }} className="rounded-lg border border-line bg-surface px-3 py-2">
                  {(Object.keys(METRICS) as RuleMetric[]).map((m) => <option key={m} value={m}>{METRICS[m].label}</option>)}
                </select>
              </label>
              <label className="flex flex-col gap-1">Umbral ({METRICS[draft.metric].unit})
                <input type="number" step="0.1" value={draft.threshold ?? ''} onChange={(e) => setDraft({ ...draft, threshold: Number(e.target.value) })} className="rounded-lg border border-line bg-surface px-3 py-2 num" />
              </label>
            </div>
            <p className="text-[12.5px] text-mute -mt-1">{METRICS[draft.metric].help}</p>
            <div className="grid gap-3 sm:grid-cols-3">
              <label className="flex flex-col gap-1">Mirando los últimos
                <select value={draft.days} onChange={(e) => setDraft({ ...draft, days: Number(e.target.value) })} className="rounded-lg border border-line bg-surface px-3 py-2">
                  {[1, 2, 3, 5, 7, 14].map((d) => <option key={d} value={d}>{d} {d === 1 ? 'día' : 'días'}</option>)}
                </select>
              </label>
              <label className="flex flex-col gap-1">Proponer
                <select value={draft.action} onChange={(e) => { const action = e.target.value as RuleAction; setDraft({ ...draft, action, action_pct: action.startsWith('budget') ? draft.action_pct || 15 : null }) }} className="rounded-lg border border-line bg-surface px-3 py-2">
                  {(Object.keys(ACTIONS) as RuleAction[]).filter((a) => draft.level !== 'ad' || !a.startsWith('budget')).map((a) => <option key={a} value={a}>{ACTIONS[a]}</option>)}
                </select>
              </label>
              {draft.action.startsWith('budget') && (
                <label className="flex flex-col gap-1">Porcentaje
                  <input type="number" min={1} max={50} value={draft.action_pct ?? 15} onChange={(e) => setDraft({ ...draft, action_pct: Number(e.target.value) })} className="rounded-lg border border-line bg-surface px-3 py-2 num" />
                </label>
              )}
            </div>
            {draft.action.startsWith('budget') && (draft.action_pct || 0) > 20 && <p className="text-[12.5px] text-warn">Más de 20% de cambio en el presupuesto puede reiniciar el aprendizaje.</p>}
            <p className="text-[12.5px] text-mute">{sentence(draft)}</p>
            <div className="flex gap-2">
              <button disabled={busy} onClick={save} className="rounded-md bg-ink text-surface px-3 py-1.5 disabled:opacity-50">{draft.id ? 'Guardar cambios' : 'Crear regla'}</button>
              <button onClick={() => setDraft(null)} className="rounded-md border border-line px-3 py-1.5 hover:bg-sunken">Cancelar</button>
            </div>
          </div>
        )}
      </section>
    </div>
  )
}
