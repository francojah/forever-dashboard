'use client'

import { useState } from 'react'
import type { TreeNode } from '@/lib/faro/adsTree'
import { money } from '@/lib/faro/format'

export type Field = 'status' | 'daily_budget' | 'name' | 'age_min' | 'age_max' | 'genders' | 'copy'
export interface Pending { key: string; node: TreeNode; field: Field; from: unknown; to: unknown; label: string; warning?: string }
export interface Account { id: string; name: string; external_id: string; protected_ids: string[] }

export const LEVEL: Record<TreeNode['level'], string> = { campaign: 'Campaña', adset: 'Ad set', ad: 'Anuncio' }

export function warningFor(node: TreeNode, field: Field, from: unknown, to: unknown): string | undefined {
  if (field === 'daily_budget') {
    const a = Number(from), b = Number(to)
    if (a > 0 && Math.abs(b - a) / a > 0.2) return 'Cambio de más de 20%: puede reiniciar el aprendizaje.'
  }
  if (field === 'status' && to === 'PAUSED' && node.level !== 'ad' && node.m.spend > 0) return 'Si queda pausado más de 7 días, al reactivarlo vuelve a aprendizaje.'
  if (field === 'age_min' || field === 'age_max' || field === 'genders') return 'Cambia la segmentación: reinicia el aprendizaje del ad set.'
  if (field === 'copy') return 'Crea un creativo nuevo: el anuncio vuelve a revisión y aprendizaje.'
  return undefined
}

export function describe(field: Field, v: unknown): string {
  if (field === 'status') return v === 'ACTIVE' ? 'Activo' : 'Pausado'
  if (field === 'daily_budget') return money(Number(v))
  if (field === 'genders') { const g = (v as number[]) || []; return g.length === 1 ? (g[0] === 1 ? 'Hombres' : 'Mujeres') : 'Todos' }
  if (field === 'copy') { const c = v as { message?: string; headline?: string; link?: string }; return [c.headline, c.message?.slice(0, 60), c.link].filter(Boolean).join(' · ') || '—' }
  return v == null || v === '' ? '—' : String(v)
}

export function EditDialog({ editing, onClose, onStage }: { editing: { node: TreeNode; kind: 'name' | 'targeting' | 'copy' }; onClose: () => void; onStage: (field: Field, to: unknown, from?: unknown) => void }) {
  const n = editing.node
  const t = (n.targeting || {}) as { age_min?: number; age_max?: number; genders?: number[] }
  const [name, setName] = useState(n.name)
  const [ageMin, setAgeMin] = useState(t.age_min ?? 18)
  const [ageMax, setAgeMax] = useState(t.age_max ?? 65)
  const [gender, setGender] = useState(t.genders?.length === 1 ? String(t.genders[0]) : 'all')
  const [message, setMessage] = useState('')
  const [headline, setHeadline] = useState('')
  const [link, setLink] = useState('')
  const [stagedMulti, setStagedMulti] = useState(false)

  return (
    <div className="fixed inset-0 z-40 bg-ink/40 grid place-items-center p-4" role="dialog" aria-modal="true" onClick={onClose}>
      <div className="w-full max-w-md rounded-panel border border-line bg-surface p-5" onClick={(e) => e.stopPropagation()}>
        <h3 className="text-[16px] font-semibold text-ink">{editing.kind === 'name' ? 'Cambiar nombre' : editing.kind === 'targeting' ? 'Edad y género' : 'Texto y link del anuncio'}</h3>
        <p className="text-[13px] text-mute mt-0.5 truncate">{n.name}</p>
        <div className="mt-4 flex flex-col gap-3 text-[13.5px]">
          {editing.kind === 'name' && (
            <label className="flex flex-col gap-1">Nombre<input value={name} onChange={(e) => setName(e.target.value)} className="rounded-lg border border-line bg-surface px-3 py-2" /></label>
          )}
          {editing.kind === 'targeting' && (
            <>
              <div className="flex gap-3">
                <label className="flex flex-col gap-1 flex-1">Edad mínima<input type="number" min={18} max={65} value={ageMin} onChange={(e) => setAgeMin(Number(e.target.value))} className="rounded-lg border border-line bg-surface px-3 py-2" /></label>
                <label className="flex flex-col gap-1 flex-1">Edad máxima<input type="number" min={18} max={65} value={ageMax} onChange={(e) => setAgeMax(Number(e.target.value))} className="rounded-lg border border-line bg-surface px-3 py-2" /></label>
              </div>
              <label className="flex flex-col gap-1">Género
                <select value={gender} onChange={(e) => setGender(e.target.value)} className="rounded-lg border border-line bg-surface px-3 py-2">
                  <option value="all">Todos</option><option value="1">Hombres</option><option value="2">Mujeres</option>
                </select>
              </label>
              <p className="text-warn text-[12.5px]">Cambiar la segmentación reinicia el aprendizaje del ad set. En campañas Advantage+ Meta puede ignorar estos límites.</p>
            </>
          )}
          {editing.kind === 'copy' && (
            <>
              <label className="flex flex-col gap-1">Texto principal (vacío = sin cambios)<textarea rows={4} value={message} onChange={(e) => setMessage(e.target.value)} className="rounded-lg border border-line bg-surface px-3 py-2" /></label>
              <label className="flex flex-col gap-1">Título (vacío = sin cambios)<input value={headline} onChange={(e) => setHeadline(e.target.value)} className="rounded-lg border border-line bg-surface px-3 py-2" /></label>
              <label className="flex flex-col gap-1">Link de destino (vacío = sin cambios)<input value={link} onChange={(e) => setLink(e.target.value)} placeholder="https://" className="rounded-lg border border-line bg-surface px-3 py-2" /></label>
              <p className="text-warn text-[12.5px]">Se crea un creativo nuevo con estos cambios: el anuncio vuelve a revisión de Meta y a aprendizaje.</p>
            </>
          )}
        </div>
        <div className="mt-5 flex justify-end gap-2">
          <button onClick={onClose} className="rounded-lg px-3 py-2 text-[13.5px] text-mute hover:text-ink">Cancelar</button>
          <button
            disabled={stagedMulti}
            onClick={() => {
              if (editing.kind === 'name') onStage('name', name.trim())
              else if (editing.kind === 'copy') {
                const v: Record<string, string> = {}
                if (message.trim()) v.message = message.trim()
                if (headline.trim()) v.headline = headline.trim()
                if (link.trim()) v.link = link.trim()
                if (Object.keys(v).length) onStage('copy', v, {})
                else onClose()
              } else {
                setStagedMulti(true)
                if (ageMin !== (t.age_min ?? 18)) onStage('age_min', ageMin, t.age_min ?? 18)
                if (ageMax !== (t.age_max ?? 65)) onStage('age_max', ageMax, t.age_max ?? 65)
                const g = gender === 'all' ? [] : [Number(gender)]
                if (JSON.stringify(g) !== JSON.stringify(t.genders?.length === 1 ? t.genders : [])) onStage('genders', g, t.genders || [])
                onClose()
              }
            }}
            className="rounded-lg bg-ink text-surface px-4 py-2 text-[13.5px] font-semibold"
          >
            Agregar a cambios
          </button>
        </div>
      </div>
    </div>
  )
}


/** Cuánto del presupuesto diario se gastó hoy, contra lo esperable a esta hora. */
export function Pacing({ spent, budget, hourShare }: { spent: number; budget: number; hourShare: number }) {
  const share = budget > 0 ? spent / budget : 0
  const expected = Math.max(0.05, hourShare)
  const tone = share > expected * 1.35 ? 'bg-warn' : share < expected * 0.5 ? 'bg-faint' : 'bg-good'
  return (
    <div className="mt-1 ml-auto w-24" title={`Hoy: ${money(spent)} de ${money(budget)} (${Math.round(share * 100)}%). A esta hora lo esperable es ~${Math.round(hourShare * 100)}%.`}>
      <div className="h-1 rounded-full bg-line overflow-hidden"><div className={`h-full ${tone}`} style={{ width: `${Math.min(100, share * 100)}%` }} /></div>
      <p className="text-[11px] text-faint mt-0.5 num">hoy {money(spent)}</p>
    </div>
  )
}
