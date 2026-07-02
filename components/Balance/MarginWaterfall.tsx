'use client'

import { LOCALE } from '@/lib/config'

/**
 * MarginWaterfall — Cascada de margen: revenue → costos → margen neto.
 * Modela la estructura de costos de Forever (overrideable por props).
 * Incluye el costo de cuotas sin interés absorbidas.
 */

interface Props {
  revenue: number
  orders: number
  units: number
  installmentsCost?: number
  // Parámetros de costo (defaults Forever Basics)
  merchPerUnit?: number
  shippingPerOrder?: number
  commissionPct?: number
  packagingPerOrder?: number
  className?: string
}

export default function MarginWaterfall({
  revenue,
  orders,
  units,
  installmentsCost = 0,
  merchPerUnit = 19500,
  shippingPerOrder = 5750,
  commissionPct = 0.025,
  packagingPerOrder = 350,
  className,
}: Props) {
  const merch = merchPerUnit * units
  const shipping = shippingPerOrder * orders
  const commission = revenue * commissionPct
  const packaging = packagingPerOrder * orders
  const totalCosts = merch + shipping + commission + packaging + installmentsCost
  const margin = revenue - totalCosts
  const marginPct = revenue > 0 ? (margin / revenue) * 100 : 0

  const steps = [
    { label: 'Revenue', value: revenue, type: 'start' as const },
    { label: 'Mercadería', value: -merch, type: 'cost' as const },
    { label: 'Envío', value: -shipping, type: 'cost' as const },
    { label: 'Comisión TN', value: -commission, type: 'cost' as const },
    { label: 'Cuotas s/interés', value: -installmentsCost, type: 'cost' as const },
    { label: 'Packaging', value: -packaging, type: 'cost' as const },
    { label: 'Margen neto', value: margin, type: 'end' as const },
  ].filter((s) => s.type !== 'cost' || Math.abs(s.value) > 0)

  const money = (n: number) => '$' + Math.round(Math.abs(n)).toLocaleString(LOCALE)
  const max = revenue || 1

  // running total para posicionar las barras flotantes
  let running = 0

  return (
    <div className={(className ?? '') + ' bg-white dark:bg-zinc-900 rounded-xl border border-gray-200 dark:border-zinc-800 p-5 shadow-sm'}>
      <div className="flex items-center justify-between mb-1">
        <h3 className="text-sm font-semibold text-gray-900 dark:text-zinc-100">Cascada de margen</h3>
        <span className={'text-sm font-bold ' + (marginPct >= 40 ? 'text-emerald-600 dark:text-emerald-400' : marginPct >= 20 ? 'text-amber-600 dark:text-amber-400' : 'text-red-500')}>
          {marginPct.toFixed(0)}% margen
        </span>
      </div>
      <p className="text-mini text-gray-400 dark:text-zinc-500 mb-4">
        {orders} órdenes · {units} unidades · modelo de costos editable
      </p>

      <div className="space-y-2">
        {steps.map((s, i) => {
          const isTotal = s.type === 'start' || s.type === 'end'
          let left = 0
          let width = 0
          if (isTotal) {
            left = 0
            width = (Math.abs(s.value) / max) * 100
          } else {
            // barra flotante desde running hacia running - costo
            const start = running
            const end = running + s.value // s.value negativo
            left = (Math.min(start, end) / max) * 100
            width = (Math.abs(s.value) / max) * 100
            running = end
          }
          if (s.type === 'start') running = s.value
          const color =
            s.type === 'start' ? 'bg-indigo-500' :
            s.type === 'end' ? (margin >= 0 ? 'bg-emerald-500' : 'bg-red-500') :
            'bg-rose-400 dark:bg-rose-500/70'
          return (
            <div key={i} className="flex items-center gap-3">
              <div className="w-28 shrink-0 text-mini text-gray-500 dark:text-zinc-400 truncate text-right">{s.label}</div>
              <div className="flex-1 h-6 relative bg-gray-50 dark:bg-zinc-800/50 rounded">
                <div
                  className={'absolute top-0 h-full rounded ' + color}
                  style={{ left: left + '%', width: Math.max(width, 0.5) + '%' }}
                />
              </div>
              <div className={'w-24 shrink-0 text-mini text-right tabular-nums ' + (s.type === 'cost' ? 'text-rose-500 dark:text-rose-400' : 'text-gray-800 dark:text-zinc-200 font-medium')}>
                {s.type === 'cost' ? '−' : ''}{money(s.value)}
              </div>
            </div>
          )
        })}
      </div>
    </div>
  )
}
