'use client'

import { useState } from 'react'
import { createClientBrowser } from '@/lib/supabase'

interface Alert {
  id: string
  type: string
  entity_name: string
  message: string
  severity: 'info' | 'warning' | 'danger'
  is_read: boolean
  created_at: string
  actual_value: number | null
  threshold: number | null
}

const SEVERITY_STYLE = {
  danger:  { bg: 'bg-red-50 dark:bg-red-900/15',    border: 'border-red-200 dark:border-red-800/50',    dot: 'bg-red-500'    },
  warning: { bg: 'bg-amber-50 dark:bg-amber-900/15', border: 'border-amber-200 dark:border-amber-800/50', dot: 'bg-amber-500'  },
  info:    { bg: 'bg-blue-50 dark:bg-blue-900/15',   border: 'border-blue-200 dark:border-blue-800/50',   dot: 'bg-blue-500'   },
}

export default function AlertasClient({ alerts: initial }: { alerts: Alert[] }) {
  const [alerts, setAlerts] = useState(initial)
  const [filter, setFilter] = useState<'all' | 'unread'>('unread')
  const supabase = createClientBrowser()

  async function markRead(id: string) {
    await supabase.from('alerts').update({ is_read: true }).eq('id', id)
    setAlerts(prev => prev.map(a => a.id === id ? { ...a, is_read: true } : a))
  }

  async function markAllRead() {
    await supabase.from('alerts').update({ is_read: true }).eq('is_read', false)
    setAlerts(prev => prev.map(a => ({ ...a, is_read: true })))
  }

  const filtered = alerts.filter(a => filter === 'all' || !a.is_read)
  const unread = alerts.filter(a => !a.is_read).length

  return (
    <div>
      <div className="flex items-center justify-between mb-4">
        <div className="flex gap-2">
          {(['all', 'unread'] as const).map(f => (
            <button key={f} onClick={() => setFilter(f)}
              className={`px-3 py-1.5 rounded-lg text-sm font-medium transition-colors ${
                filter === f ? 'bg-black text-white' : 'bg-white border border-gray-200 text-gray-600 hover:bg-gray-50'
              }`}>
              {f === 'all' ? `Todas (${alerts.length})` : `Sin leer (${unread})`}
            </button>
          ))}
        </div>
        {unread > 0 && (
          <button onClick={markAllRead} className="text-sm text-gray-500 hover:text-gray-700 underline">
            Marcar todas como leídas
          </button>
        )}
      </div>

      {filtered.length === 0 ? (
        <div className="text-center py-16 text-gray-400">
          <span className="inline-block w-8 h-8 rounded-full bg-emerald-100 dark:bg-emerald-900/30 mb-3" />
          <p className="text-sm">No hay alertas {filter === 'unread' ? 'sin leer' : ''}</p>
        </div>
      ) : (
        <div className="space-y-2">
          {filtered.map(alert => {
            const style = SEVERITY_STYLE[alert.severity]
            return (
              <div key={alert.id}
                className={`flex items-start gap-3 p-4 rounded-xl border ${style.bg} ${style.border} ${
                  alert.is_read ? 'opacity-60' : ''
                }`}>
                <span className={`w-2.5 h-2.5 rounded-full ${style.dot} flex-shrink-0 mt-1`} />
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-semibold text-gray-900 dark:text-zinc-100">{alert.entity_name}</p>
                  <p className="text-sm text-gray-700 dark:text-zinc-300 mt-0.5">{alert.message}</p>
                  <p className="text-xs text-gray-400 mt-1">
                    {new Date(alert.created_at).toLocaleDateString('es-AR', {
                      day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit'
                    })}
                  </p>
                </div>
                {!alert.is_read && (
                  <button onClick={() => markRead(alert.id)}
                    className="flex-shrink-0 text-xs text-gray-500 hover:text-gray-700 underline">
                    Leída
                  </button>
                )}
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}
