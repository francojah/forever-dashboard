'use client'

import { useState, useEffect } from 'react'
import { usePathname } from 'next/navigation'
import Sidebar from '@/components/Sidebar'

const PAGE_TITLES: Record<string, string> = {
  '/':           'Dashboard',
  '/tiendanube': 'Tiendanube',
  '/historico':  'Historial',
  '/balance':    'Balance',
  '/campanias':  'Campañas',
  '/creativos':  'Creativos',
  '/competencia':'Competencia',
  '/resumen':    'Resumen IA',
  '/assistant':  'AI Assistant',
  '/settings':   'Configuración',
}

export default function AppShell({ children, userEmail }: { children: React.ReactNode; userEmail: string }) {
  const [open, setOpen] = useState(false)
  const pathname = usePathname()

  // Auto-close drawer on route change
  useEffect(() => { setOpen(false) }, [pathname])

  // Lock body scroll when drawer open on mobile
  useEffect(() => {
    if (open) document.body.style.overflow = 'hidden'
    else document.body.style.overflow = ''
    return () => { document.body.style.overflow = '' }
  }, [open])

  const pageTitle = PAGE_TITLES[pathname] ?? ''

  return (
    <div className="flex h-screen bg-gray-50 dark:bg-zinc-950 overflow-hidden">

      {/* Mobile backdrop — fade + blur */}
      {open && (
        <div
          className="fixed inset-0 bg-black/50 backdrop-blur-[2px] z-20 lg:hidden animate-[fadeIn_0.15s_ease]"
          onClick={() => setOpen(false)}
          aria-hidden="true"
        />
      )}

      {/* Sidebar — drawer on mobile, static on desktop */}
      <div className={`fixed lg:static inset-y-0 left-0 z-30 transition-transform duration-200 ease-in-out
        ${open ? 'translate-x-0 shadow-2xl' : '-translate-x-full lg:translate-x-0 lg:shadow-none'}`}
      >
        <Sidebar userEmail={userEmail} onClose={() => setOpen(false)} />
      </div>

      {/* Main content */}
      <div className="flex-1 flex flex-col min-w-0 overflow-hidden">

        {/* Mobile header */}
        <div className="lg:hidden flex items-center gap-3 px-4 h-12 border-b border-gray-100 dark:border-zinc-800/60 bg-white dark:bg-zinc-900 shrink-0">
          <button
            onClick={() => setOpen(true)}
            aria-label="Abrir menú"
            className="p-1.5 -ml-1 rounded-lg text-gray-500 dark:text-zinc-400 hover:bg-gray-100 dark:hover:bg-zinc-800 transition-colors"
          >
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" className="w-5 h-5">
              <line x1="3" y1="6" x2="21" y2="6"/>
              <line x1="3" y1="12" x2="21" y2="12"/>
              <line x1="3" y1="18" x2="21" y2="18"/>
            </svg>
          </button>

          {pageTitle ? (
            <span className="text-[14px] font-semibold text-gray-800 dark:text-zinc-200">{pageTitle}</span>
          ) : (
            <img
              src="https://acdn-us.mitiendanube.com/stores/004/250/257/themes/common/logo-1587041462-1768339200-c3f713972515246e9c2f02029356d7da1768339200-480-0.webp"
              alt="Forever Basics"
              className="h-6 object-contain dark:invert"
            />
          )}

          {/* Logo small on right */}
          <div className="ml-auto">
            <span className="text-micro font-semibold text-gray-300 dark:text-zinc-700 uppercase tracking-widest">Forever</span>
          </div>
        </div>

        <main className="flex-1 overflow-y-auto">
          {children}
        </main>
      </div>
    </div>
  )
}
