'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { Panel } from '../ui'

const ROLE: Record<string, string> = { owner: 'Dueño', editor: 'Edita', viewer: 'Solo lectura' }

export default function Team({ members, isOwner, workspaceName }: { members: { user_id: string; role: string; email: string; you: boolean }[]; isOwner: boolean; workspaceName: string }) {
  const router = useRouter()
  const [email, setEmail] = useState('')
  const [role, setRole] = useState('viewer')
  const [msg, setMsg] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  async function invite(e: React.FormEvent) {
    e.preventDefault()
    setBusy(true); setMsg(null)
    const r = await fetch('/api/v2/team', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ email, role }) })
    const j = await r.json().catch(() => ({}))
    setBusy(false)
    setMsg(r.ok ? `Listo: ${email} ya puede entrar a ${workspaceName}. Si no tenía cuenta, le llega un mail para crear su contraseña.` : j.error || 'No se pudo invitar')
    if (r.ok) { setEmail(''); router.refresh() }
  }
  async function setMemberRole(user_id: string, r: string) {
    await fetch('/api/v2/team', { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ user_id, role: r }) })
    router.refresh()
  }
  async function remove(user_id: string) {
    if (!window.confirm('¿Quitar a esta persona del negocio?')) return
    await fetch(`/api/v2/team?user=${user_id}`, { method: 'DELETE' })
    router.refresh()
  }

  return (
    <Panel title="Equipo" description="Quién entra a este negocio. Solo lectura ve todo pero no puede cambiar campañas, costos ni conexiones.">
      <ul className="divide-y divide-line mb-5">
        {members.map((m) => (
          <li key={m.user_id} className="py-2.5 flex flex-wrap items-center gap-3 text-[13.5px]">
            <span className="flex-1 min-w-0 text-ink truncate">{m.email}{m.you && <span className="text-mute"> (vos)</span>}</span>
            {isOwner && !m.you ? (
              <>
                <select value={m.role} onChange={(e) => setMemberRole(m.user_id, e.target.value)} className="rounded-lg border border-line bg-surface px-2 py-1.5">
                  {Object.entries(ROLE).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
                </select>
                <button onClick={() => remove(m.user_id)} className="text-mute hover:text-bad text-[12.5px]">Quitar</button>
              </>
            ) : <span className="text-mute">{ROLE[m.role] || m.role}</span>}
          </li>
        ))}
      </ul>
      {isOwner && (
        <form onSubmit={invite} className="flex flex-wrap items-center gap-2 text-[13.5px]">
          <input type="email" required value={email} onChange={(e) => setEmail(e.target.value)} placeholder="email@ejemplo.com" className="flex-1 min-w-[220px] rounded-lg border border-line bg-surface px-3 py-2" />
          <select value={role} onChange={(e) => setRole(e.target.value)} className="rounded-lg border border-line bg-surface px-2 py-2">
            <option value="viewer">Solo lectura</option><option value="editor">Edita</option><option value="owner">Dueño</option>
          </select>
          <button disabled={busy} className="rounded-lg bg-ink text-surface px-4 py-2 font-semibold disabled:opacity-60">{busy ? 'Invitando' : 'Invitar'}</button>
        </form>
      )}
      {msg && <p className="mt-3 text-[13.5px] text-ink">{msg}</p>}
    </Panel>
  )
}
