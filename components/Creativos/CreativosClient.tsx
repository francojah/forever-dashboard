'use client'

import { useState } from 'react'
import type { Creative } from '@/lib/supabase'
import { createClientBrowser } from '@/lib/supabase'

const STATUS_OPTIONS = [
  { value: 'active',   label: 'Activo',    color: 'bg-green-100 text-green-700' },
  { value: 'testing',  label: 'Testing',   color: 'bg-blue-100 text-blue-700' },
  { value: 'winner',   label: 'Ganador 🏆', color: 'bg-amber-100 text-amber-700' },
  { value: 'paused',   label: 'Pausado',   color: 'bg-gray-100 text-gray-500' },
  { value: 'loser',    label: 'Perdedor',  color: 'bg-red-100 text-red-600' },
]

interface Adset { id: string; name: string; campaign_id: string }

interface Props {
  creatives: Creative[]
  adsets: Adset[]
}

export default function CreativosClient({ creatives: initial, adsets }: Props) {
  const [creatives, setCreatives] = useState(initial)
  const [adding, setAdding] = useState(false)
  const [form, setForm] = useState({
    name: '', adset_id: '', adset_name: '', file_type: 'image', meta_ad_id: '', notes: ''
  })
  const [saving, setSaving] = useState(false)
  const supabase = createClientBrowser()

  async function saveCreative() {
    if (!form.name) return
    setSaving(true)
    const { data } = await supabase
      .from('creatives')
      .insert({
        name: form.name,
        adset_id: form.adset_id || null,
        adset_name: form.adset_name || null,
        file_type: form.file_type,
        meta_ad_id: form.meta_ad_id || null,
        notes: form.notes || null,
        status: 'active',
      })
      .select()
      .single()

    if (data) {
      setCreatives(prev => [data, ...prev])
      setForm({ name: '', adset_id: '', adset_name: '', file_type: 'image', meta_ad_id: '', notes: '' })
      setAdding(false)
    }
    setSaving(false)
  }

  async function updateStatus(id: string, status: string) {
    await supabase.from('creatives').update({ status }).eq('id', id)
    setCreatives(prev => prev.map(c => c.id === id ? { ...c, status: status as Creative['status'] } : c))
  }

  const statusBadge = (status: string) => {
    const opt = STATUS_OPTIONS.find(o => o.value === status)
    return <span className={`inline-block px-2 py-0.5 rounded-full text-xs font-medium ${opt?.color || ''}`}>{opt?.label || status}</span>
  }

  const typeIcon = (type: string | null) =>
    type === 'video' ? '🎬' : type === 'carousel' ? '🎠' : '🖼️'

  return (
    <div>
      {/* Add button */}
      <div className="flex justify-between items-center mb-4">
        <p className="text-sm text-gray-500">{creatives.length} creativos registrados</p>
        <button
          onClick={() => setAdding(!adding)}
          className="flex items-center gap-2 bg-black text-white px-4 py-2 rounded-lg text-sm font-medium hover:bg-gray-800 transition-colors"
        >
          {adding ? '✕ Cancelar' : '+ Agregar creativo'}
        </button>
      </div>

      {/* Add form */}
      {adding && (
        <div className="bg-white rounded-xl border border-gray-200 p-4 mb-4">
          <h3 className="text-sm font-semibold text-gray-800 mb-3">Registrar nuevo creativo</h3>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            <input value={form.name} onChange={e => setForm(p => ({...p, name: e.target.value}))}
              placeholder="Nombre del creativo *" className="px-3 py-2 rounded-lg border border-gray-200 text-sm focus:outline-none focus:ring-2 focus:ring-black" />

            <select value={form.file_type} onChange={e => setForm(p => ({...p, file_type: e.target.value}))}
              className="px-3 py-2 rounded-lg border border-gray-200 text-sm bg-white focus:outline-none">
              <option value="image">Imagen</option>
              <option value="video">Video</option>
              <option value="carousel">Carrusel</option>
            </select>

            <select value={form.adset_id} onChange={e => {
              const s = adsets.find((a: Adset) => a.id === e.target.value)
              setForm(p => ({...p, adset_id: e.target.value, adset_name: s?.name || ''}))
            }} className="px-3 py-2 rounded-lg border border-gray-200 text-sm bg-white focus:outline-none">
              <option value="">Ad set (opcional)</option>
              {adsets.filter((s: Adset) => s.name).map((s: Adset) => (
                <option key={s.id} value={s.id}>{s.name}</option>
              ))}
            </select>

            <input value={form.meta_ad_id} onChange={e => setForm(p => ({...p, meta_ad_id: e.target.value}))}
              placeholder="ID del anuncio en Meta (opcional)" className="px-3 py-2 rounded-lg border border-gray-200 text-sm focus:outline-none focus:ring-2 focus:ring-black" />

            <textarea value={form.notes} onChange={e => setForm(p => ({...p, notes: e.target.value}))}
              placeholder="Notas sobre el creativo..." rows={2}
              className="md:col-span-2 px-3 py-2 rounded-lg border border-gray-200 text-sm focus:outline-none focus:ring-2 focus:ring-black resize-none" />
          </div>
          <button onClick={saveCreative} disabled={saving || !form.name}
            className="mt-3 bg-black text-white px-4 py-2 rounded-lg text-sm font-medium hover:bg-gray-800 disabled:opacity-50">
            {saving ? 'Guardando...' : 'Guardar'}
          </button>
        </div>
      )}

      {/* Grid */}
      {creatives.length === 0 ? (
        <div className="text-center py-16 text-gray-400">
          <p className="text-4xl mb-3">🎨</p>
          <p className="text-sm">Registrá tus creativos para hacer seguimiento de cuáles funcionan mejor</p>
        </div>
      ) : (
        <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
          <table className="w-full text-sm">
            <thead>
              <tr className="bg-gray-50 border-b border-gray-100">
                <th className="text-left px-4 py-2.5 text-xs font-semibold text-gray-500 uppercase tracking-wide">Creativo</th>
                <th className="text-left px-4 py-2.5 text-xs font-semibold text-gray-500 uppercase tracking-wide">Ad set</th>
                <th className="text-left px-4 py-2.5 text-xs font-semibold text-gray-500 uppercase tracking-wide">Tipo</th>
                <th className="text-left px-4 py-2.5 text-xs font-semibold text-gray-500 uppercase tracking-wide">Fecha</th>
                <th className="text-left px-4 py-2.5 text-xs font-semibold text-gray-500 uppercase tracking-wide">Estado</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-50">
              {creatives.map(c => (
                <tr key={c.id} className="hover:bg-gray-50 transition-colors">
                  <td className="px-4 py-3">
                    <p className="font-medium text-gray-900">{c.name}</p>
                    {c.notes && <p className="text-xs text-gray-400 mt-0.5">{c.notes}</p>}
                  </td>
                  <td className="px-4 py-3 text-gray-500 text-xs">{c.adset_name || '—'}</td>
                  <td className="px-4 py-3 text-base">{typeIcon(c.file_type)}</td>
                  <td className="px-4 py-3 text-gray-500 text-xs">
                    {new Date(c.created_at).toLocaleDateString('es-AR')}
                  </td>
                  <td className="px-4 py-3">
                    <select value={c.status} onChange={e => updateStatus(c.id, e.target.value)}
                      className="text-xs border border-gray-200 rounded-lg px-2 py-1 bg-white focus:outline-none">
                      {STATUS_OPTIONS.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
                    </select>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}
