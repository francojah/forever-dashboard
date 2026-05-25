'use client'

import { useState } from 'react'
import type { Lead } from '@/lib/supabase'
import { createClientBrowser } from '@/lib/supabase'

const STATUS_OPTIONS = [
  { value: 'new',          label: 'Nuevo',        color: 'bg-blue-100 text-blue-700' },
  { value: 'contacted',    label: 'Contactado',   color: 'bg-yellow-100 text-yellow-700' },
  { value: 'qualified',    label: 'Calificado',   color: 'bg-purple-100 text-purple-700' },
  { value: 'negotiating',  label: 'Negociando',   color: 'bg-orange-100 text-orange-700' },
  { value: 'closed_won',   label: 'Cerrado ✓',    color: 'bg-green-100 text-green-700' },
  { value: 'closed_lost',  label: 'Perdido',      color: 'bg-gray-100 text-gray-500' },
]

export default function LeadsClient({ leads: initialLeads }: { leads: Lead[] }) {
  const [leads, setLeads] = useState(initialLeads)
  const [filter, setFilter] = useState('all')
  const [search, setSearch] = useState('')
  const supabase = createClientBrowser()

  async function updateStatus(id: string, status: string) {
    await supabase.from('leads').update({ status }).eq('id', id)
    setLeads(prev => prev.map(l => l.id === id ? { ...l, status: status as Lead['status'] } : l))
  }

  const filtered = leads.filter(l => {
    const matchFilter = filter === 'all' || l.status === filter
    const matchSearch = !search ||
      l.full_name?.toLowerCase().includes(search.toLowerCase()) ||
      l.email?.toLowerCase().includes(search.toLowerCase()) ||
      l.campaign_name?.toLowerCase().includes(search.toLowerCase())
    return matchFilter && matchSearch
  })

  const counts: Record<string, number> = {}
  leads.forEach(l => { counts[l.status] = (counts[l.status] || 0) + 1 })

  function statusBadge(status: string) {
    const opt = STATUS_OPTIONS.find(o => o.value === status)
    return <span className={`inline-block px-2 py-0.5 rounded-full text-xs font-medium ${opt?.color || 'bg-gray-100 text-gray-600'}`}>{opt?.label || status}</span>
  }

  return (
    <div>
      {/* Stats */}
      <div className="grid grid-cols-3 md:grid-cols-6 gap-3 mb-5">
        {STATUS_OPTIONS.map(opt => (
          <button
            key={opt.value}
            onClick={() => setFilter(filter === opt.value ? 'all' : opt.value)}
            className={`rounded-xl border p-3 text-center transition-colors ${
              filter === opt.value ? 'border-gray-900 bg-gray-50' : 'border-gray-200 bg-white hover:bg-gray-50'
            }`}
          >
            <p className="text-lg font-semibold text-gray-900">{counts[opt.value] || 0}</p>
            <p className="text-xs text-gray-500 mt-0.5">{opt.label}</p>
          </button>
        ))}
      </div>

      {/* Search */}
      <div className="flex items-center gap-3 mb-4">
        <input
          value={search}
          onChange={e => setSearch(e.target.value)}
          placeholder="Buscar por nombre, email o campaña..."
          className="flex-1 px-3.5 py-2 rounded-lg border border-gray-200 text-sm bg-white
                     focus:outline-none focus:ring-2 focus:ring-black placeholder-gray-400"
        />
        <span className="text-sm text-gray-500">{filtered.length} leads</span>
      </div>

      {/* Table */}
      {filtered.length === 0 ? (
        <div className="text-center py-16 text-gray-400">
          <p className="text-4xl mb-3">👥</p>
          <p className="text-sm">No hay leads todavía. Se sincronizan automáticamente desde Meta Lead Ads.</p>
        </div>
      ) : (
        <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="bg-gray-50 border-b border-gray-100">
                  <th className="text-left px-4 py-2.5 text-xs font-semibold text-gray-500 uppercase tracking-wide">Nombre</th>
                  <th className="text-left px-4 py-2.5 text-xs font-semibold text-gray-500 uppercase tracking-wide">Contacto</th>
                  <th className="text-left px-4 py-2.5 text-xs font-semibold text-gray-500 uppercase tracking-wide">Campaña</th>
                  <th className="text-left px-4 py-2.5 text-xs font-semibold text-gray-500 uppercase tracking-wide">Fecha</th>
                  <th className="text-left px-4 py-2.5 text-xs font-semibold text-gray-500 uppercase tracking-wide">Estado</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-50">
                {filtered.map(lead => (
                  <tr key={lead.id} className="hover:bg-gray-50 transition-colors">
                    <td className="px-4 py-3 font-medium text-gray-900">{lead.full_name || '—'}</td>
                    <td className="px-4 py-3">
                      {lead.email && <p className="text-gray-700">{lead.email}</p>}
                      {lead.phone && <p className="text-gray-500 text-xs">{lead.phone}</p>}
                    </td>
                    <td className="px-4 py-3 text-gray-500 text-xs">
                      <p>{lead.campaign_name || '—'}</p>
                      {lead.form_name && <p className="text-gray-400">{lead.form_name}</p>}
                    </td>
                    <td className="px-4 py-3 text-gray-500 text-xs">
                      {new Date(lead.created_at).toLocaleDateString('es-AR')}
                    </td>
                    <td className="px-4 py-3">
                      <select
                        value={lead.status}
                        onChange={e => updateStatus(lead.id, e.target.value)}
                        className="text-xs border border-gray-200 rounded-lg px-2 py-1 bg-white focus:outline-none"
                      >
                        {STATUS_OPTIONS.map(opt => (
                          <option key={opt.value} value={opt.value}>{opt.label}</option>
                        ))}
                      </select>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  )
}
