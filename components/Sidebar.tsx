'use client'

import Link from 'next/link'
import Image from 'next/image'
import { usePathname, useRouter } from 'next/navigation'
import { createClientBrowser } from '@/lib/supabase'
import { useTheme } from '@/lib/theme-context'

const icons = {
  dashboard:   <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" className="w-4 h-4"><rect x="3" y="3" width="7" height="7" rx="1"/><rect x="14" y="3" width="7" height="7" rx="1"/><rect x="14" y="14" width="7" height="7" rx="1"/><rect x="3" y="14" width="7" height="7" rx="1"/></svg>,
  creativos:   <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" className="w-4 h-4"><rect x="3" y="3" width="18" height="18" rx="2"/><circle cx="8.5" cy="8.5" r="1.5"/><polyline points="21 15 16 10 5 21"/></svg>,
  chat:        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" className="w-4 h-4"><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/></svg>,
  meta:        <svg viewBox="0 0 24 24" fill="currentColor" className="w-4 h-4"><path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm0 18c-4.41 0-8-3.59-8-8s3.59-8 8-8 8 3.59 8 8-3.59 8-8 8zm-1-11h2v6h-2zm0-4h2v2h-2z"/></svg>,
  historico:   <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" className="w-4 h-4"><polyline points="22 12 18 12 15 21 9 3 6 12 2 12"/></svg>,
  tiendanube:  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" className="w-4 h-4"><path d="M6 2L3 6v14a2 2 0 002 2h14a2 2 0 002-2V6l-3-4z"/><line x1="3" y1="6" x2="21" y2="6"/><path d="M16 10a4 4 0 01-8 0"/></svg>,
  ideas:       <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" className="w-4 h-4"><path d="M12 2a7 7 0 0 1 5 11.9V17a1 1 0 0 1-1 1H8a1 1 0 0 1-1-1v-3.1A7 7 0 0 1 12 2z"/><path d="M9 21h6"/></svg>,
  competencia: <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" className="w-4 h-4"><circle cx="11" cy="11" r="8"/><path d="m21 21-4.35-4.35"/></svg>,
  presupuesto: <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" className="w-4 h-4"><line x1="12" y1="1" x2="12" y2="23"/><path d="M17 5H9.5a3.5 3.5 0 0 0 0 7h5a3.5 3.5 0 0 1 0 7H6"/></svg>,
  resumen:     <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" className="w-4 h-4"><path d="M12 2L2 7l10 5 10-5-10-5z"/><path d="M2 17l10 5 10-5"/><path d="M2 12l10 5 10-5"/></svg>,
  alertas:     <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" className="w-4 h-4"><path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9"/><path d="M13.73 21a2 2 0 0 1-3.46 0"/></svg>,
  balance:     <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" className="w-4 h-4"><rect x="2" y="3" width="20" height="14" rx="2"/><path d="M8 21h8M12 17v4"/><path d="M7 10h2l2 4 2-7 2 3h2"/></svg>,
  settings:    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" className="w-4 h-4"><circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1 0 2.83 2 2 0 0 1-2.83 0l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-2 2 2 2 0 0 1-2-2v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83 0 2 2 0 0 1 0-2.83l.06-.06A1.65 1.65 0 0 0 4.68 15a1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1-2-2 2 2 0 0 1 2-2h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 0-2.83 2 2 0 0 1 2.83 0l.06.06A1.65 1.65 0 0 0 9 4.68a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 2-2 2 2 0 0 1 2 2v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 0 2 2 0 0 1 0 2.83l-.06.06A1.65 1.65 0 0 0 19.4 9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 2 2 2 2 0 0 1-2 2h-.09a1.65 1.65 0 0 0-1.51 1z"/></svg>,
  calendar:    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" className="w-4 h-4"><rect x="3" y="4" width="18" height="18" rx="2"/><line x1="16" y1="2" x2="16" y2="6"/><line x1="8" y1="2" x2="8" y2="6"/><line x1="3" y1="10" x2="21" y2="10"/></svg>,
  sun:         <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" className="w-4 h-4"><circle cx="12" cy="12" r="5"/><line x1="12" y1="1" x2="12" y2="3"/><line x1="12" y1="21" x2="12" y2="23"/><line x1="4.22" y1="4.22" x2="5.64" y2="5.64"/><line x1="18.36" y1="18.36" x2="19.78" y2="19.78"/><line x1="1" y1="12" x2="3" y2="12"/><line x1="21" y1="12" x2="23" y2="12"/><line x1="4.22" y1="19.78" x2="5.64" y2="18.36"/><line x1="18.36" y1="5.64" x2="19.78" y2="4.22"/></svg>,
  moon:        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" className="w-4 h-4"><path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z"/></svg>,
  logout:      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" className="w-4 h-4"><path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4"/><polyline points="16 17 21 12 16 7"/><line x1="21" y1="12" x2="9" y2="12"/></svg>,
}

const NAV = [
  { href: '/',             label: 'Dashboard',    icon: 'dashboard'   },
{ href: '/historico',    label: 'Historial',    icon: 'historico'   },
  { href: '/tiendanube',   label: 'Tiendanube',   icon: 'tiendanube'  },
  { href: '/balance',      label: 'Balance',      icon: 'balance'     },
  { href: '/chat',         label: 'Chat IA',      icon: 'chat'        },
  { href: '/ideas',        label: 'Ideas IA',     icon: 'ideas'       },
  { href: '/competencia',  label: 'Competencia',  icon: 'competencia' },
  { href: '/presupuesto',  label: 'Presupuesto',  icon: 'presupuesto' },
  { href: '/resumen',      label: 'Resumen IA',   icon: 'resumen'     },
  { href: '/alertas',      label: 'Alertas',      icon: 'alertas'     },
  { href: '/eventos',      label: 'Eventos',      icon: 'calendar'   },
  { href: '/settings',     label: 'Configuración', icon: 'settings'  },
]

const META_LINKS = [
  {
    href:  'https://adsmanager.facebook.com/adsmanager/manage/campaigns?act=1614288152915913',
    label: 'Ads Manager',
    icon:  'meta',
  },
  {
    href:  'https://business.facebook.com/',
    label: 'Business Suite',
    icon:  'meta',
  },
]

export default function Sidebar({ userEmail, onClose }: { userEmail: string; onClose?: () => void }) {
  const pathname = usePathname()
  const router   = useRouter()
  const { theme, toggle } = useTheme()
  const supabase = createClientBrowser()

  async function handleLogout() {
    await supabase.auth.signOut()
    router.push('/login')
    router.refresh()
  }

  return (
    <aside className="w-52 h-full bg-white dark:bg-zinc-900 border-r border-gray-100 dark:border-zinc-800 flex flex-col">

      {/* Logo */}
      <div className="px-5 pt-6 pb-5 border-b border-gray-100 dark:border-zinc-800">
        <div className="flex items-center justify-between">
          <div className="flex flex-col gap-1.5">
            <Image
                                          src="https://acdn-us.mitiendanube.com/stores/004/250/257/themes/common/logo-1587041462-1768339200-c3f713972515246e9c2f02029356d7da1768339200-480-0.webp"
              alt="Forever Basics" width={110} height={36}
              className="object-contain dark:invert" unoptimized
            />
            <p className="text-[10px] tracking-widest text-gray-400 dark:text-zinc-600 uppercase font-medium">Ads Panel</p>
          </div>
          {onClose && (
            <button onClick={onClose} className="lg:hidden p-1.5 rounded-lg text-gray-400 hover:bg-gray-100 dark:hover:bg-zinc-800">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="w-4 h-4">
                <line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/>
              </svg>
            </button>
          )}
        </div>
      </div>

      {/* Nav */}
      <nav className="flex-1 px-3 py-4 space-y-0.5 overflow-y-auto">
        {NAV.map(item => {
          const isActive = item.href === '/' ? pathname === '/' : pathname.startsWith(item.href)
          return (
            <Link key={item.href} href={item.href} onClick={onClose}
              className={`flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm transition-all duration-150 ${
                isActive
                  ? 'bg-gray-100 dark:bg-zinc-800 text-gray-900 dark:text-white font-medium'
                  : 'text-gray-500 dark:text-zinc-400 hover:bg-gray-50 dark:hover:bg-zinc-800/60 hover:text-gray-900 dark:hover:text-zinc-100'
              }`}
            >
              <span className={isActive ? 'text-gray-700 dark:text-white' : 'text-gray-400 dark:text-zinc-600'}>
                {icons[item.icon as keyof typeof icons]}
              </span>
              {item.label}
            </Link>
          )
        })}
      </nav>

      {/* Meta quick links */}
      <div className="px-3 pb-3">
        <p className="text-[10px] font-medium text-gray-400 dark:text-zinc-600 uppercase tracking-wider px-3 mb-1.5">Meta</p>
        {META_LINKS.map(link => (
          <a
            key={link.href}
            href={link.href}
            target="_blank"
            rel="noopener noreferrer"
            className="flex items-center justify-between gap-3 px-3 py-2 rounded-lg text-sm text-gray-500 dark:text-zinc-400 hover:bg-gray-50 dark:hover:bg-zinc-800/60 hover:text-gray-900 dark:hover:text-zinc-100 transition-all"
          >
            <span className="flex items-center gap-3">
              <span className="text-blue-500 dark:text-blue-400">
                <svg viewBox="0 0 24 24" fill="currentColor" className="w-4 h-4">
                  <path d="M12 2.04C6.5 2.04 2 6.53 2 12.06C2 17.06 5.66 21.21 10.44 21.96V14.96H7.9V12.06H10.44V9.85C10.44 7.34 11.93 5.96 14.22 5.96C15.31 5.96 16.45 6.15 16.45 6.15V8.62H15.19C13.95 8.62 13.56 9.39 13.56 10.18V12.06H16.34L15.89 14.96H13.56V21.96C18.34 21.21 22 17.06 22 12.06C22 6.53 17.5 2.04 12 2.04Z"/>
                </svg>
              </span>
              {link.label}
            </span>
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="w-3 h-3 opacity-40">
              <path strokeLinecap="round" strokeLinejoin="round" d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14"/>
            </svg>
          </a>
        ))}
      </div>

      {/* Footer */}
      <div className="px-3 py-4 border-t border-gray-100 dark:border-zinc-800 space-y-1">
        <button onClick={toggle}
          className="w-full flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm text-gray-500 dark:text-zinc-400 hover:bg-gray-50 dark:hover:bg-zinc-800/60 hover:text-gray-900 dark:hover:text-zinc-100 transition-all">
          <span className="text-gray-400 dark:text-zinc-600">{theme === 'dark' ? icons.sun : icons.moon}</span>
          {theme === 'dark' ? 'Modo claro' : 'Modo oscuro'}
        </button>
        <div className="px-3 py-1"><p className="text-[11px] text-gray-400 dark:text-zinc-600 truncate">{userEmail}</p></div>
        <button onClick={handleLogout}
          className="w-full flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm text-gray-500 dark:text-zinc-400 hover:bg-gray-50 dark:hover:bg-zinc-800/60 hover:text-gray-900 dark:hover:text-zinc-100 transition-all">
          <span className="text-gray-400 dark:text-zinc-600">{icons.logout}</span>
          Cerrar sesion
        </button>
      </div>
    </aside>
  )
}
