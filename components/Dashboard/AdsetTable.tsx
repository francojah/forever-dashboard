import type { Adset } from '@/lib/supabase'

interface Props {
  adsets: Adset[]
  campaignMap: Record<string, string>
  breakeven: number
}

function roasColor(roas: number | null) {
  if (!roas) return 'text-gray-400'
  if (roas >= 5) return 'text-green-700'
  if (roas >= 3) return 'text-amber-600'
  return 'text-red-600'
}

function cpaColor(cpa: number | null, breakeven: number) {
  if (!cpa) return 'text-gray-400'
  if (cpa <= breakeven) return 'text-green-700'
  if (cpa <= breakeven * 1.2) return 'text-amber-600'
  return 'text-red-600'
}

function statusBadge(status: string) {
  if (status === 'ACTIVE') return (
    <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs bg-green-100 text-green-700 font-medium">
      <span className="w-1.5 h-1.5 rounded-full bg-green-500"></span>Activo
    </span>
  )
  return (
    <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs bg-gray-100 text-gray-500 font-medium">
      <span className="w-1.5 h-1.5 rounded-full bg-gray-400"></span>Pausado
    </span>
  )
}

function RoasBar({ roas }: { roas: number | null }) {
  if (!roas) return <div className="h-1.5 bg-gray-100 rounded-full w-24"></div>
  const pct = Math.min((roas / 10) * 100, 100)
  const color = roas >= 5 ? '#16a34a' : roas >= 3 ? '#d97706' : '#dc2626'
  return (
    <div className="flex items-center gap-2">
      <div className="h-1.5 bg-gray-100 rounded-full w-16 overflow-hidden">
        <div className="h-full rounded-full" style={{ width: `${pct}%`, background: color }} />
      </div>
      <span className={`text-xs font-semibold ${roasColor(roas)}`}>{roas}x</span>
    </div>
  )
}

export default function AdsetTable({ adsets, campaignMap, breakeven }: Props) {
  return (
    <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-gray-100 bg-gray-50">
              <th className="text-left px-4 py-2.5 text-xs font-semibold text-gray-500 uppercase tracking-wide">Ad set</th>
              <th className="text-left px-4 py-2.5 text-xs font-semibold text-gray-500 uppercase tracking-wide">Estado</th>
              <th className="text-right px-4 py-2.5 text-xs font-semibold text-gray-500 uppercase tracking-wide">Budget/día</th>
              <th className="text-right px-4 py-2.5 text-xs font-semibold text-gray-500 uppercase tracking-wide">Gasto 7d</th>
              <th className="text-right px-4 py-2.5 text-xs font-semibold text-gray-500 uppercase tracking-wide">Compras</th>
              <th className="text-right px-4 py-2.5 text-xs font-semibold text-gray-500 uppercase tracking-wide">CPA</th>
              <th className="text-left px-4 py-2.5 text-xs font-semibold text-gray-500 uppercase tracking-wide">ROAS</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-50">
            {adsets.map(s => (
              <tr key={s.id} className="hover:bg-gray-50 transition-colors">
                <td className="px-4 py-3">
                  <p className="font-medium text-gray-900 text-sm">{s.name}</p>
                  <p className="text-xs text-gray-400 mt-0.5">{campaignMap[s.campaign_id] || '—'}</p>
                </td>
                <td className="px-4 py-3">{statusBadge(s.status)}</td>
                <td className="px-4 py-3 text-right text-gray-700">
                  {s.daily_budget ? `$${s.daily_budget.toLocaleString('es-AR')}` : '—'}
                </td>
                <td className="px-4 py-3 text-right font-medium text-gray-900">
                  {s.spend ? `$${Math.round(s.spend).toLocaleString('es-AR')}` : '—'}
                </td>
                <td className="px-4 py-3 text-right text-gray-700">
                  {s.results ?? '—'}
                </td>
                <td className={`px-4 py-3 text-right font-semibold ${cpaColor(s.cost_per_result, breakeven)}`}>
                  {s.cost_per_result ? `$${Math.round(s.cost_per_result).toLocaleString('es-AR')}` : '—'}
                </td>
                <td className="px-4 py-3">
                  <RoasBar roas={s.roas} />
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  )
}
