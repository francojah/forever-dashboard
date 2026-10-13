'use client'

import { useState } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { Panel } from './ui'
import { money, moneyAxisIn } from '@/lib/faro/format'
import type { Diagnosis } from '@/lib/faro/diagnose'
import type { FollowupRow } from '@/lib/faro/followups'
import type { AskResult } from '@/lib/faro/ask'

const AREA: Record<string, string> = { anuncios: 'Anuncios', productos: 'Productos', stock: 'Stock', pagos: 'Pagos', embudo: 'Embudo', clientes: 'Clientes' }
const dd = (d: string) => `${d.slice(8, 10)}/${d.slice(5, 7)}`

/** Qué pasó esta semana: diagnóstico automático con la causa. */
export function WeekDiagnosis({ d }: { d: Diagnosis }) {
  const [open, setOpen] = useState(d.moved)
  return (
    <section className={`rounded-panel border bg-surface px-5 py-4 ${d.moved ? 'border-beacon/50' : 'border-line'}`} aria-label="Qué pasó esta semana">
      <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
        <p className="text-[15px] font-semibold text-ink">Qué pasó esta semana</p>
        <p className="text-[12.5px] text-mute">{dd(d.from)} al {dd(d.to)} contra los 7 días anteriores</p>
        {d.findings.length > 0 && <button onClick={() => setOpen(!open)} className="ml-auto text-[12.5px] text-mute hover:text-ink underline">{open ? 'Ocultar detalle' : `Ver ${d.findings.length} hallazgos`}</button>}
      </div>
      <p className="mt-2 text-[14px] text-ink leading-relaxed">{d.summary}</p>
      {open && d.findings.length > 0 && (
        <ul className="mt-3 divide-y divide-line border-t border-line">
          {d.findings.map((f, i) => (
            <li key={i} className="py-2.5 flex gap-3 text-[13.5px]">
              <span className={`mt-1.5 w-2 h-2 rounded-full shrink-0 ${f.level === 'bad' ? 'bg-bad' : f.level === 'good' ? 'bg-good' : 'bg-faint'}`} aria-hidden />
              <div className="min-w-0 flex-1">
                <p className="text-ink font-medium">{f.href ? <Link href={f.href} className="hover:underline">{f.title}</Link> : f.title} <span className="text-faint font-normal">· {AREA[f.area]}</span></p>
                <p className="text-mute">{f.detail}</p>
              </div>
              {f.impact > 0 && <span className="num text-[12.5px] text-mute shrink-0" title="Plata en juego, aproximada">{money(f.impact)}</span>}
            </li>
          ))}
        </ul>
      )}
    </section>
  )
}

/** Seguimiento de decisiones: resultado de lo que aprobaste hace una semana. */
export function Followups({ resolved, upcoming }: { resolved: FollowupRow[]; upcoming: FollowupRow[] }) {
  const router = useRouter()
  const [hidden, setHidden] = useState<Set<string>>(new Set())
  if (!resolved.length && !upcoming.length) return null
  async function seen(ids: string[]) {
    setHidden(new Set([...Array.from(hidden), ...ids]))
    await fetch('/api/v2/followups', { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ ids }) })
    router.refresh()
  }
  const show = resolved.filter((r) => !hidden.has(r.id))
  const tone = (v: string) => (v === 'mejor' ? 'bg-good' : v === 'peor' ? 'bg-bad' : v === 'igual' ? 'bg-warn' : 'bg-faint')
  return (
    <Panel title="Cómo salieron tus decisiones" description="Cada cambio que aprobás vuelve a los 7 días con la semana anterior y la posterior comparadas." padded={false}
      actions={show.length > 1 ? <button onClick={() => seen(show.map((r) => r.id))} className="text-[12.5px] text-mute hover:text-ink underline">Marcar todo como visto</button> : undefined}>
      <ul className="divide-y divide-line">
        {show.map((r) => (
          <li key={r.id} className="px-5 py-3 flex gap-3 text-[13.5px]">
            <span className={`mt-1.5 w-2 h-2 rounded-full shrink-0 ${tone(r.result!.verdict)}`} aria-hidden />
            <div className="min-w-0 flex-1">
              <p className="text-ink">{r.result!.text}</p>
              <p className="text-[12px] text-mute">Aplicado el {dd(r.applied_at.slice(0, 10))}{r.entity_id ? <> · <Link href={`/anuncios?focus=${r.entity_id}`} className="underline hover:text-ink">ver en Anuncios</Link></> : null}</p>
            </div>
            <button onClick={() => seen([r.id])} className="shrink-0 text-[12.5px] text-mute hover:text-ink">Visto</button>
          </li>
        ))}
        {upcoming.length > 0 && (
          <li className="px-5 py-2.5 text-[12.5px] text-mute">
            En seguimiento: {upcoming.slice(0, 4).map((u) => `${u.entity_name || u.kind} (resultado el ${dd(u.check_at)})`).join(' · ')}{upcoming.length > 4 ? ` y ${upcoming.length - 4} más` : ''}
          </li>
        )}
      </ul>
    </Panel>
  )
}

/** Preguntale a Faro: una pregunta en lenguaje natural, una respuesta con números y, si ayuda, un gráfico. */
export function AskFaro({ configured, suggestions }: { configured: boolean; suggestions: string[] }) {
  const [q, setQ] = useState('')
  const [busy, setBusy] = useState(false)
  const [res, setRes] = useState<AskResult | null>(null)
  const [err, setErr] = useState<string | null>(null)
  async function send(question: string) {
    if (!question.trim()) return
    setBusy(true); setErr(null); setRes(null); setQ(question)
    try {
      const r = await fetch('/api/v2/ask', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ question }) })
      const j = await r.json()
      if (!r.ok) throw new Error(j.error || 'No se pudo responder')
      setRes(j)
    } catch (e) { setErr((e as Error).message) } finally { setBusy(false) }
  }
  return (
    <Panel title="Preguntale a Faro" description={configured ? 'Sobre tus ventas, anuncios, productos, clientes o finanzas. Responde con tus números.' : 'Para activarlo hace falta la clave de la IA en Vercel (ANTHROPIC_API_KEY).'}>
      <form onSubmit={(e) => { e.preventDefault(); send(q) }} className="flex gap-2">
        <input value={q} onChange={(e) => setQ(e.target.value)} disabled={!configured || busy} placeholder="¿Cuánto gané la semana pasada comparado con la anterior?" className="flex-1 rounded-lg border border-line bg-surface px-3.5 py-2.5 text-[14px] placeholder:text-faint focus:border-beacon focus:outline-none" />
        <button type="submit" disabled={!configured || busy || q.trim().length < 3} className="rounded-lg bg-ink text-bg px-4 py-2.5 text-[14px] font-medium disabled:opacity-50">{busy ? 'Pensando…' : 'Preguntar'}</button>
      </form>
      {!res && !busy && configured && (
        <div className="mt-2.5 flex flex-wrap gap-1.5">
          {suggestions.map((s) => <button key={s} onClick={() => send(s)} className="rounded-full border border-line px-2.5 py-1 text-[12.5px] text-mute hover:text-ink hover:bg-sunken">{s}</button>)}
        </div>
      )}
      {err && <p className="mt-3 text-[13.5px] text-bad">{err}</p>}
      {res && (
        <div className="mt-4">
          <p className="text-[14.5px] text-ink leading-relaxed">{res.answer.respuesta}</p>
          {res.series && res.series.points.length > 1 && <MiniChart s={res.series} />}
          <p className="mt-2 text-[12px] text-faint">Calculado con tus datos de Faro{res.answer.datos_usados?.length ? ` (${res.answer.datos_usados.slice(0, 4).join(', ')})` : ''}. Revisá los números antes de decidir algo grande.</p>
        </div>
      )}
    </Panel>
  )
}

function MiniChart({ s }: { s: NonNullable<AskResult['series']> }) {
  const pts = s.points.slice(-60)
  const W = 720, H = 180, L = 60, B = 26, T = 10, R = 10
  const ys = pts.map((p) => p.y), yMax = Math.max(...ys, 1), yMin = Math.min(0, ...ys)
  const X = (i: number) => L + (i / Math.max(1, pts.length - 1)) * (W - L - R), Y = (v: number) => T + (1 - (v - yMin) / (yMax - yMin || 1)) * (H - T - B)
  const bar = pts.length <= 12
  const bw = bar ? ((W - L - R) / pts.length) * 0.6 : 0
  return (
    <figure className="mt-3">
      <svg viewBox={`0 0 ${W} ${H}`} className="w-full h-auto" role="img" aria-label={s.label}>
        {[0, 0.5, 1].map((t) => { const v = yMin + (yMax - yMin) * t; return <g key={t}><line x1={L} x2={W - R} y1={Y(v)} y2={Y(v)} stroke="rgb(var(--f-line))" /><text x={L - 6} y={Y(v) + 4} textAnchor="end" fontSize="11" fill="rgb(var(--f-mute))">{moneyAxisIn(v, 'ARS')}</text></g> })}
        {bar ? pts.map((p, i) => <rect key={p.x} x={X(i) - bw / 2} y={Math.min(Y(p.y), Y(0))} width={bw} height={Math.abs(Y(p.y) - Y(0))} rx="3" fill={p.y < 0 ? 'rgb(var(--f-bad) / 0.7)' : 'rgb(var(--f-ink) / 0.55)'}><title>{`${p.x}: ${money(p.y)}`}</title></rect>)
          : <path d={pts.map((p, i) => `${i ? 'L' : 'M'}${X(i).toFixed(1)},${Y(p.y).toFixed(1)}`).join(' ')} fill="none" stroke="rgb(var(--f-beacon))" strokeWidth="2" />}
        {pts.map((p, i) => (i === 0 || i === pts.length - 1 || (bar && pts.length <= 12)) && <text key={`l${p.x}`} x={X(i)} y={H - 8} textAnchor={i === 0 ? 'start' : i === pts.length - 1 ? 'end' : 'middle'} fontSize="11" fill="rgb(var(--f-mute))">{p.x.length === 7 ? p.x.slice(5) + '/' + p.x.slice(2, 4) : dd(p.x)}</text>)}
      </svg>
      <figcaption className="text-[12px] text-mute">{s.label}</figcaption>
    </figure>
  )
}
