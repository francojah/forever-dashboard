'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import type { TNSnapshot, Snapshot } from '@/lib/supabase'
import { InfoTooltip } from '@/components/ui/InfoTooltip'
import ArgentinaMap from '@/components/ArgentinaMap'

type Period = 'today' | 'yesterday' | '7d' | '30d' | 'ytd'

const PERIOD_LABELS: Record<Period, string> = {
  today:     'Hoy',
  yesterday: 'Ayer',
  '7d':      '7 días',
  '30d':     '30 días',
  ytd:       'Este año',
}

interface Props {
  tnSnapshot: TNSnapshot | null
  metaSnapshot: Snapshot | null
}

function fmt(n: number | null | undefined, type: 'money' | 'number' | 'pct' = 'money'): string {
  if (n == null) return '—'
  if (type === 'money') {
    if (n >= 1_000_000) return `$${(n / 1_000_000).toFixed(1)}M`
    if (n >= 1_000)     return `$${Math.round(n / 1000)}K`
    return `$${Math.round(n)}`
  }
  if (type === 'pct') return `${n.toFixed(1)}%`
  return String(Math.round(n))
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function getSummary(tnSnapshot: TNSnapshot | null, period: Period): any {
  if (!tnSnapshot) return null
  switch (period) {
    case 'today':     return tnSnapshot.summary_today
    case 'yesterday': return tnSnapshot.summary_yesterday
    case '7d':        return tnSnapshot.summary_7d
    case '30d':       return tnSnapshot.summary_30d
    case 'ytd':       return tnSnapshot.summary_ytd
  }
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function getMetaSummary(metaSnapshot: Snapshot | null, period: Period): any {
  if (!metaSnapshot) return null
  switch (period) {
    case 'today':     return metaSnapshot.periods?.today?.summary ?? null
    case 'yesterday': return metaSnapshot.periods?.yesterday?.summary ?? null
    case '7d':        return metaSnapshot.summary
    case '30d':       return metaSnapshot.periods?.last_30d?.summary ?? null
    case 'ytd':       return null // Meta no tiene YTD nativo, usamos 30d como proxy
  }
}

export default function TiendanubeClient({ tnSnapshot, metaSnapshot }: Props) {
  const [period, setPeriod] = useState<Period>('7d')
  const [expandedProduct, setExpandedProduct] = useState<number | null>(null)

  const tn   = getSummary(tnSnapshot, period)
  const meta = getMetaSummary(metaSnapshot, period)

  // Mapa de nombres de envío para la UI
  const SHIPPING_NAME: Record<string, string> = { Retiro: 'Moto Express' }
  const shippingItems: [string, number][] = Object.entries(
    (tn?.shipping_methods as Record<string, number>) ?? {}
  ).sort((a, b) => b[1] - a[1]).map(([k, v]) => [SHIPPING_NAME[k] ?? k, v])
  const shippingRevenue: Record<string, number> | undefined = tn?.shipping_method_revenue
    ? Object.fromEntries(Object.entries(tn.shipping_method_revenue as Record<string, number>)
        .map(([k, v]) => [SHIPPING_NAME[k] ?? k, v]))
    : undefined

  // ── Prior period for delta comparison ─────────────────────────
  // today → yesterday | 7d → compare daily avg vs 30d daily avg
  function getPrior() {
    if (period === 'today')     return getSummary(tnSnapshot, 'yesterday')
    if (period === 'yesterday') return null
    if (period === '7d')        return getSummary(tnSnapshot, '30d')   // daily avg comparison
    if (period === '30d')       return getSummary(tnSnapshot, 'ytd')
    return null
  }
  const priorRaw = getPrior()

  // Normalize to "daily average" when comparing periods of different length
  const periodDaysMap: Record<Period, number> = { today: 1, yesterday: 1, '7d': 7, '30d': 30, ytd: Math.max(1, (new Date().getMonth()) * 30 + new Date().getDate()) }
  const curDays   = periodDaysMap[period]
  const priorPeriod: Period | null = period === 'today' ? 'yesterday' : period === '7d' ? '30d' : period === '30d' ? 'ytd' : null
  const priorDays = priorPeriod ? periodDaysMap[priorPeriod] : 1

  function delta(cur: number | undefined, priorVal: number | undefined): number | null {
    if (cur == null || priorVal == null) return null
    const curPerDay   = curDays   > 0 ? cur   / curDays   : cur
    const priorPerDay = priorDays > 0 ? priorVal / priorDays : priorVal
    if (priorPerDay <= 0) return null
    return ((curPerDay - priorPerDay) / priorPerDay) * 100
  }

  // ── Attribution math ──────────────────────────────────────────
  const tnRevenue     = tn?.total_revenue ?? 0
  const tnOrders      = tn?.total_orders  ?? 0
  const tnAOV         = tn?.aov ?? 0
  const metaSpend     = meta?.total_spend_7d ?? meta?.conversion_spend_7d ?? 0
  const metaRoas      = meta?.blended_roas ?? 0
  const metaPurchases = meta?.total_purchases_7d ?? 0

  // Meta attributed revenue = Meta purchases × TN real AOV
  const metaAttributedRevenue = metaPurchases > 0 && tnAOV > 0
    ? Math.min(metaPurchases * tnAOV, tnRevenue)
    : 0
  const organicRevenue = Math.max(0, tnRevenue - metaAttributedRevenue)
  const metaPct    = tnRevenue > 0 ? (metaAttributedRevenue / tnRevenue) * 100 : 0
  const organicPct = Math.max(0, 100 - metaPct)

  // True ROAS = TN total revenue / Meta spend
  const trueRoas = metaSpend > 0 && tnRevenue > 0 ? tnRevenue / metaSpend : null
  const reportedRoas = metaRoas > 0 ? metaRoas : null

  // Organic orders
  const organicOrders = Math.max(0, tnOrders - metaPurchases)

  // Days in period
  const days = curDays
  const revenuePerDay = tnRevenue > 0 ? tnRevenue / days : 0
  const ordersPerDay  = tnOrders  > 0 ? tnOrders  / days : 0

  // ── Derived customer metrics ──────────────────────────────────
  const uniqueCustomers  = tn?.unique_customers ?? 0
  const repeatCustomers  = tn?.repeat_customers ?? 0
  const totalUnitsSold   = tn?.total_units_sold ?? 0
  const revenuePerCustomer = uniqueCustomers > 0 ? tnRevenue / uniqueCustomers : 0
  const ordersPerCustomer  = uniqueCustomers > 0 ? tnOrders  / uniqueCustomers : 0
  const repeatRate         = uniqueCustomers > 0 ? (repeatCustomers / uniqueCustomers) * 100 : 0
  const unitsPerOrder      = tnOrders > 0 ? totalUnitsSold / tnOrders : 0
  const topProvinces       = (tn?.top_provinces ?? []) as { name: string; count: number }[]
  const top3PctNum         = tnOrders > 0 && topProvinces.length >= 3
    ? (topProvinces.slice(0, 3).reduce((s, p) => s + p.count, 0) / tnOrders) * 100
    : 0
  const dowStats = tn?.day_of_week_stats as Record<string, number> | undefined

  const hasData = tn != null
  const hasMetaData = meta != null && metaSpend > 0

  return (
    <div className="max-w-6xl mx-auto space-y-6">

      {/* Header */}
      <div className="flex items-start justify-between gap-4 flex-wrap">
        <div>
          <h1 className="text-xl font-semibold text-gray-900 dark:text-zinc-100">Datos Tiendanube</h1>
          <p className="text-sm mt-0.5">
            <span className="text-gray-500 dark:text-zinc-500">
              {tnSnapshot ? `Última actualización: ${tnSnapshot.snapshot_date}` : 'Sin datos'}
            </span>
          </p>
        </div>

        <div className="flex items-center gap-2">
          {/* Period tabs */}
          <div className="flex gap-1 bg-gray-100 dark:bg-zinc-800 rounded-lg p-1">
          {(Object.keys(PERIOD_LABELS) as Period[]).map(p => (
            <button
              key={p}
              onClick={() => setPeriod(p)}
              className={`px-3 py-1.5 rounded-md text-xs font-medium transition-all ${
                period === p
                  ? 'bg-white dark:bg-zinc-700 text-gray-900 dark:text-zinc-100 shadow-sm'
                  : 'text-gray-500 dark:text-zinc-400 hover:text-gray-700 dark:hover:text-zinc-200'
              }`}
            >
              {PERIOD_LABELS[p]}
            </button>
          ))}
          </div>
        </div>
      </div>

      {!hasData ? (
        <div className="flex flex-col items-center justify-center py-20 text-center">
          <div className="text-5xl mb-4">🛍️</div>
          <h2 className="text-lg font-semibold text-gray-800 dark:text-zinc-200 mb-2">
            {period === 'today' || period === 'yesterday'
              ? `Sin datos para ${PERIOD_LABELS[period].toLowerCase()}`
              : 'Sin datos de Tiendanube'}
          </h2>
          <p className="text-sm text-gray-500 dark:text-zinc-500 max-w-xs">
            {tnSnapshot
              ? 'Este período no tiene datos disponibles en el último sync.'
              : 'Corré el workflow "Daily Meta Sync" en GitHub Actions para importar los datos.'}
          </p>
        </div>
      ) : (
        <>
          {/* ── KPIs Tiendanube ── */}
          <div>
            <p className="text-xs font-semibold text-gray-400 dark:text-zinc-500 uppercase tracking-wider mb-3">
              Tiendanube · {PERIOD_LABELS[period]}
            </p>
            <div className="grid grid-cols-2 lg:grid-cols-3 xl:grid-cols-5 gap-3">
              <KpiCard label="Ventas totales"   value={fmt(tnRevenue)}         sub={`${fmt(revenuePerDay)}/día`}   color="indigo"
                delta={delta(tnRevenue, priorRaw?.total_revenue)}
                tooltip="Total facturado en Tiendanube en el período. Incluye todas las fuentes de tráfico, no solo Meta Ads." />
              <KpiCard label="Órdenes"           value={fmt(tnOrders, 'number')} sub={`${ordersPerDay.toFixed(1)}/día`} color="violet"
                delta={delta(tnOrders, priorRaw?.total_orders)}
                tooltip="Cantidad de órdenes pagadas en el período. Es la base para calcular el ticket promedio y la conversión." />
              <KpiCard label="Ticket promedio"   value={fmt(tn?.aov)}            sub="por orden"                    color="purple"
                delta={priorRaw?.aov != null && tn?.aov != null ? ((tn.aov - priorRaw.aov) / priorRaw.aov) * 100 : null}
                tooltip="Valor promedio por orden (AOV). Calculado como ventas totales ÷ cantidad de órdenes. Subir el AOV mejora el ROAS sin aumentar el gasto." />
              <KpiCard label="Clientes únicos"   value={fmt(tn?.unique_customers, 'number')} sub="en el período"   color="fuchsia"
                delta={delta(tn?.unique_customers, priorRaw?.unique_customers)}
                tooltip="Clientes con al menos una compra en el período. Un cliente que compra dos veces cuenta una sola vez." />
              <KpiCard label="Unidades vendidas" value={fmt(tn?.total_units_sold, 'number')} sub="artículos"       color="purple"
                delta={delta(tn?.total_units_sold, priorRaw?.total_units_sold)}
                tooltip="Total de artículos vendidos sumando las cantidades de todos los productos de las órdenes pagadas." />
            </div>
          </div>

          {/* ── Métricas derivadas de clientes ── */}
          {uniqueCustomers > 0 && (
            <div>
              <p className="text-xs font-semibold text-gray-400 dark:text-zinc-500 uppercase tracking-wider mb-3">
                Comportamiento de clientes · {PERIOD_LABELS[period]}
              </p>
              <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
                <KpiCard
                  label="Revenue / cliente"
                  value={fmt(revenuePerCustomer)}
                  sub="facturado por cliente"
                  color="violet"
                  tooltip="Total vendido dividido la cantidad de clientes únicos. Muestra cuánto vale en promedio cada cliente en el período."
                />
                <KpiCard
                  label="Clientes recurrentes"
                  value={fmt(repeatCustomers, 'number')}
                  sub={repeatRate > 0 ? `${repeatRate.toFixed(1)}% tasa recompra` : 'sin recompra en período'}
                  color={repeatRate > 15 ? 'emerald' : repeatRate > 5 ? 'amber' : 'slate'}
                  tooltip="Clientes que hicieron más de una compra en el período. La tasa de recompra es un indicador clave de fidelización y LTV."
                />
                <KpiCard
                  label="Unidades / orden"
                  value={unitsPerOrder.toFixed(2)}
                  sub="artículos por compra"
                  color="sky"
                  tooltip="Promedio de artículos por orden. Subir esta cifra (upsell, combos) mejora el AOV sin aumentar el costo de adquisición."
                />
                <KpiCard
                  label="Concentración geog."
                  value={top3PctNum > 0 ? `${top3PctNum.toFixed(0)}%` : '—'}
                  sub={topProvinces.length >= 3 ? `de ${topProvinces[0]?.name ?? ''}, ${topProvinces[1]?.name ?? ''}, ${topProvinces[2]?.name ?? ''}` : 'top 3 provincias'}
                  color={top3PctNum > 80 ? 'amber' : 'slate'}
                  tooltip="Porcentaje de órdenes que vienen de las 3 provincias principales. Más del 80% indica concentración geográfica alta — oportunidad de expandir en otras regiones."
                />
              </div>
            </div>
          )}

          {/* ── Ventas por día de semana ── */}
          {dowStats && Object.values(dowStats).some(v => v > 0) && (
            <div className="bg-white dark:bg-zinc-900 rounded-xl border border-gray-200 dark:border-zinc-800 p-5 shadow-sm">
              <h2 className="text-sm font-semibold text-gray-700 dark:text-zinc-300 mb-4">
                Ventas por día de semana · {PERIOD_LABELS[period]}
                <InfoTooltip text="Monto total vendido (ARS) agrupado por día de la semana. Útil para identificar los mejores días y planificar presupuesto de ads." />
              </h2>
              <DowBarChart stats={dowStats} />
            </div>
          )}

          {/* ── KPIs Meta ── */}
          {hasMetaData && (
            <div>
              <p className="text-xs font-semibold text-gray-400 dark:text-zinc-500 uppercase tracking-wider mb-3">
                Meta Ads · {PERIOD_LABELS[period]}
              </p>
              <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
                <KpiCard label="Gasto Meta"         value={fmt(metaSpend)}                            sub="invertido en ads"    color="blue"
                  tooltip="Total invertido en Meta Ads en el período. Incluye todos los ad sets con actividad." />
                <KpiCard label="Compras atribuidas" value={fmt(metaPurchases, 'number')}              sub="reportadas por Meta" color="sky"
                  tooltip="Compras atribuidas por el pixel de Meta (ventana de 7 días click / 1 día view). Puede sobre-reportar porque incluye ventas influenciadas por anuncios anteriores." />
                <KpiCard label="ROAS reportado"     value={metaRoas ? `${metaRoas.toFixed(2)}x` : '—'} sub="según Meta"        color="cyan"
                  tooltip="ROAS según atribución de Meta. Puede estar inflado porque la ventana de 28 días captura ventas que habrían ocurrido de todas formas. Comparar con ROAS real abajo." />
                <KpiCard label="CPA"                value={fmt(meta?.blended_cpa)}                   sub="costo por compra"    color="teal"
                  tooltip="Costo promedio por compra atribuida según Meta. Es el gasto dividido las compras reportadas por el pixel." />
              </div>
            </div>
          )}

          {/* ── Attribution Summary (compact) ── */}
          {hasMetaData && (
            <div className="bg-white dark:bg-zinc-900 rounded-xl border border-gray-200 dark:border-zinc-800 p-4 shadow-sm">
              <h2 className="text-xs font-semibold text-gray-400 dark:text-zinc-500 uppercase tracking-wider mb-3">
                Atribución · Meta vs Orgánico
              </h2>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                {/* Stacked bar */}
                <div className="space-y-2">
                  <div className="w-full h-4 rounded-full overflow-hidden flex">
                    <div className="bg-indigo-500 transition-all duration-500" style={{ width: `${Math.min(metaPct, 100)}%` }} />
                    <div className="bg-emerald-400 flex-1" />
                  </div>
                  <div className="flex items-center justify-between text-xs text-gray-600 dark:text-zinc-400">
                    <span className="flex items-center gap-1.5"><span className="w-2 h-2 rounded-sm bg-indigo-500 inline-block" />Meta {metaPct.toFixed(0)}%</span>
                    <span className="flex items-center gap-1.5"><span className="w-2 h-2 rounded-sm bg-emerald-400 inline-block" />Orgánico {organicPct.toFixed(0)}%</span>
                  </div>
                  <div className="grid grid-cols-2 gap-3 pt-1">
                    <div>
                      <p className="text-xs text-gray-400 dark:text-zinc-500">Ventas Meta</p>
                      <p className="text-base font-semibold text-indigo-600 dark:text-indigo-400">{fmt(metaAttributedRevenue)}</p>
                      <p className="text-xs text-gray-400 dark:text-zinc-500">{metaPurchases} órdenes</p>
                    </div>
                    <div>
                      <p className="text-xs text-gray-400 dark:text-zinc-500">Ventas orgánicas</p>
                      <p className="text-base font-semibold text-emerald-600 dark:text-emerald-400">{fmt(organicRevenue)}</p>
                      <p className="text-xs text-gray-400 dark:text-zinc-500">{organicOrders} órdenes</p>
                    </div>
                  </div>
                </div>
                {/* Key ROAS metrics */}
                <div className="space-y-2 border-l border-gray-100 dark:border-zinc-800 pl-4">
                  <div className="flex justify-between items-center text-xs">
                    <span className="text-gray-500 dark:text-zinc-400">ROAS real (TN / Meta)</span>
                    <span className={`font-semibold ${trueRoas != null && trueRoas >= 5 ? 'text-emerald-600 dark:text-emerald-400' : trueRoas != null && trueRoas >= 3 ? 'text-amber-600 dark:text-amber-400' : 'text-red-500'}`}>
                      {trueRoas ? `${trueRoas.toFixed(2)}x` : '—'}
                    </span>
                  </div>
                  <div className="flex justify-between items-center text-xs">
                    <span className="text-gray-500 dark:text-zinc-400">ROAS reportado por Meta</span>
                    <span className="font-semibold text-gray-700 dark:text-zinc-300">{reportedRoas ? `${reportedRoas.toFixed(2)}x` : '—'}</span>
                  </div>
                  <div className="flex justify-between items-center text-xs">
                    <span className="text-gray-500 dark:text-zinc-400">CPA real (gasto / órdenes TN)</span>
                    <span className="font-semibold text-gray-700 dark:text-zinc-300">{tnOrders > 0 && metaSpend > 0 ? fmt(metaSpend / tnOrders) : '—'}</span>
                  </div>
                  {trueRoas != null && reportedRoas != null && Math.abs(reportedRoas - trueRoas) > 0.5 && (
                    <p className="text-micro text-amber-600 dark:text-amber-400 mt-2 pt-2 border-t border-gray-100 dark:border-zinc-800">
                      Meta {reportedRoas > trueRoas ? 'sobre-reporta' : 'sub-reporta'} vs ventas reales de TN
                    </p>
                  )}
                </div>
              </div>
            </div>
          )}

          {/* ── Top Productos ── */}
          {tn?.top_products?.length > 0 && (
            <div className="bg-white dark:bg-zinc-900 rounded-xl border border-gray-200 dark:border-zinc-800 shadow-sm overflow-hidden">
              <div className="p-4 border-b border-gray-100 dark:border-zinc-800 flex items-center justify-between">
                <h2 className="text-sm font-semibold text-gray-700 dark:text-zinc-300">Top productos · {PERIOD_LABELS[period]}</h2>
                <span className="text-mini text-gray-400 dark:text-zinc-600">Hacé click para ver variantes</span>
              </div>
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="text-xs text-gray-400 dark:text-zinc-500 bg-gray-50 dark:bg-zinc-800/50">
                      <th className="text-left px-4 py-2.5 font-medium w-8">#</th>
                      <th className="text-left px-4 py-2.5 font-medium">Producto</th>
                      <th className="text-right px-4 py-2.5 font-medium">Unidades</th>
                      <th className="text-right px-4 py-2.5 font-medium">Ventas</th>
                      <th className="text-right px-4 py-2.5 font-medium">% del total</th>
                    </tr>
                  </thead>
                  <tbody>
                    {tn.top_products.map((p: { name: string; quantity: number; revenue: number; variants?: { name: string; quantity: number; revenue: number }[] }, i: number) => {
                      const topTotal = tn.top_products.reduce((s: number, x: { revenue: number }) => s + x.revenue, 0)
                      const pct = topTotal > 0 ? (p.revenue / topTotal) * 100 : 0
                      const isExpanded = expandedProduct === i
                      const hasVariants = p.variants && p.variants.length > 0

                      return (
                        <>
                          {/* Fila del producto */}
                          <tr
                            key={`prod-${i}`}
                            onClick={() => hasVariants && setExpandedProduct(isExpanded ? null : i)}
                            className={`border-t border-gray-100 dark:border-zinc-800 transition-colors ${
                              hasVariants ? 'cursor-pointer hover:bg-gray-50 dark:hover:bg-zinc-800/30' : ''
                            } ${isExpanded ? 'bg-indigo-50/50 dark:bg-indigo-950/20' : ''}`}
                          >
                            <td className="px-4 py-2.5 text-gray-400 dark:text-zinc-600 font-medium">{i + 1}</td>
                            <td className="px-4 py-2.5">
                              <div className="flex items-center gap-2">
                                {hasVariants && (
                                  <svg
                                    viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"
                                    className={`w-3.5 h-3.5 shrink-0 text-indigo-400 transition-transform ${isExpanded ? 'rotate-90' : ''}`}
                                  >
                                    <polyline points="9 18 15 12 9 6"/>
                                  </svg>
                                )}
                                <span className="text-gray-700 dark:text-zinc-300">{p.name}</span>
                                {hasVariants && (
                                  <span className="text-micro text-indigo-400 dark:text-indigo-500 font-medium">
                                    {p.variants!.length} variantes
                                  </span>
                                )}
                              </div>
                            </td>
                            <td className="px-4 py-2.5 text-right text-gray-600 dark:text-zinc-400 font-medium">{p.quantity}</td>
                            <td className="px-4 py-2.5 text-right font-medium text-gray-800 dark:text-zinc-200">{fmt(p.revenue)}</td>
                            <td className="px-4 py-2.5 text-right">
                              <div className="flex items-center justify-end gap-2">
                                <div className="w-16 bg-gray-100 dark:bg-zinc-800 rounded-full h-1.5">
                                  <div className="h-1.5 rounded-full bg-indigo-400" style={{ width: `${Math.min(pct, 100)}%` }} />
                                </div>
                                <span className="text-xs text-gray-500 dark:text-zinc-400 w-8 text-right">{pct.toFixed(0)}%</span>
                              </div>
                            </td>
                          </tr>

                          {/* Filas de variantes (expandible) */}
                          {isExpanded && hasVariants && p.variants!.map((v, vi) => {
                            const vPct = p.quantity > 0 ? (v.quantity / p.quantity) * 100 : 0
                            const isTop = vi === 0
                            return (
                              <tr
                                key={`var-${i}-${vi}`}
                                className="border-t border-indigo-100/60 dark:border-indigo-900/30 bg-indigo-50/30 dark:bg-indigo-950/10"
                              >
                                <td className="px-4 py-2" />
                                <td className="px-4 py-2 pl-10">
                                  <div className="flex items-center gap-2">
                                    {isTop && (
                                      <span className="text-micro font-semibold bg-amber-100 dark:bg-amber-900/40 text-amber-600 dark:text-amber-400 px-1.5 py-0.5 rounded-full">
                                        #1
                                      </span>
                                    )}
                                    <span className="text-xs text-gray-600 dark:text-zinc-400">{v.name}</span>
                                  </div>
                                </td>
                                <td className="px-4 py-2 text-right">
                                  <div className="flex items-center justify-end gap-1.5">
                                    <div className="w-12 bg-indigo-100 dark:bg-indigo-900/30 rounded-full h-1">
                                      <div className="h-1 rounded-full bg-indigo-400/70" style={{ width: `${Math.min(vPct, 100)}%` }} />
                                    </div>
                                    <span className="text-xs font-medium text-gray-700 dark:text-zinc-300">{v.quantity}</span>
                                    <span className="text-micro text-gray-400 dark:text-zinc-600">un</span>
                                  </div>
                                </td>
                                <td className="px-4 py-2 text-right text-xs text-gray-500 dark:text-zinc-500">{fmt(v.revenue)}</td>
                                <td className="px-4 py-2 text-right text-mini text-indigo-400 dark:text-indigo-500">{vPct.toFixed(0)}%</td>
                              </tr>
                            )
                          })}
                        </>
                      )
                    })}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {/* ── Bottom row: Pagos + Envíos + Provincias ── */}
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">

            {/* Métodos de pago */}
            {tn?.payment_methods && Object.keys(tn.payment_methods).length > 0 && (
              <div className="bg-white dark:bg-zinc-900 rounded-xl border border-gray-200 dark:border-zinc-800 p-4 shadow-sm">
                <h2 className="text-sm font-semibold text-gray-700 dark:text-zinc-300 mb-4">Métodos de pago</h2>
                <HBarChart
                  items={Object.entries(tn.payment_methods as Record<string, number>).sort((a, b) => b[1] - a[1])}
                  total={tn.total_orders}
                  colorClass="bg-violet-500"
                  revenue={tn.payment_revenue as Record<string, number> | undefined}
                />
              </div>
            )}

            {/* Métodos de envío */}
            {shippingItems.length > 0 && (
              <div className="bg-white dark:bg-zinc-900 rounded-xl border border-gray-200 dark:border-zinc-800 p-4 shadow-sm">
                <h2 className="text-sm font-semibold text-gray-700 dark:text-zinc-300 mb-4">Métodos de envío</h2>
                <HBarChart items={shippingItems} total={tn.total_orders} colorClass="bg-sky-500" revenue={shippingRevenue} />
              </div>
            )}

            {/* Provincias — mapa coroplético */}
            {topProvinces.length > 0 && (
              <div className="bg-white dark:bg-zinc-900 rounded-xl border border-gray-200 dark:border-zinc-800 p-4 shadow-sm lg:col-span-1">
                <h2 className="text-sm font-semibold text-gray-700 dark:text-zinc-300 mb-4">Ventas por provincia</h2>
                <div className="flex gap-4 items-start">
                  {/* SVG map */}
                  <div className="w-[120px] shrink-0">
                    <ArgentinaMap
                      provinces={topProvinces}
                      totalOrders={tnOrders}
                    />
                  </div>
                  {/* Ranked list */}
                  <div className="flex-1 min-w-0 space-y-2">
                    {topProvinces.slice(0, 8).map((prov, i) => {
                      const pct = tnOrders > 0 ? (prov.count / tnOrders) * 100 : 0
                      return (
                        <div key={prov.name}>
                          <div className="flex items-center justify-between text-xs mb-0.5">
                            <span className="flex items-center gap-1.5 text-gray-600 dark:text-zinc-400 min-w-0">
                              <span className="text-micro text-gray-300 dark:text-zinc-600 w-3 shrink-0">{i + 1}</span>
                              <span className="truncate">{prov.name}</span>
                            </span>
                            <span className="font-medium text-violet-600 dark:text-violet-400 shrink-0 ml-2">{pct.toFixed(0)}%</span>
                          </div>
                          <div className="w-full bg-gray-100 dark:bg-zinc-800 rounded-full h-1">
                            <div className="h-1 rounded-full bg-violet-400" style={{ width: `${pct}%` }} />
                          </div>
                        </div>
                      )
                    })}
                  </div>
                </div>
              </div>
            )}
          </div>

          {/* ── Resumen numérico YTD ── */}
          {period !== 'ytd' && tnSnapshot?.summary_ytd && (
            <div className="bg-gray-50 dark:bg-zinc-800/40 rounded-xl border border-gray-200 dark:border-zinc-700 p-4">
              <p className="text-xs font-semibold text-gray-400 dark:text-zinc-500 uppercase tracking-wider mb-3">Acumulado este año (YTD)</p>
              <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
                <StatPill label="Ventas YTD"   value={fmt(tnSnapshot.summary_ytd.total_revenue)} />
                <StatPill label="Órdenes YTD"  value={fmt(tnSnapshot.summary_ytd.total_orders, 'number')} />
                <StatPill label="AOV promedio" value={fmt(tnSnapshot.summary_ytd.aov)} />
                <StatPill label="Clientes"     value={fmt(tnSnapshot.summary_ytd.unique_customers, 'number')} />
              </div>
            </div>
          )}
        </>
      )}
    </div>
  )
}

// ── Sub-components ─────────────────────────────────────────────

function KpiCard({ label, value, sub, color, tooltip, delta }: {
  label: string; value: string; sub: string; color: string; tooltip?: string; delta?: number | null
}) {
  const borderL: Record<string, string> = {
    indigo:  'border-l-indigo-400 dark:border-l-indigo-500',
    violet:  'border-l-violet-400 dark:border-l-violet-500',
    purple:  'border-l-purple-400 dark:border-l-purple-500',
    fuchsia: 'border-l-fuchsia-400 dark:border-l-fuchsia-500',
    blue:    'border-l-blue-400 dark:border-l-blue-500',
    sky:     'border-l-sky-400 dark:border-l-sky-500',
    cyan:    'border-l-cyan-400 dark:border-l-cyan-500',
    teal:    'border-l-teal-400 dark:border-l-teal-500',
    emerald: 'border-l-emerald-400 dark:border-l-emerald-500',
    amber:   'border-l-amber-400 dark:border-l-amber-500',
    slate:   'border-l-slate-300 dark:border-l-slate-600',
  }
  const bgGrad: Record<string, string> = {
    indigo:  'bg-gradient-to-br from-indigo-50/60 to-white dark:from-indigo-950/20 dark:to-zinc-900',
    violet:  'bg-gradient-to-br from-violet-50/60 to-white dark:from-violet-950/20 dark:to-zinc-900',
    purple:  'bg-gradient-to-br from-purple-50/60 to-white dark:from-purple-950/20 dark:to-zinc-900',
    fuchsia: 'bg-gradient-to-br from-fuchsia-50/60 to-white dark:from-fuchsia-950/20 dark:to-zinc-900',
    blue:    'bg-gradient-to-br from-blue-50/60 to-white dark:from-blue-950/20 dark:to-zinc-900',
    sky:     'bg-gradient-to-br from-sky-50/60 to-white dark:from-sky-950/20 dark:to-zinc-900',
    cyan:    'bg-gradient-to-br from-cyan-50/60 to-white dark:from-cyan-950/20 dark:to-zinc-900',
    teal:    'bg-gradient-to-br from-teal-50/60 to-white dark:from-teal-950/20 dark:to-zinc-900',
    emerald: 'bg-gradient-to-br from-emerald-50/60 to-white dark:from-emerald-950/20 dark:to-zinc-900',
    amber:   'bg-gradient-to-br from-amber-50/60 to-white dark:from-amber-950/20 dark:to-zinc-900',
    slate:   'bg-white dark:bg-zinc-900',
  }
  const valueColor: Record<string, string> = {
    indigo:  'text-indigo-600 dark:text-indigo-400',
    violet:  'text-violet-600 dark:text-violet-400',
    purple:  'text-purple-600 dark:text-purple-400',
    fuchsia: 'text-fuchsia-600 dark:text-fuchsia-400',
    blue:    'text-blue-600 dark:text-blue-400',
    sky:     'text-sky-600 dark:text-sky-400',
    cyan:    'text-cyan-600 dark:text-cyan-400',
    teal:    'text-teal-600 dark:text-teal-400',
    emerald: 'text-emerald-600 dark:text-emerald-400',
    amber:   'text-amber-600 dark:text-amber-400',
    slate:   'text-gray-700 dark:text-zinc-300',
  }
  const bl  = borderL[color]  ?? 'border-l-gray-200 dark:border-l-zinc-700'
  const bg  = bgGrad[color]   ?? 'bg-white dark:bg-zinc-900'
  const vc  = valueColor[color] ?? 'text-gray-900 dark:text-zinc-100'
  return (
    <div className={`rounded-xl border border-gray-100 dark:border-zinc-800 border-l-[3px] ${bl} ${bg} p-4 shadow-sm hover:shadow-md transition-shadow overflow-hidden`}>
      <div className="flex items-center gap-1 mb-1.5">
        <p className="text-mini font-semibold text-gray-400 dark:text-zinc-500 uppercase tracking-wider">{label}</p>
        {tooltip && <InfoTooltip text={tooltip} />}
      </div>
      <div className="flex items-end gap-2">
        <p className={`text-3xl font-bold tabular-nums leading-none ${vc}`}>{value}</p>
        {delta != null && (
          <span className={`text-xs font-semibold mb-0.5 ${delta >= 0 ? 'text-emerald-500 dark:text-emerald-400' : 'text-red-500 dark:text-red-400'}`}>
            {delta >= 0 ? '↑' : '↓'}{Math.abs(delta).toFixed(0)}%
          </span>
        )}
      </div>
      <p className="text-xs text-gray-400 dark:text-zinc-600 mt-2">{sub}</p>
    </div>
  )
}

function HBarChart({ items, total, colorClass, revenue }: {
  items: [string, number][]
  total: number
  colorClass: string
  revenue?: Record<string, number>
}) {
  const maxCount = Math.max(...items.map(([, c]) => c), 1)
  return (
    <div className="space-y-2.5">
      {items.map(([name, count]) => {
        const pct = total > 0 ? (count / total) * 100 : 0
        const barPct = (count / maxCount) * 100
        const rev = revenue?.[name]
        return (
          <div key={name}>
            <div className="flex items-center justify-between text-xs mb-1">
              <span className="text-gray-600 dark:text-zinc-400 capitalize truncate max-w-[60%]">{name.replace(/_/g, ' ')}</span>
              <span className="font-semibold text-gray-700 dark:text-zinc-300 shrink-0 ml-2">
                {count} <span className="font-normal text-gray-400 dark:text-zinc-600">({pct.toFixed(0)}%)</span>
                {rev != null && <span className="font-normal text-gray-400 dark:text-zinc-600 ml-1">· {rev >= 1_000_000 ? `$${(rev/1_000_000).toFixed(1)}M` : rev >= 1_000 ? `$${Math.round(rev/1000)}K` : `$${rev}`}</span>}
              </span>
            </div>
            <div className="w-full bg-gray-100 dark:bg-zinc-800 rounded-full h-2">
              <div className={`h-2 rounded-full ${colorClass} opacity-80`} style={{ width: `${barPct}%` }} />
            </div>
          </div>
        )
      })}
    </div>
  )
}

function StatPill({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <p className="text-xs text-gray-400 dark:text-zinc-500">{label}</p>
      <p className="text-lg font-semibold text-gray-800 dark:text-zinc-200">{value}</p>
    </div>
  )
}

function DowBarChart({ stats }: { stats: Record<string, number> }) {
  const ORDER = ['Lun', 'Mar', 'Mié', 'Jue', 'Vie', 'Sáb', 'Dom']
  const values = ORDER.map(d => stats[d] ?? 0)
  const maxVal = Math.max(...values, 1)
  const total  = values.reduce((s, v) => s + v, 0)

  // Determine best/worst day
  const bestIdx  = values.indexOf(Math.max(...values))
  const worstIdx = values.indexOf(Math.min(...values.filter(v => v > 0)))

  return (
    <div>
      <div className="flex items-end gap-2 h-28">
        {ORDER.map((label, i) => {
          const val  = values[i]
          const pct  = (val / maxVal) * 100
          const isBest  = i === bestIdx && val > 0
          const isWorst = i === worstIdx && val > 0 && val !== values[bestIdx]
          return (
            <div key={label} className="flex-1 flex flex-col items-center gap-1">
              <span className="text-micro text-gray-400 dark:text-zinc-600 tabular-nums">
                {val > 0 ? (val >= 1_000_000 ? `$${(val/1_000_000).toFixed(1)}M` : val >= 1_000 ? `$${Math.round(val/1000)}K` : `$${val}`) : ''}
              </span>
              <div className="w-full relative flex items-end" style={{ height: '72px' }}>
                <div
                  className={`w-full rounded-t-md transition-all duration-500 ${
                    isBest  ? 'bg-emerald-400 dark:bg-emerald-500' :
                    isWorst ? 'bg-red-300 dark:bg-red-600/60' :
                              'bg-indigo-300 dark:bg-indigo-600/70'
                  }`}
                  style={{ height: `${Math.max(pct, val > 0 ? 4 : 0)}%` }}
                />
              </div>
              <span className={`text-micro font-medium ${
                isBest  ? 'text-emerald-600 dark:text-emerald-400' :
                isWorst ? 'text-red-500 dark:text-red-400' :
                          'text-gray-500 dark:text-zinc-500'
              }`}>{label}</span>
            </div>
          )
        })}
      </div>
      {total > 0 && (
        <div className="flex gap-4 mt-3 text-xs text-gray-400 dark:text-zinc-500 border-t border-gray-100 dark:border-zinc-800 pt-3">
          <span>
            <span className="text-emerald-600 dark:text-emerald-400 font-semibold">{ORDER[bestIdx]}</span>
            {' '}es el mejor día
          </span>
          <span className="text-gray-300 dark:text-zinc-700">·</span>
          <span>Promedio diario: {(() => { const avg = total / 7; return avg >= 1_000_000 ? `$${(avg/1_000_000).toFixed(1)}M` : avg >= 1_000 ? `$${Math.round(avg/1000)}K` : `$${Math.round(avg)}` })()} </span>
        </div>
      )}
    </div>
  )
}
