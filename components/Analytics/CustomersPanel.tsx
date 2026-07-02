'use client'

import { useEffect, useState } from 'react'
import type { ReactNode } from 'react'
import { ResponsiveContainer, BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Legend } from 'recharts'
import { LOCALE } from '@/lib/config'
import EmptyState from '@/components/ui/EmptyState'
import { PanelSkeleton } from '@/components/ui/Skeleton'

/**
 * CustomersPanel — Recurrencia y LTV. Consume /api/analytics/customers.
 * Requiere tn_orders poblada (migración 20260702 + sync de TN).
 */

interface Data {
  empty?: boolean
  message?: string
  total_customers?: number
  repeat_customers?: number
  repeat_rate?: number
  avg_ltv?: number
  avg_orders_per_customer?: number
  distribution?: { one: number; two: number; three: number; fourPlus: number }
  monthly?: { month: string; nuevos: number; recurrentes: number }[]
}

export default function CustomersPanel() {
  const [data, setData] = useState<Data | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    fetch('/api/analytics/customers')
      .then((r) => r.json())
      .then(setData)
      .catch(() => setData({ empty: true, message: 'Error cargando datos.' }))
      .finally(() => setLoading(false))
  }, [])

  if (loading) return <Card><PanelSkeleton /></Card>
  if (!data || data.empty)
    return (
      <Card>
        <EmptyState
          title="Sin datos de clientes todavía"
          description={data?.message || 'Corré el sync de Tiendanube para ver recurrencia y LTV.'}
          action={{ label: 'Ir a Configuración', href: '/settings' }}
        />
      </Card>
    )

  const money = (n?: number) => '$' + Math.round(n || 0).toLocaleString(LOCALE)
  const dist = data.distribution!

  return (
    <Card>
      <h3 className="text-sm font-semibold text-gray-900 dark:text-zinc-100 mb-4">Clientes · recurrencia y LTV</h3>

      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-5">
        <Kpi label="Clientes" value={(data.total_customers || 0).toLocaleString(LOCALE)} />
        <Kpi label="Tasa de recompra" value={(data.repeat_rate || 0) + '%'} accent={(data.repeat_rate || 0) >= 25} />
        <Kpi label="LTV promedio" value={money(data.avg_ltv)} />
        <Kpi label="Órdenes/cliente" value={String(data.avg_orders_per_customer || 0)} />
      </div>

      {/* Distribución por # de compras */}
      <div className="mb-5">
        <p className="text-mini uppercase tracking-wide text-gray-400 dark:text-zinc-500 mb-2">Distribución por compras</p>
        <div className="flex gap-1 h-6 rounded-md overflow-hidden">
          <Seg n={dist.one} total={data.total_customers!} color="bg-indigo-300 dark:bg-indigo-500/40" label="1 compra" />
          <Seg n={dist.two} total={data.total_customers!} color="bg-indigo-400 dark:bg-indigo-500/60" label="2" />
          <Seg n={dist.three} total={data.total_customers!} color="bg-indigo-500 dark:bg-indigo-500/80" label="3" />
          <Seg n={dist.fourPlus} total={data.total_customers!} color="bg-emerald-500" label="4+" />
        </div>
        <p className="text-micro text-gray-400 dark:text-zinc-500 mt-1">
          {dist.one} compraron 1 vez · {dist.two + dist.three + dist.fourPlus} volvieron
        </p>
      </div>

      {/* Nuevos vs recurrentes por mes */}
      {data.monthly && data.monthly.length > 0 && (
        <div>
          <p className="text-mini uppercase tracking-wide text-gray-400 dark:text-zinc-500 mb-2">Nuevos vs recurrentes por mes</p>
          <ResponsiveContainer width="100%" height={180}>
            <BarChart data={data.monthly} margin={{ top: 5, right: 8, left: 0, bottom: 0 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="currentColor" className="text-gray-100 dark:text-zinc-800" />
              <XAxis dataKey="month" tick={{ fontSize: 10 }} tickFormatter={(m) => (m as string).slice(2)} stroke="currentColor" className="text-gray-400 dark:text-zinc-600" />
              <YAxis tick={{ fontSize: 10 }} stroke="currentColor" className="text-gray-400 dark:text-zinc-600" width={30} />
              <Tooltip contentStyle={{ fontSize: 12, borderRadius: 8 }} />
              <Legend wrapperStyle={{ fontSize: 11 }} />
              <Bar dataKey="nuevos" stackId="a" fill="#6366f1" name="Nuevos" radius={[0, 0, 0, 0]} />
              <Bar dataKey="recurrentes" stackId="a" fill="#10b981" name="Recurrentes" radius={[3, 3, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </div>
      )}
    </Card>
  )
}

function Card({ children }: { children: ReactNode }) {
  return (
    <div className="bg-white dark:bg-zinc-900 rounded-xl border border-gray-200 dark:border-zinc-800 p-5 shadow-sm">
      {children}
    </div>
  )
}

function Kpi({ label, value, accent }: { label: string; value: string; accent?: boolean }) {
  return (
    <div>
      <p className="text-mini uppercase tracking-wide text-gray-400 dark:text-zinc-500">{label}</p>
      <p className={'text-lg font-semibold mt-0.5 ' + (accent ? 'text-emerald-600 dark:text-emerald-400' : 'text-gray-900 dark:text-zinc-100')}>
        {value}
      </p>
    </div>
  )
}

function Seg({ n, total, color, label }: { n: number; total: number; color: string; label: string }) {
  const pct = total > 0 ? (n / total) * 100 : 0
  if (pct === 0) return null
  return <div className={color} style={{ width: pct + '%' }} title={`${label}: ${n} (${pct.toFixed(0)}%)`} />
}
