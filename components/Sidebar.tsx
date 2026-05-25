'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { createClientBrowser } from '@/lib/supabase'
import { useRouter } from 'next/navigation'

const NAV = [
  { href: '/',              label: 'Dashboard',    icon: '📊' },
  { href: '/creativos',     label: 'Creativos',    icon: '🎨' },
  { href: '/ideas',         label: 'Ideas IA',     icon: '✨' },
  { href: '/competencia',   label: 'Competencia',  icon: '🔍' },
  { href: '/leads',         label: 'Leads',        icon: '👥' },
  { href: '/alertas',       label: 'Alertas',      icon: '🔔' },
]

export default function Sidebar({ userEmail }: { userEmail: string }) {
  const pathname = usePathname()
  const router = useRouter()
  const supabase = createClientBrowser()

  async function handleLogout() {
    await supabase.auth.signOut()
    router.push('/login')
    router.refresh()
  }

  return (
    <aside className="w-56 bg-white border-r border-gray-200 flex flex-col flex-shrink-0">
      {/* Logo */}
      <div className="px-5 py-5 border-b border-gray-100">
        <div className="flex items-center gap-2.5">
          <div className="w-8 h-8 bg-black rounded-lg flex items-center justify-center">
            <span className="text-white text-sm font-bold">F</span>
          </div>
          <div>
            <p className="text-sm font-semibold text-gray-900 leading-none">Forever Ads</p>
            <p className="text-xs text-gray-400 mt-0.5">Meta Ads Panel</p>
          </div>
        </div>
      </div>

      {/* Nav */}
      <nav className="flex-1 px-3 py-4 space-y-0.5">
        {NAV.map(item => {
          const isActive = item.href === '/'
            ? pathname === '/'
            : pathname.startsWith(item.href)
          return (
            <Link
              key={item.href}
              href={item.href}
              className={`flex items-center gap-2.5 px-3 py-2 rounded-lg text-sm transition-colors ${
                isActive
                  ? 'bg-gray-100 text-gray-900 font-medium'
                  : 'text-gray-600 hover:bg-gray-50 hover:text-gray-900'
              }`}
            >
              <span className="text-base">{item.icon}</span>
              {item.label}
            </Link>
          )
        })}
      </nav>

      {/* User / Logout */}
      <div className="px-3 py-4 border-t border-gray-100">
        <div className="px-3 py-2 mb-1">
          <p className="text-xs text-gray-500 truncate">{userEmail}</p>
        </div>
        <button
          onClick={handleLogout}
          className="w-full flex items-center gap-2.5 px-3 py-2 rounded-lg text-sm
                     text-gray-600 hover:bg-gray-50 hover:text-gray-900 transition-colors"
        >
          <span>🚪</span> Cerrar sesión
        </button>
      </div>
    </aside>
  )
}
