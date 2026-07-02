'use client'

import { useState, useEffect, useCallback, useRef } from 'react'
import { useRouter } from 'next/navigation'

interface Item {
  id: string
  label: string
  sub?: string
  icon: string
  href?: string
  action?: () => void
  group: string
}

const NAV_ITEMS: Item[] = [
  { id: 'dashboard',    label: 'Dashboard',          sub: 'Vista general',          icon: '⚡', href: '/',            group: 'Navegación' },
  { id: 'campanias',   label: 'Campañas',            sub: 'Ad sets y creativos',    icon: '📢', href: '/campanias',   group: 'Navegación' },
  { id: 'inteligencia',label: 'Inteligencia IA',     sub: 'Análisis y predicciones',icon: '🤖', href: '/inteligencia',group: 'Navegación' },
  { id: 'competencia', label: 'Competencia',         sub: 'Meta Ad Library',        icon: '🔍', href: '/competencia', group: 'Navegación' },
  { id: 'config',      label: 'Configuración',       sub: 'Tokens y conexiones',    icon: '⚙️', href: '/settings',    group: 'Navegación' },
]

const ACTION_ITEMS: Item[] = [
  { id: 'sync',    label: 'Actualizar datos',   sub: 'Sincronizar Meta + TN',   icon: '🔄', group: 'Acciones' },
  { id: 'period7', label: 'Ver últimos 7 días', sub: 'Cambiar período',          icon: '📅', group: 'Acciones' },
  { id: 'today',   label: 'Ver hoy',            sub: 'Período: hoy',             icon: '☀️', group: 'Acciones' },
  { id: 'dark',    label: 'Toggle dark mode',   sub: 'Cambiar tema',             icon: '🌙', group: 'Acciones' },
]

export default function CommandPalette() {
  const [open, setOpen]       = useState(false)
  const [query, setQuery]     = useState('')
  const [selected, setSelected] = useState(0)
  const router   = useRouter()
  const inputRef = useRef<HTMLInputElement>(null)

  const allItems = [...NAV_ITEMS, ...ACTION_ITEMS]

  const filtered = query
    ? allItems.filter(i =>
        i.label.toLowerCase().includes(query.toLowerCase()) ||
        (i.sub || '').toLowerCase().includes(query.toLowerCase())
      )
    : allItems

  const close = useCallback(() => { setOpen(false); setQuery(''); setSelected(0) }, [])

  const execute = useCallback((item: Item) => {
    close()
    if (item.href) { router.push(item.href); return }
    if (item.id === 'dark') {
      const root = document.documentElement
      root.classList.toggle('dark')
      localStorage.setItem('forever-theme', root.classList.contains('dark') ? 'dark' : 'light')
    }
    if (item.id === 'sync') {
      // Dispatch custom event for DashboardClient to listen
      window.dispatchEvent(new CustomEvent('forever:sync'))
    }
    if (item.id === 'period7' || item.id === 'today') {
      window.dispatchEvent(new CustomEvent('forever:period', { detail: item.id === 'period7' ? 'last_7d' : 'today' }))
    }
    if (item.action) item.action()
  }, [close, router])

  // Global keyboard listener
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key === 'k') {
        e.preventDefault()
        setOpen(o => !o)
      }
      if (e.key === 'Escape') close()
    }
    document.addEventListener('keydown', handler)
    return () => document.removeEventListener('keydown', handler)
  }, [close])

  // Focus input when opening
  useEffect(() => {
    if (open) { setSelected(0); setTimeout(() => inputRef.current?.focus(), 50) }
  }, [open])

  // Arrow key navigation
  useEffect(() => {
    if (!open) return
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'ArrowDown') { e.preventDefault(); setSelected(s => Math.min(s + 1, filtered.length - 1)) }
      if (e.key === 'ArrowUp')   { e.preventDefault(); setSelected(s => Math.max(s - 1, 0)) }
      if (e.key === 'Enter' && filtered[selected]) { execute(filtered[selected]) }
    }
    document.addEventListener('keydown', handler)
    return () => document.removeEventListener('keydown', handler)
  }, [open, selected, filtered, execute])

  if (!open) return (
    <button
      onClick={() => setOpen(true)}
      className="hidden md:flex items-center gap-2 px-3 py-1.5 text-xs text-zinc-500 dark:text-zinc-400 border border-zinc-200 dark:border-zinc-700 rounded-lg hover:border-zinc-300 dark:hover:border-zinc-600 transition-all bg-white dark:bg-zinc-900 shadow-sm"
      title="Abrir buscador (Cmd+K)"
    >
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="w-3.5 h-3.5"><circle cx="11" cy="11" r="8"/><path d="m21 21-4.35-4.35"/></svg>
      <span>Buscar...</span>
      <kbd className="text-micro bg-zinc-100 dark:bg-zinc-800 px-1.5 py-0.5 rounded font-mono">⌘K</kbd>
    </button>
  )

  // Group items by group label
  const groups = filtered.reduce<Record<string, Item[]>>((acc, item) => {
    if (!acc[item.group]) acc[item.group] = []
    acc[item.group].push(item)
    return acc
  }, {})

  let globalIdx = 0

  return (
    <div className="fixed inset-0 z-[100] flex items-start justify-center pt-[10vh] px-4">
      {/* Backdrop */}
      <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" onClick={close} />

      {/* Palette */}
      <div className="relative w-full max-w-lg bg-white dark:bg-zinc-900 rounded-2xl border border-gray-200 dark:border-zinc-700 shadow-2xl overflow-hidden">
        {/* Input */}
        <div className="flex items-center gap-3 px-4 py-3.5 border-b border-gray-100 dark:border-zinc-800">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="w-4 h-4 text-gray-400 dark:text-zinc-500 shrink-0"><circle cx="11" cy="11" r="8"/><path d="m21 21-4.35-4.35"/></svg>
          <input
            ref={inputRef}
            value={query}
            onChange={e => { setQuery(e.target.value); setSelected(0) }}
            placeholder="Buscar páginas y acciones..."
            className="flex-1 bg-transparent text-sm text-gray-900 dark:text-zinc-100 placeholder-gray-400 dark:placeholder-zinc-600 outline-none"
          />
          <kbd className="text-micro text-gray-400 dark:text-zinc-600 border border-gray-200 dark:border-zinc-700 rounded px-1.5 py-0.5 font-mono">ESC</kbd>
        </div>

        {/* Results */}
        <div className="max-h-80 overflow-y-auto py-2">
          {filtered.length === 0 && (
            <p className="text-xs text-gray-400 dark:text-zinc-600 px-4 py-6 text-center">Sin resultados para &quot;{query}&quot;</p>
          )}
          {Object.entries(groups).map(([group, items]) => (
            <div key={group}>
              <p className="text-micro font-bold text-gray-400 dark:text-zinc-600 uppercase tracking-widest px-4 py-1.5">{group}</p>
              {items.map(item => {
                const idx = globalIdx++
                const isSelected = idx === selected
                return (
                  <button
                    key={item.id}
                    onClick={() => execute(item)}
                    onMouseEnter={() => setSelected(idx)}
                    className={`w-full flex items-center gap-3 px-4 py-2.5 text-left transition-colors ${
                      isSelected ? 'bg-indigo-50 dark:bg-indigo-950/40' : 'hover:bg-gray-50 dark:hover:bg-zinc-800/60'
                    }`}
                  >
                    <span className="text-base shrink-0 w-6 text-center">{item.icon}</span>
                    <div className="flex-1 min-w-0">
                      <p className={`text-sm font-medium truncate ${isSelected ? 'text-indigo-700 dark:text-indigo-300' : 'text-gray-700 dark:text-zinc-200'}`}>
                        {item.label}
                      </p>
                      {item.sub && <p className="text-xs text-gray-400 dark:text-zinc-600 truncate">{item.sub}</p>}
                    </div>
                    {isSelected && (
                      <kbd className="text-micro text-gray-400 dark:text-zinc-600 border border-gray-200 dark:border-zinc-700 rounded px-1.5 py-0.5 font-mono shrink-0">↵</kbd>
                    )}
                  </button>
                )
              })}
            </div>
          ))}
        </div>

        {/* Footer */}
        <div className="border-t border-gray-100 dark:border-zinc-800 px-4 py-2 flex items-center gap-4 text-micro text-gray-400 dark:text-zinc-600">
          <span><kbd className="font-mono">↑↓</kbd> navegar</span>
          <span><kbd className="font-mono">↵</kbd> abrir</span>
          <span><kbd className="font-mono">ESC</kbd> cerrar</span>
        </div>
      </div>
    </div>
  )
}
