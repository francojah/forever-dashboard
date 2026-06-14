'use client'

import Link from 'next/link'
import Image from 'next/image'
import { usePathname, useRouter } from 'next/navigation'
import { createClientBrowser } from '@/lib/supabase'
import { useTheme } from '@/lib/theme-context'

const icons = {
  dashboard:   <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" className="w-4 h-4"><rect x="3" y="3" width="7" height="7" rx="1"/><rect x="14" y="3" width="7" height="7" rx="1"/><rect x="14" y="14" width="7" height="7" rx="1"/><rect x="3" y="14" width="7" height="7" rx="1"/></svg>,
  campanias:   <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" className="w-4 h-4"><path d="M22 12h-4l-3 9L9 3l-3 9H2"/></svg>,
  tiendanube:  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" className="w-4 h-4"><path d="M6 2L3 6v14a2 2 0 002 2h14a2 2 0 002-2V6l-3-4z"/><line x1="3" y1="6" x2="21" y2="6"/><path d="M16 10a4 4 0 01-8 0"/></svg>,
  historico:   <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" className="w-4 h-4"><polyline points="22 12 18 12 15 21 9 3 6 12 2 12"/></svg>,
  balance:     <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" className="w-4 h-4"><rect x="2" y="3" width="20" height="14" rx="2"/><path d="M8 21h8M12 17v4"/><path d="M7 10h2l2 4 2-7 2 3h2"/></svg>,
  assistant:   <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" className="w-4 h-4"><path d="M12 2a7 7 0 0 1 5 11.9V17a1 1 0 0 1-1 1H8a1 1 0 0 1-1-1v-3.1A7 7 0 0 1 12 2z"/><path d="M9 21h6"/></svg>,
  settings:    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" className="w-4 h-4"><circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1 0 2.83 2 2 0 0 1-2.83 0l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-2 2 2 2 0 0 1-2-2v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83 0 2 2 0 0 1 0-2.83l.06-.06A1.65 1.65 0 0 0 4.68 15a1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1-2-2 2 2 0 0 1 2-2h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 0-2.83 2 2 0 0 1 2.83 0l.06.06A1.65 1.65 0 0 0 9 4.68a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 2-2 2 2 0 0 1 2 2v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 0 2 2 0 0 1 0 2.83l-.06.06A1.65 1.65 0 0 0 19.4 9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 2 2 2 2 0 0 1-2 2h-.09a1.65 1.65 0 0 0-1.51 1z"/></svg>,
  creativos:   <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" className="w-4 h-4"><rect x="3" y="3" width="18" height="18" rx="2"/><circle cx="8.5" cy="8.5" r="1.5"/><polyline points="21 15 16 10 5 21"/></svg>,
  competencia: <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" className="w-4 h-4"><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/><circle cx="12" cy="12" r="3"/></svg>,
  resumen:     <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" className="w-4 h-4"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/><line x1="16" y1="13" x2="8" y2="13"/><line x1="16" y1="17" x2="8" y2="17"/></svg>,
  sun:         <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" className="w-4 h-4"><circle cx="12" cy="12" r="5"/><line x1="12" y1="1" x2="12" y2="3"/><line x1="12" y1="21" x2="12" y2="23"/><line x1="4.22" y1="4.22" x2="5.64" y2="5.64"/><line x1="18.36" y1="18.36" x2="19.78" y2="19.78"/><line x1="1" y1="12" x2="3" y2="12"/><line x1="21" y1="12" x2="23" y2="12"/><line x1="4.22" y1="19.78" x2="5.64" y2="18.36"/><line x1="18.36" y1="5.64" x2="19.78" y2="4.22"/></svg>,
  moon:        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" className="w-4 h-4"><path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z"/></svg>,
  logout:      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" className="w-4 h-4"><path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4"/><polyline points="16 17 21 12 16 7"/><line x1="21" y1="12" x2="9" y2="12"/></svg>,
  external:    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="w-3 h-3 opacity-40"><path strokeLinecap="round" strokeLinejoin="round" d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14"/></svg>,
}

// Grouped nav sections
const NAV_SECTIONS = [
  {
    label: 'Visión general',
    items: [
      { href: '/',           label: 'Dashboard',  icon: 'dashboard',  accent: 'text-zinc-400 dark:text-zinc-500' },
      { href: '/tiendanube', label: 'Tiendanube', icon: 'tiendanube', accent: 'text-violet-500 dark:text-violet-400' },
      { href: '/historico',  label: 'Historial',  icon: 'historico',  accent: 'text-zinc-400 dark:text-zinc-500' },
      { href: '/balance',    label: 'Balance',    icon: 'balance',    accent: 'text-emerald-500 dark:text-emerald-400' },
    ],
  },
  {
    label: 'Meta Ads',
    items: [
      { href: '/campanias', label: 'Campañas',  icon: 'campanias', accent: 'text-blue-500 dark:text-blue-400' },
      { href: '/creativos', label: 'Creativos', icon: 'creativos', accent: 'text-blue-500 dark:text-blue-400' },
    ],
  },
  {
    label: 'Inteligencia',
    items: [
      { href: '/competencia', label: 'Competencia', icon: 'competencia', accent: 'text-amber-500 dark:text-amber-400' },
      { href: '/resumen',     label: 'Resumen IA',  icon: 'resumen',     accent: 'text-emerald-500 dark:text-emerald-400' },
      { href: '/assistant',   label: 'AI Assistant',icon: 'assistant',   accent: 'text-emerald-500 dark:text-emerald-400' },
    ],
  },
  {
    label: 'Sistema',
    items: [
      { href: '/settings', label: 'Configuración', icon: 'settings', accent: 'text-zinc-400 dark:text-zinc-500' },
    ],
  },
]

const QUICK_LINKS = [
  {
    group: 'Meta',
    color: 'text-blue-500 dark:text-blue-400',
    links: [
      { href: 'https://adsmanager.facebook.com/adsmanager/manage/campaigns?act=1614288152915913', label: 'Ads Manager' },
      { href: 'https://business.facebook.com/', label: 'Business Suite' },
    ],
    icon: (
      <svg viewBox="0 0 24 24" fill="currentColor" className="w-3.5 h-3.5">
        <path d="M12 2.04C6.5 2.04 2 6.53 2 12.06C2 17.06 5.66 21.21 10.44 21.96V14.96H7.9V12.06H10.44V9.85C10.44 7.34 11.93 5.96 14.22 5.96C15.31 5.96 16.45 6.15 16.45 6.15V8.62H15.19C13.95 8.62 13.56 9.39 13.56 10.18V12.06H16.34L15.89 14.96H13.56V21.96C18.34 21.21 22 17.06 22 12.06C22 6.53 17.5 2.04 12 2.04Z"/>
      </svg>
    ),
  },
  {
    group: 'Tienda',
    color: 'text-violet-500 dark:text-violet-400',
    links: [
      { href: 'https://foreverbasics.mitiendanube.com/admin/', label: 'TN Admin' },
      { href: 'https://foreverbasics.com.ar/', label: 'Web Forever' },
    ],
    icon: (
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" className="w-3.5 h-3.5">
        <path d="M6 2L3 6v14a2 2 0 002 2h14a2 2 0 002-2V6l-3-4z"/><line x1="3" y1="6" x2="21" y2="6"/><path d="M16 10a4 4 0 01-8 0"/>
      </svg>
    ),
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
    <aside className="w-56 h-full bg-white dark:bg-zinc-950 border-r border-gray-100 dark:border-zinc-800/60 flex flex-col">

      {/* Logo */}
      <div className="px-4 pt-5 pb-4 border-b border-gray-100 dark:border-zinc-800/60">
        <div className="flex items-center justify-between">
          <div className="flex flex-col gap-1">
            <Image
              src="https://acdn-us.mitiendanube.com/stores/004/250/257/themes/common/logo-1587041462-1768339200-c3f713972515246e9c2f02029356d7da1768339200-480-0.webp"
              alt="Forever Basics" width={100} height={33}
              className="object-contain dark:invert" unoptimized
            />
            <p className="text-[9px] tracking-widest text-gray-400 dark:text-zinc-600 uppercase font-medium pl-0.5">Intelligence</p>
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

      {/* Nav — grouped sections */}
      <nav className="flex-1 px-3 py-3 overflow-y-auto space-y-4">
        {NAV_SECTIONS.map(section => (
          <div key={section.label}>
            <p className="text-[10px] font-semibold text-gray-400 dark:text-zinc-600 uppercase tracking-widest px-2 mb-1.5">
              {section.label}
            </p>
            <div className="space-y-0.5">
              {section.items.map(item => {
                const isActive = item.href === '/' ? pathname === '/' : pathname.startsWith(item.href)
                return (
                  <Link key={item.href} href={item.href} onClick={onClose}
                    className={`flex items-center gap-2.5 px-2.5 py-2 rounded-lg text-[13px] transition-all duration-150 ${
                      isActive
                        ? 'bg-zinc-100 dark:bg-zinc-800 text-gray-900 dark:text-white font-medium'
                        : 'text-gray-500 dark:text-zinc-400 hover:bg-gray-50 dark:hover:bg-zinc-800/50 hover:text-gray-900 dark:hover:text-zinc-100'
                    }`}
                  >
                    <span className={isActive ? item.accent : 'text-gray-400 dark:text-zinc-600'}>
                      {icons[item.icon as keyof typeof icons]}
                    </span>
                    {item.label}
                    {isActive && (
                      <span className="ml-auto w-1 h-1 rounded-full bg-current opacity-60" />
                    )}
                  </Link>
                )
              })}
            </div>
          </div>
        ))}
      </nav>

      {/* Quick links */}
      <div className="px-3 pb-2 space-y-2 border-t border-gray-100 dark:border-zinc-800/60 pt-3">
        <p className="text-[10px] font-semibold text-gray-400 dark:text-zinc-600 uppercase tracking-widest px-2 mb-1.5">
          Accesos rápidos
        </p>
        {QUICK_LINKS.map(group => (
          <div key={group.group} className="space-y-0.5">
            {group.links.map(link => (
              <a key={link.href} href={link.href} target="_blank" rel="noopener noreferrer"
                className="flex items-center justify-between gap-2 px-2.5 py-1.5 rounded-lg text-[12px] text-gray-500 dark:text-zinc-500 hover:bg-gray-50 dark:hover:bg-zinc-800/50 hover:text-gray-900 dark:hover:text-zinc-100 transition-all"
              >
                <span className="flex items-center gap-2">
                  <span className={group.color}>{group.icon}</span>
                  {link.label}
                </span>
                {icons.external}
              </a>
            ))}
          </div>
        ))}
      </div>

      {/* Footer */}
      <div className="px-3 py-3 border-t border-gray-100 dark:border-zinc-800/60 space-y-0.5">
        <button onClick={toggle}
          className="w-full flex items-center gap-2.5 px-2.5 py-2 rounded-lg text-[13px] text-gray-500 dark:text-zinc-400 hover:bg-gray-50 dark:hover:bg-zinc-800/50 hover:text-gray-900 dark:hover:text-zinc-100 transition-all">
          <span className="text-gray-400 dark:text-zinc-600">{theme === 'dark' ? icons.sun : icons.moon}</span>
          {theme === 'dark' ? 'Modo claro' : 'Modo oscuro'}
        </button>
        <div className="px-2.5 py-1">
          <p className="text-[11px] text-gray-400 dark:text-zinc-600 truncate">{userEmail}</p>
        </div>
        <button onClick={handleLogout}
          className="w-full flex items-center gap-2.5 px-2.5 py-2 rounded-lg text-[13px] text-gray-500 dark:text-zinc-400 hover:bg-gray-50 dark:hover:bg-zinc-800/50 hover:text-gray-900 dark:hover:text-zinc-100 transition-all">
          <span className="text-gray-400 dark:text-zinc-600">{icons.logout}</span>
          Cerrar sesión
        </button>
      </div>
    </aside>
  )
}
