'use client'

import { useState } from 'react'
import Link from 'next/link'
import { money } from '@/lib/faro/format'
import type { Proposal } from '@/lib/faro/rules'
import type { PlanPacing } from '@/lib/faro/budgetPlan'

const ACTION_TEXT = (p: Proposal) =>
  p.action === 'pause' ? 'Pausar'
    : p.action === 'budget_down' ? `Bajar presupuesto a ${money(Number(p.to))}`
      : p.action === 'budget_up' ? `Subir presupuesto a ${money(Number(p.to))}`
        : 'Revisar'

/** Propuestas de las reglas: nada se aplica sin aprobación. "Agregar" las suma a los cambios pendientes. */
export function ProposalsBox({ proposals, staged, canEdit, onAdd, onOpen }: {
  proposals: Proposal[]; staged: (p: Proposal) => boolean; canEdit: boolean
  onAdd: (list: Proposal[]) => void; onOpen: (id: string) => void
}) {
  const [all, setAll] = useState(false)
  const actionable = proposals.filter((p) => p.field && !staged(p))
  const shown = all ? proposals : proposals.slice(0, 4)
  return (
    <section className="rounded-panel border border-line bg-surface px-4 py-3" aria-label="Propuestas de tus reglas">
      <div className="flex flex-wrap items-center gap-2">
        <p className="text-[13.5px] font-semibold text-ink">{proposals.length} {proposals.length === 1 ? 'propuesta' : 'propuestas'} de tus reglas</p>
        <span className="text-[12.5px] text-mute">Nada se aplica sin tu aprobación. Los ad sets protegidos no se tocan.</span>
        <span className="ml-auto flex gap-2">
          <Link href="/anuncios?tab=reglas" className="text-[12.5px] text-mute hover:text-ink underline">Editar reglas</Link>
          {canEdit && actionable.length > 1 && <button onClick={() => onAdd(actionable)} className="rounded-md border border-line px-2.5 py-1 text-[12.5px] hover:bg-sunken">Agregar todas a cambios</button>}
        </span>
      </div>
      <ul className="mt-2 flex flex-col divide-y divide-line">
        {shown.map((p) => (
          <li key={`${p.ruleId}:${p.nodeId}`} className="py-2 flex flex-wrap items-center gap-x-3 gap-y-1 text-[13px]">
            <span className="min-w-0 flex-1">
              <button onClick={() => onOpen(p.nodeId)} className="text-ink font-medium hover:underline text-left">{p.name}</button>
              <span className="block text-mute">{p.ruleName}: {p.reason}</span>
            </span>
            <span className={`font-medium ${p.action === 'budget_up' ? 'text-good' : p.action === 'notify' ? 'text-mute' : 'text-warn'}`}>{ACTION_TEXT(p)}</span>
            {canEdit && p.field && (staged(p)
              ? <span className="text-[12.5px] text-mute">En cambios</span>
              : <button onClick={() => onAdd([p])} className="rounded-md border border-line px-2.5 py-1 text-[12.5px] hover:bg-sunken">Agregar a cambios</button>)}
          </li>
        ))}
      </ul>
      {proposals.length > 4 && <button onClick={() => setAll(!all)} className="mt-1 text-[12.5px] text-mute hover:text-ink underline">{all ? 'Ver menos' : `Ver las ${proposals.length}`}</button>}
    </section>
  )
}

/** Plan de inversión del mes: barra de avance contra el ritmo parejo y el presupuesto diario que cierra en el plan. */
export function PlanCard({ plan }: { plan: PlanPacing }) {
  const max = Math.max(plan.plan, plan.forecast, plan.spent) || 1
  const w = (v: number) => `${Math.min(100, (v / max) * 100)}%`
  const diff = plan.forecast - plan.plan
  const tone = plan.status === 'ok' ? 'text-good' : 'text-warn'
  const msg = plan.status === 'ok' ? 'Vas en línea con el plan.'
    : plan.status === 'over' ? `A este ritmo te pasás ${money(diff)}.`
      : `A este ritmo quedan ${money(-diff)} sin invertir.`
  const budgetGap = plan.dailyNow > 0 ? plan.dailyNeeded - plan.dailyNow : null
  return (
    <section className="rounded-panel border border-line bg-surface px-4 py-3" aria-label="Plan de inversión del mes">
      <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
        <p className="text-[13.5px] font-semibold text-ink">Plan del mes</p>
        <p className="text-[13px] text-mute num">{money(plan.spent)} de {money(plan.plan)} · día {Math.ceil(plan.daysElapsed)} de {plan.daysInMonth}</p>
        <p className={`text-[13px] font-medium ${tone}`}>{msg}</p>
        <Link href="/anuncios?tab=reglas" className="ml-auto text-[12.5px] text-mute hover:text-ink underline">Cambiar plan</Link>
      </div>
      <div className="relative mt-2.5 h-2.5 rounded-full bg-sunken" role="img" aria-label={`Gastado ${money(plan.spent)}, esperado ${money(plan.expected)}, plan ${money(plan.plan)}`}>
        <div className="absolute inset-y-0 left-0 rounded-full bg-beacon" style={{ width: w(plan.spent) }} />
        <div className="absolute -inset-y-1 w-0.5 bg-ink" style={{ left: w(plan.expected) }} title={`Deberías llevar ${money(plan.expected)}`} />
      </div>
      <div className="mt-2 grid grid-cols-2 sm:grid-cols-4 gap-2 text-[12.5px]">
        <p><span className="text-mute block">Deberías llevar</span><span className="num text-ink">{money(plan.expected)}</span></p>
        <p><span className="text-mute block">Cierre proyectado</span><span className={`num ${tone}`}>{money(plan.forecast)}</span></p>
        <p><span className="text-mute block">Por día para cerrar en el plan</span><span className="num text-ink">{money(plan.dailyNeeded)}</span></p>
        <p><span className="text-mute block">Presupuestos diarios activos</span><span className="num text-ink">{plan.dailyNow > 0 ? money(plan.dailyNow) : '—'}</span>
          {budgetGap != null && Math.abs(budgetGap) > plan.dailyNeeded * 0.1 && <span className="block text-mute">{budgetGap > 0 ? `faltan ${money(budgetGap)}/día` : `sobran ${money(-budgetGap)}/día`}</span>}
        </p>
      </div>
    </section>
  )
}
