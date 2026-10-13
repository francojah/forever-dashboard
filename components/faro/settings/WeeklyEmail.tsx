'use client'

import { useEffect, useMemo, useState } from 'react'
import { Panel } from '../ui'

interface LogRow { kind: string; week_to: string | null; recipients: string[]; ok: boolean; error: string | null; sent_by: string | null; sent_at: string }
const KIND: Record<string, string> = { 'semanal-auto': 'Automático (lunes)', 'semanal-equipo': 'Al equipo', 'semanal-prueba': 'Prueba', 'semanal-otros': 'A otros mails' }
const dd = (d: string) => `${d.slice(8, 10)}/${d.slice(5, 7)}`
const addDays = (ymd: string, n: number) => { const d = new Date(`${ymd}T12:00:00Z`); d.setUTCDate(d.getUTCDate() + n); return d.toISOString().slice(0, 10) }

/** Resumen semanal por mail: prendido/apagado, vista previa, envío manual (a vos, al equipo o a otros), reenvío e historial. */
export default function WeeklyEmail({ enabled, canEdit, mailReady, timezone }: { enabled: boolean; canEdit: boolean; mailReady: boolean; timezone: string }) {
  const [on, setOn] = useState(enabled)
  const [msg, setMsg] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const [log, setLog] = useState<LogRow[]>([])
  const [team, setTeam] = useState<string[]>([])
  const [missing, setMissing] = useState(false)
  const [others, setOthers] = useState('')
  // Semanas disponibles: la última completa (hasta ayer) y las 7 anteriores, terminando en domingo cuando corresponde
  const weeks = useMemo(() => {
    const today = new Intl.DateTimeFormat('en-CA', { timeZone: timezone, year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date())
    const yesterday = addDays(today, -1)
    const out = [{ key: yesterday, label: `Últimos 7 días (${dd(addDays(yesterday, -6))} al ${dd(yesterday)})` }]
    // Domingos anteriores
    let d = yesterday
    while (new Date(`${d}T12:00:00Z`).getUTCDay() !== 0) d = addDays(d, -1)
    for (let i = 0; i < 8; i++) { if (d !== yesterday) out.push({ key: d, label: `Semana del ${dd(addDays(d, -6))} al ${dd(d)}` }); d = addDays(d, -7) }
    return out
  }, [timezone])
  const [week, setWeek] = useState(weeks[0].key)

  async function refresh() {
    const j = await fetch('/api/v2/weekly?log=1').then((r) => r.json()).catch(() => null)
    if (j) { setLog(j.log || []); setTeam(j.team || []); setMissing(!!j.missing) }
  }
  useEffect(() => { refresh() }, [])

  async function toggle() {
    setBusy(true); setMsg(null)
    const r = await fetch('/api/v2/settings', { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ weekly_email: !on }) })
    setBusy(false)
    if (r.ok) setOn(!on); else setMsg('No se pudo guardar')
  }
  async function send(to: 'me' | 'team' | string[], w = week) {
    setBusy(true); setMsg(null)
    const r = await fetch('/api/v2/weekly', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ to, week: w }) })
    const j = await r.json().catch(() => ({}))
    setBusy(false)
    setMsg(r.ok ? `Enviado a ${j.to.length === 1 ? j.to[0] : `${j.to.length} personas`} (semana del ${dd(j.week.from)} al ${dd(j.week.to)}).` : j.error || 'No se pudo enviar')
    if (r.ok && Array.isArray(to)) setOthers('')
    refresh()
  }
  const btn = 'rounded-md border border-line px-3 py-1.5 hover:bg-sunken disabled:opacity-50'

  return (
    <Panel title="Resumen semanal por mail" description="Ventas, ganancia, inversión, los anuncios que mejor y peor anduvieron y las propuestas de tus reglas. Sale solo los lunes a la mañana a dueños y editores, y también lo podés mandar cuando quieras.">
      <div className="flex flex-col gap-4 text-[13.5px]">
        <label className="flex items-center gap-2">
          <input type="checkbox" checked={on} disabled={!canEdit || busy} onChange={toggle} className="accent-[rgb(var(--f-ink))]" />
          Envío automático de los lunes: {on ? 'prendido' : 'apagado'}
        </label>

        {!mailReady && <p className="text-mute">El envío de mails todavía no está configurado en Faro. Mientras tanto podés ver la vista previa.</p>}
        {missing && <p className="rounded-lg border border-warn/40 bg-warn/5 px-3 py-2 text-ink">Falta correr la migración 20261017_mail_log.sql para guardar el historial de envíos.</p>}

        <div className="rounded-lg border border-line p-3 flex flex-col gap-3">
          <p className="font-medium text-ink">Enviar ahora</p>
          <label className="flex flex-wrap items-center gap-2">Semana
            <select value={week} onChange={(e) => setWeek(e.target.value)} className="rounded-lg border border-line bg-surface px-2.5 py-1.5">
              {weeks.map((w) => <option key={w.key} value={w.key}>{w.label}</option>)}
            </select>
            <a href={`/api/v2/weekly?week=${week}`} target="_blank" rel="noreferrer" className="underline text-mute hover:text-ink">Ver vista previa</a>
          </label>
          <div className="flex flex-wrap gap-2">
            <button disabled={!mailReady || busy} onClick={() => send('me')} className={btn}>Enviarme a mí</button>
            {canEdit && <button disabled={!mailReady || busy || !team.length} onClick={() => send('team')} className={btn} title={team.join(', ')}>Enviar al equipo{team.length ? ` (${team.length})` : ''}</button>}
          </div>
          {canEdit && (
            <div className="flex flex-wrap gap-2 items-center">
              <input value={others} onChange={(e) => setOthers(e.target.value)} placeholder="otros mails, separados por coma (socio, contador…)" className="flex-1 min-w-[260px] rounded-lg border border-line bg-surface px-3 py-1.5" />
              <button disabled={!mailReady || busy || !others.trim()} onClick={() => send(others.split(/[,;\s]+/).filter(Boolean))} className={btn}>Enviar a esos mails</button>
            </div>
          )}
          {msg && <p className="text-mute">{msg}</p>}
        </div>

        {log.length > 0 && (
          <div>
            <p className="font-medium text-ink mb-1.5">Últimos envíos</p>
            <ul className="divide-y divide-line border-y border-line">
              {log.map((l, i) => (
                <li key={i} className="py-2 flex flex-wrap items-center gap-x-3 gap-y-1">
                  <span className={`w-2 h-2 rounded-full ${l.ok ? 'bg-good' : 'bg-bad'}`} aria-hidden />
                  <span className="text-ink">{KIND[l.kind] || l.kind}{l.week_to ? ` · semana al ${dd(l.week_to)}` : ''}</span>
                  <span className="text-mute truncate max-w-[320px]" title={l.recipients.join(', ')}>{l.recipients.length === 1 ? l.recipients[0] : `${l.recipients.length} destinatarios`}</span>
                  <span className="text-faint num">{new Date(l.sent_at).toLocaleString('es-AR', { timeZone: timezone, day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })}</span>
                  {!l.ok && l.error && <span className="text-bad">{l.error}</span>}
                  {canEdit && l.week_to && mailReady && <button disabled={busy} onClick={() => send(l.kind === 'semanal-prueba' ? 'me' : l.kind === 'semanal-otros' ? l.recipients : 'team', l.week_to!)} className="ml-auto text-[12.5px] underline text-mute hover:text-ink">Reenviar</button>}
                </li>
              ))}
            </ul>
          </div>
        )}
      </div>
    </Panel>
  )
}
