'use client'

import { useEffect, useState } from 'react'
import { ComposedChart, Bar, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Legend } from 'recharts'
import { LOCALE } from '@/lib/config'
import { Skeleton } from '@/components/ui/Skeleton'

interface Row { month: string; meta_spend: number | null; tn_revenue: number | null }
const MONTHS = ['Ene', 'Feb', 'Mar', 'Abr', 'May', 'Jun', 'Jul', 'Ago', 'Sep', 'Oct', 'Nov', 'Dic']

export default function PnlTrend() {
  const [rows, setRows] = useState<Row[] | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    fetch('/api/monthly', { cache: 'no-store' })
      .then((r) => r.json())
      .then((d) => setRows(Array.isArray(d) ? d : (d.data || [])))
      .catch(() => setRows([]))
      .finally(() => setLoading(false))
  }, [])

  const data = (rows || [])
    .filter((r) => (r.tn_revenue || 0) > 0)
    .sort((a, b) => a.month.localeCompare(b.month))
    .map((r) => {
      const [, m] = r.month.split('-')
      return {
        mes: MONTHS[Number(m) - 1] || r.month,
        Revenue: Math.round(r.tn_revenue || 0),
        Gasto: Math.round(r.meta_spend || 0),
        ROAS: r.meta_spend ? +(((r.tn_revenue || 0) / r.meta_spend).toFixed(1)) : null,
      }
    })

  return (
    <div className="bg-white dark:bg-zinc-900 rounded-xl border border-gray-200 dark:border-zinc-800 p-5 shadow-sm">
      <h3 className="text-sm font-semibold text-gray-900 dark:text-zinc-100 mb-1">Trayectoria mensual</h3>
      <p className="text-mini text-gray-400 dark:text-zinc-500 mb-4">Revenue vs gasto de ads y ROAS real, mes a mes.</p>

      {loading ? (
        <Skeleton className="h-56 w-full" />
      ) : data.length === 0 ? (
        <p className="text-mini text-gray-400 dark:text-zinc-500">Sin historial mensual todavía. Cargá o sincronizá meses en <a href="/balance" className="text-brand">Balance</a>.</p>
      ) : (
        <ResponsiveContainer width="100%" height={240}>
          <ComposedChart data={data} margin={{ top: 5, right: 8, left: 0, bottom: 0 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="currentColor" className="text-gray-100 dark:text-zinc-800" />
            <XAxis dataKey="mes" tick={{ fontSize: 11 }} stroke="currentColor" className="text-gray-400 dark:text-zinc-600" />
            <YAxis yAxisId="money" tick={{ fontSize: 10 }} tickFormatter={(v) => '$' + Math.round(Number(v) / 1000) + 'K'} stroke="currentColor" className="text-gray-400 dark:text-zinc-600" width={44} />
            <YAxis yAxisId="roas" orientation="right" tick={{ fontSize: 10 }} tickFormatter={(v) => v + 'x'} stroke="currentColor" className="text-gray-400 dark:text-zinc-600" width={30} />
            <Tooltip contentStyle={{ fontSize: 12, borderRadius: 8 }} formatter={(v, n) => n === 'ROAS' ? [v + 'x', n] : ['$' + Number(v).toLocaleString(LOCALE), n]} />
            <Legend wrapperStyle={{ fontSize: 11 }} />
            <Bar yAxisId="money" dataKey="Revenue" fill="#6366f1" radius={[3, 3, 0, 0]} />
            <Bar yAxisId="money" dataKey="Gasto" fill="#f43f5e" radius={[3, 3, 0, 0]} />
            <Line yAxisId="roas" type="monotone" dataKey="ROAS" stroke="#10b981" strokeWidth={2} dot={{ r: 3 }} />
          </ComposedChart>
        </ResponsiveContainer>
      )}
    </div>
  )
}
