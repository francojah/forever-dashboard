import type { AlertData } from '@/lib/supabase'

export default function AlertsPanel({ alerts }: { alerts: AlertData[] }) {
  const danger = alerts.filter(a => a.severity === 'danger')
  const warnings = alerts.filter(a => a.severity === 'warning')

  return (
    <div className="mt-4 space-y-2">
      {danger.map((a, i) => (
        <div key={i} className="flex gap-3 px-4 py-3 bg-red-50 border border-red-200 rounded-xl">
          <span className="text-lg">🔴</span>
          <div>
            <p className="text-sm font-semibold text-red-800">{a.entity_name}</p>
            <p className="text-sm text-red-700">{a.message}</p>
          </div>
        </div>
      ))}
      {warnings.map((a, i) => (
        <div key={i} className="flex gap-3 px-4 py-3 bg-amber-50 border border-amber-200 rounded-xl">
          <span className="text-lg">⚠️</span>
          <div>
            <p className="text-sm font-semibold text-amber-800">{a.entity_name}</p>
            <p className="text-sm text-amber-700">{a.message}</p>
          </div>
        </div>
      ))}
    </div>
  )
}
