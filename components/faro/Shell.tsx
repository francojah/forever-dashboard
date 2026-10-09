'use client'

import Link from 'next/link'
import { usePathname, useRouter } from 'next/navigation'
import { useEffect, useState } from 'react'
import { createClientBrowser } from '@/lib/supabase'
import { useTheme } from '@/lib/theme-context'
import SyncStatus, { SourceStatus } from './SyncStatus'

export interface ShellProps {
  userEmail: string
  workspace: { id: string; name: string; modules: string[] }
  workspaces: { id: string; name: string }[]
  sources: SourceStatus[]
  timezone: string
  needsSetup: boolean
  children: React.ReactNode
}

const I = {
  inicio: <path d="M3 11.5 12 4l9 7.5M5.5 10v9.5h13V10" />,
  ventas: <path d="M5 7h14l-1.2 11.2a1.5 1.5 0 0 1-1.5 1.3H7.7a1.5 1.5 0 0 1-1.5-1.3L5 7Zm3.5 0V6a3.5 3.5 0 0 1 7 0v1" />,
  anuncios: <path d="M4 13V9.5a1 1 0 0 1 1-1h3l7-4v15l-7-4H5a1 1 0 0 1-1-1V13Zm4 1.5 1.5 5M18.5 9a4 4 0 0 1 0 5" />,
  finanzas: <path d="M4 19.5h16M6.5 16V11m4 5V7.5m4 8.5v-6m4 6V5" />,
  cambios: <path d="M7 4 4 7l3 3M4 7h12a4 4 0 0 1 4 4M17 20l3-3-3-3m3 3H8a4 4 0 0 1-4-4" />,
  ajustes: <path d="M4 7h10m4 0h2M4 17h4m4 0h8M14 4.5v5M8 14.5v5" />,
}

function Icon({ d }: { d: React.ReactNode }) {
  return <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" className="w-[18px] h-[18px] shrink-0" aria-hidden>{d}</svg>
}

/** Marca de Faro: una torre con su haz. */
export function FaroMark({ className = 'w-6 h-6' }: { className?: string }) {
  return (
    <svg viewBox="0 0 32 32" className={className} aria-hidden>
      <path d="M16 6 30 3v8L16 8Z" fill="rgb(var(--f-beacon))" opacity="0.85" />
      <path d="M13 9h6l2 20H11Z" fill="currentColor" />
      <rect x="12.5" y="5" width="7" height="4.5" rx="1" fill="currentColor" />
      <rect x="14.5" y="14" width="3" height="3" rx="0.5" fill="rgb(var(--f-surface))" />
    </svg>
  )
}

export default function Shell({ userEmail, workspace, workspaces, sources, timezone, needsSetup, children }: ShellProps) {
  const pathname = usePathname()
  const router = useRouter()
  const { theme, toggle } = useTheme()
  const [open, setOpen] = useState(false)
  const [switching, setSwitching] = useState(false)

  useEffect(() => { setOpen(false) }, [pathname])

  const nav = [
    { href: '/', label: 'Inicio', icon: I.inicio },
    { href: '/ventas', label: 'Ventas', icon: I.ventas },
    { href: '/anuncios', label: 'Anuncios', icon: I.anuncios },
    { href: '/finanzas', label: 'Finanzas', icon: I.finanzas },
    ...(workspace.modules.includes('cambios') ? [{ href: '/gestion-cambios', label: 'Cambios', icon: I.cambios }] : []),
    { href: '/ajustes', label: 'Ajustes', icon: I.ajustes },
  ]
  const active = (href: string) => (href === '/' ? pathname === '/' : pathname.startsWith(href))

  async function switchWorkspace(id: string) {
    if (id === '__new') {
      const name = window.prompt('Nombre del negocio nuevo')
      if (!name) return
      setSwitching(true)
      await fetch('/api/v2/workspace', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ create: name }) })
      router.push('/ajustes?tab=conexiones')
      router.refresh()
      setSwitching(false)
      return
    }
    setSwitching(true)
    await fetch('/api/v2/workspace', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ workspace_id: id }) })
    router.refresh()
    setSwitching(false)
  }

  async function logout() {
    await createClientBrowser().auth.signOut()
    router.push('/login')
    router.refresh()
  }

  const rail = (
    <nav className="flex flex-col h-full w-60 bg-surface border-r border-line px-3 py-4" aria-label="Secciones">
      <div className="flex items-center gap-2 px-2 mb-5 text-ink">
        <FaroMark />
        <span className="text-[17px] font-semibold tracking-tight">Faro</span>
      </div>

      <label className="px-2 text-[12px] text-mute" htmlFor="ws-select">Negocio</label>
      <select
        id="ws-select"
        value={workspace.id}
        disabled={switching}
        onChange={(e) => switchWorkspace(e.target.value)}
        className="mx-1 mt-1 mb-5 rounded-lg border border-line bg-sunken px-2.5 py-2 text-[14px] text-ink font-medium focus:outline-none focus:ring-2 focus:ring-beacon/60"
      >
        {workspaces.map((w) => <option key={w.id} value={w.id}>{w.name}</option>)}
        <option value="__new">+ Agregar otro negocio</option>
      </select>

      <ul className="flex flex-col gap-0.5">
        {nav.map((n) => (
          <li key={n.href}>
            <Link
              href={n.href}
              aria-current={active(n.href) ? 'page' : undefined}
              className={`flex items-center gap-3 rounded-lg px-2.5 py-2 text-[14.5px] transition-colors ${
                active(n.href) ? 'bg-ink text-surface font-medium' : 'text-mute hover:text-ink hover:bg-sunken'
              }`}
            >
              <Icon d={n.icon} />
              {n.label}
              {n.href === '/ajustes' && needsSetup && <span className="ml-auto w-2 h-2 rounded-full bg-beacon" title="Falta configurar costos" />}
            </Link>
          </li>
        ))}
      </ul>

      <div className="mt-auto pt-4 border-t border-line flex flex-col gap-1 text-[13px]">
        <button onClick={toggle} className="text-left px-2.5 py-1.5 rounded-lg text-mute hover:text-ink hover:bg-sunken">
          {theme === 'dark' ? 'Usar modo claro' : 'Usar modo oscuro'}
        </button>
        <button onClick={logout} className="text-left px-2.5 py-1.5 rounded-lg text-mute hover:text-ink hover:bg-sunken">
          Cerrar sesión
        </button>
        <p className="px-2.5 pt-1 text-faint truncate" title={userEmail}>{userEmail}</p>
      </div>
    </nav>
  )

  return (
    <div className="faro font-faro flex h-screen bg-bg text-ink overflow-hidden">
      {open && <div className="fixed inset-0 bg-ink/40 z-20 lg:hidden" onClick={() => setOpen(false)} aria-hidden />}
      <div className={`fixed lg:static inset-y-0 left-0 z-30 transition-transform duration-200 ${open ? 'translate-x-0' : '-translate-x-full lg:translate-x-0'}`}>
        {rail}
      </div>
      <div className="flex-1 flex flex-col min-w-0">
        <header className="flex items-center gap-3 h-14 px-4 lg:px-8 border-b border-line bg-surface/80 backdrop-blur shrink-0">
          <button onClick={() => setOpen(true)} className="lg:hidden -ml-1 p-1.5 rounded-lg text-mute hover:bg-sunken" aria-label="Abrir menú">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" className="w-5 h-5"><path d="M4 7h16M4 12h16M4 17h16" /></svg>
          </button>
          <span className="lg:hidden flex items-center gap-1.5 font-semibold"><FaroMark className="w-5 h-5" />{workspace.name}</span>
          <div className="ml-auto">
            <SyncStatus sources={sources} timezone={timezone} />
          </div>
        </header>
        <main className="flex-1 overflow-y-auto">
          <div className="max-w-[1240px] mx-auto px-4 lg:px-8 py-6 lg:py-8">{children}</div>
        </main>
      </div>
    </div>
  )
}
