'use client'

import { useState, useCallback } from 'react'
import { useRouter } from 'next/navigation'
import type { TNSnapshot, Snapshot } from '@/lib/supabase'
import { InfoTooltip } from '@/components/ui/InfoTooltip'

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
  const [syncing, setSyncing] = useState(false)
  const [syncMsg, setSyncMsg] = useState<string | null>(null)
  const router = useRouter()

  const triggerSync = useCallback(async () => {
    setSyncing(true)
    setSyncMsg(null)
    try {
      const res = await fetch('/api/sync-tiendanube', { method: 'POST' })
      const data = await res.json()
      if (data.error) throw new Error(data.error)
      setSyncMsg(`✓ Sync OK — hoy: ${data.orders_today} órdenes · 7d: ${data.orders_7d} órdenes`)
      router.refresh()
    } catch (e) {
      setSyncMsg(`✗ ${e instanceof Error ? e.message : 'Error'}`)
    } finally {
      setSyncing(false)
    }
  }, [router])

  const tn   = getSummary(tnSnapshot, period)
  const meta = getMetaSummary(metaSnapshot, period)

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
  const periodDays: Record<Period, number> = { today: 1, yesterday: 1, '7d': 7, '30d': 30, ytd: new Date().getDate() + new Date().getMonth() * 30 }
  const days = periodDays[period]
  const revenuePerDay = tnRevenue > 0 ? tnRevenue / days : 0
  const ordersPerDay  = tnOrders  > 0 ? tnOrders  / days : 0

  const hasData = tn != null
  const hasMetaData = meta != null && metaSpend > 0

  return (
    <div className="max-w-6xl mx-auto space-y-6">

      {/* Header */}
      <div className="flex items-start justify-between gap-4 flex-wrap">
        <div>
          <h1 className="text-xl font-semibold text-gray-900 dark:text-zinc-100">Datos Tiendanube</h1>
          <p className="text-sm mt-0.5">
            {syncMsg
              ? <span className={syncMsg.startsWith('✓') ? 'text-emerald-600 dark:text-emerald-400' : 'text-red-500'}>{syncMsg}</span>
              : <span className="text-gray-500 dark:text-zinc-500">
                  {tnSnapshot ? `Última actualización: ${tnSnapshot.snapshot_date}` : 'Sin datos — hacé sync'}
                </span>
            }
          </p>
        </div>

        <div className="flex items-center gap-2">
          {/* Sync button */}
          <button
            onClick={triggerSync}
            disabled={syncing}
            className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium border border-gray-200 dark:border-zinc-700 rounded-lg text-gray-600 dark:text-zinc-400 hover:bg-gray-100 dark:hover:bg-zinc-800 disabled:opacity-50 transition-all"
            title="Sincronizar datos de Tiendanube"
          >
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"
              className={`w-3.5 h-3.5 ${syncing ? 'animate-spin' : ''}`}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M3 16.5v2.25A2.25 2.25 0 005.25 21h13.5A2.25 2.25 0 0021 18.75V16.5M16.5 12L12 16.5m0 0L7.5 12m4.5 4.5V3"/>
            </svg>
            {syncing ? 'Sincronizando…' : 'Actualizar'}
          </button>

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
                tooltip="Total facturado en Tiendanube en el período. Incluye todas las fuentes de tráfico, no solo Meta Ads." />
              <KpiCard label="Órdenes"           value={fmt(tnOrders, 'number')} sub={`${ordersPerDay.toFixed(1)}/día`} color="violet"
                tooltip="Cantidad de órdenes pagadas en el período. Es la base para calcular el ticket promedio y la conversión." />
              <KpiCard label="Ticket promedio"   value={fmt(tn?.aov)}            sub="por orden"                    color="purple"
                tooltip="Valor promedio por orden (AOV). Calculado como ventas totales ÷ cantidad de órdenes. Subir el AOV mejora el ROAS sin aumentar el gasto." />
              <KpiCard label="Clientes únicos"   value={fmt(tn?.unique_customers, 'number')} sub="en el período"   color="fuchsia"
                tooltip="Clientes con al menos una compra en el período. Un cliente que compra dos veces cuenta una sola vez." />
              <KpiCard label="Unidades vendidas" value={fmt(tn?.total_units_sold, 'number')} sub="artículos"       color="purple"
                tooltip="Total de artículos vendidos sumando las cantidades de todos los productos de las órdenes pagadas." />
            </div>
          </div>

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

          {/* ── Attribution Analysis ── */}
          {hasMetaData && (
            <div className="bg-white dark:bg-zinc-900 rounded-xl border border-gray-200 dark:border-zinc-800 p-5 shadow-sm">
              <h2 className="text-sm font-semibold text-gray-700 dark:text-zinc-300 mb-5">
                Análisis de atribución — Orgánico vs. Meta
              </h2>

              <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">

                {/* Revenue breakdown */}
                <div className="space-y-4">
                  <p className="text-xs text-gray-500 dark:text-zinc-500 font-medium uppercase tracking-wide">Ventas por origen</p>

                  {/* Bar visual */}
                  <div className="space-y-2">
                    <div className="flex justify-between text-xs text-gray-600 dark:text-zinc-400">
                      <span className="flex items-center gap-1.5">
                        <span className="w-2.5 h-2.5 rounded-sm bg-indigo-500 inline-block" />
                        Meta Ads
                      </span>
                      <span className="font-semibold">{fmt(metaAttributedRevenue)} · {metaPct.toFixed(0)}%</span>
                    </div>
                    <div className="w-full bg-gray-100 dark:bg-zinc-800 rounded-full h-3">
                      <div
                        className="h-3 rounded-full bg-indigo-500 transition-all duration-500"
                        style={{ width: `${Math.min(metaPct, 100)}%` }}
                      />
                    </div>

                    <div className="flex justify-between text-xs text-gray-600 dark:text-zinc-400 mt-3">
                      <span className="flex items-center gap-1.5">
                        <span className="w-2.5 h-2.5 rounded-sm bg-emerald-500 inline-block" />
                        Orgánico
                      </span>
                      <span className="font-semibold">{fmt(organicRevenue)} · {organicPct.toFixed(0)}%</span>
                    </div>
                    <div className="w-full bg-gray-100 dark:bg-zinc-800 rounded-full h-3">
                      <div
                        className="h-3 rounded-full bg-emerald-500 transition-all duration-500"
                        style={{ width: `${Math.min(organicPct, 100)}%` }}
                      />
                    </div>
                  </div>

                  {/* Orders breakdown */}
                  <div className="pt-3 border-t border-gray-100 dark:border-zinc-800 grid grid-cols-2 gap-3">
                    <div className="text-center">
                      <p className="text-xs text-gray-400 dark:text-zinc-500">Órdenes Meta</p>
                      <p className="text-xl font-semibold text-indigo-600 dark:text-indigo-400">{metaPurchases}</p>
                      <p className="text-xs text-gray-400 dark:text-zinc-500">{tnOrders > 0 ? ((metaPurchases / tnOrders) * 100).toFixed(0) : 0}% del total</p>
                    </div>
                    <div className="text-center">
                      <p className="text-xs text-gray-400 dark:text-zinc-500">Órdenes orgánicas</p>
                      <p className="text-xl font-semibold text-emerald-600 dark:text-emerald-400">{organicOrders}</p>
                      <p className="text-xs text-gray-400 dark:text-zinc-500">{tnOrders > 0 ? ((organicOrders / tnOrders) * 100).toFixed(0) : 0}% del total</p>
                    </div>
                  </div>
                </div>

                {/* ROAS & efficiency */}
                <div className="space-y-3">
                  <p className="text-xs text-gray-500 dark:text-zinc-500 font-medium uppercase tracking-wide">Eficiencia real de Meta</p>

                  <div className="space-y-3">
                    <MetricRow
                      label="ROAS real (ventas TN / gasto Meta)"
                      value={trueRoas ? `${trueRoas.toFixed(2)}x` : '—'}
                      note="Total vendido en TN dividido gasto en Meta — incluye ventas orgánicas"
                      highlight={trueRoas != null && trueRoas >= 5 ? 'green' : trueRoas != null && trueRoas >= 3 ? 'yellow' : 'red'}
                    />
                    <MetricRow
                      label="ROAS reportado por Meta"
                      value={reportedRoas ? `${reportedRoas.toFixed(2)}x` : '—'}
                      note="Según atribución del pixel de Meta"
                      highlight="neutral"
                    />
                    {trueRoas != null && reportedRoas != null && (
                      <MetricRow
                        label="Diferencia de atribución"
                        value={`${((reportedRoas - trueRoas) / trueRoas * 100).toFixed(0)}%`}
                        note={reportedRoas > trueRoas
                          ? 'Meta sobre-reporta vs ventas reales'
                          : 'Meta sub-reporta vs ventas reales'}
                        highlight={reportedRoas > trueRoas ? 'yellow' : 'green'}
                      />
                    )}
                    <MetricRow
                      label="Revenue por $ invertido en Meta"
                      value={trueRoas ? `$${trueRoas.toFixed(2)}` : '—'}
                      note="Por cada peso invertido en Meta, ingresó este monto total"
                      highlight="neutral"
                    />
                    <MetricRow
                      label="CPA real (TN)"
                      value={tnOrders > 0 && metaSpend > 0 ? fmt(metaSpend / tnOrders) : '—'}
                      note="Gasto Meta / total órdenes TN (incluyendo orgánicas)"
                      highlight="neutral"
                    />
                  </div>

                  <div className="mt-4 p-3 bg-amber-50 dark:bg-amber-950/30 border border-amber-200 dark:border-amber-800/50 rounded-lg">
                    <p className="text-xs text-amber-700 dark:text-amber-400 font-medium">💡 Interpretación</p>
                    <p className="text-xs text-amber-600 dark:text-amber-500 mt-1">
                      {trueRoas != null && reportedRoas != null && reportedRoas > trueRoas
                        ? `Meta atribuye más ventas de las que aparecen en Tiendanube. Esto es común por la ventana de atribución de 7 días de Meta. El ROAS real del negocio es ${trueRoas.toFixed(2)}x.`
                        : `Los datos de Meta y Tiendanube están alineados. El ${organicPct.toFixed(0)}% de las ventas es orgánico, lo que indica buen desempeño del canal directo.`
                      }
                    </p>
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* ── Top Productos ── */}
          {tn?.top_products?.length > 0 && (
            <div className="bg-white dark:bg-zinc-900 rounded-xl border border-gray-200 dark:border-zinc-800 shadow-sm overflow-hidden">
              <div className="p-4 border-b border-gray-100 dark:border-zinc-800">
                <h2 className="text-sm font-semibold text-gray-700 dark:text-zinc-300">Top productos · {PERIOD_LABELS[period]}</h2>
              </div>
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="text-xs text-gray-400 dark:text-zinc-500 bg-gray-50 dark:bg-zinc-800/50">
                      <th className="text-left px-4 py-2.5 font-medium">#</th>
                      <th className="text-left px-4 py-2.5 font-medium">Producto</th>
                      <th className="text-right px-4 py-2.5 font-medium">Unidades</th>
                      <th className="text-right px-4 py-2.5 font-medium">Ventas</th>
                      <th className="text-right px-4 py-2.5 font-medium">% del total</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-100 dark:divide-zinc-800">
                    {tn.top_products.map((p: { name: string; quantity: number; revenue: number }, i: number) => {
                      const topTotal = tn.top_products.reduce((s: number, x: { revenue: number }) => s + x.revenue, 0)
                      const pct = topTotal > 0 ? (p.revenue / topTotal) * 100 : 0
                      return (
                        <tr key={i} className="hover:bg-gray-50 dark:hover:bg-zinc-800/30 transition-colors">
                          <td className="px-4 py-2.5 text-gray-400 dark:text-zinc-600 font-medium">{i + 1}</td>
                          <td className="px-4 py-2.5 text-gray-700 dark:text-zinc-300 max-w-xs truncate">{p.name}</td>
                          <td className="px-4 py-2.5 text-right text-gray-600 dark:text-zinc-400">{p.quantity}</td>
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
                <div className="space-y-2.5">
                  {Object.entries(tn.payment_methods as Record<string, number>)
                    .sort((a, b) => b[1] - a[1])
                    .map(([method, count]) => {
                      const pct = tn.total_orders > 0 ? (count / tn.total_orders) * 100 : 0
                      return (
                        <div key={method}>
                          <div className="flex justify-between text-xs text-gray-600 dark:text-zinc-400 mb-1">
                            <span className="capitalize">{method.replace(/_/g, ' ')}</span>
                            <span className="font-medium">{count} · {pct.toFixed(0)}%</span>
                          </div>
                          <div className="w-full bg-gray-100 dark:bg-zinc-800 rounded-full h-1.5">
                            <div className="h-1.5 rounded-full bg-violet-400" style={{ width: `${pct}%` }} />
                          </div>
                        </div>
                      )
                    })}
                </div>
              </div>
            )}

            {/* Métodos de envío */}
            {tn?.shipping_methods && Object.keys(tn.shipping_methods).length > 0 && (
              <div className="bg-white dark:bg-zinc-900 rounded-xl border border-gray-200 dark:border-zinc-800 p-4 shadow-sm">
                <h2 className="text-sm font-semibold text-gray-700 dark:text-zinc-300 mb-4">Métodos de envío</h2>
                <div className="space-y-2.5">
                  {Object.entries(tn.shipping_methods as Record<string, number>)
                    .sort((a, b) => b[1] - a[1])
                    .map(([method, count]) => {
                      const pct = tn.total_orders > 0 ? (count / tn.total_orders) * 100 : 0
                      return (
                        <div key={method}>
                          <div className="flex justify-between text-xs text-gray-600 dark:text-zinc-400 mb-1">
                            <span className="capitalize">{method.replace(/_/g, ' ')}</span>
                            <span className="font-medium">{count} · {pct.toFixed(0)}%</span>
                          </div>
                          <div className="w-full bg-gray-100 dark:bg-zinc-800 rounded-full h-1.5">
                            <div className="h-1.5 rounded-full bg-sky-400" style={{ width: `${pct}%` }} />
                          </div>
                        </div>
                      )
                    })}
                </div>
              </div>
            )}

            {/* Provincias */}
            {tn?.top_provinces && tn.top_provinces.length > 0 && (
              <div className="bg-white dark:bg-zinc-900 rounded-xl border border-gray-200 dark:border-zinc-800 p-4 shadow-sm">
                <h2 className="text-sm font-semibold text-gray-700 dark:text-zinc-300 mb-4">Top provincias</h2>
                <div className="space-y-2.5">
                  {tn.top_provinces.map((prov: { name: string; count: number }) => {
                    const pct = tn.total_orders > 0 ? (prov.count / tn.total_orders) * 100 : 0
                    return (
                      <div key={prov.name}>
                        <div className="flex justify-between text-xs text-gray-600 dark:text-zinc-400 mb-1">
                          <span>{prov.name}</span>
                          <span className="font-medium">{prov.count} · {pct.toFixed(0)}%</span>
                        </div>
                        <div className="w-full bg-gray-100 dark:bg-zinc-800 rounded-full h-1.5">
                          <div className="h-1.5 rounded-full bg-fuchsia-400" style={{ width: `${pct}%` }} />
                        </div>
                      </div>
                    )
                  })}
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

function KpiCard({ label, value, sub, color, tooltip }: {
  label: string; value: string; sub: string; color: string; tooltip?: string
}) {
  const colors: Record<string, string> = {
    indigo:  'bg-indigo-50 dark:bg-indigo-950/30 text-indigo-600 dark:text-indigo-400',
    violet:  'bg-violet-50 dark:bg-violet-950/30 text-violet-600 dark:text-violet-400',
    purple:  'bg-purple-50 dark:bg-purple-950/30 text-purple-600 dark:text-purple-400',
    fuchsia: 'bg-fuchsia-50 dark:bg-fuchsia-950/30 text-fuchsia-600 dark:text-fuchsia-400',
    blue:    'bg-blue-50 dark:bg-blue-950/30 text-blue-600 dark:text-blue-400',
    sky:     'bg-sky-50 dark:bg-sky-950/30 text-sky-600 dark:text-sky-400',
    cyan:    'bg-cyan-50 dark:bg-cyan-950/30 text-cyan-600 dark:text-cyan-400',
    teal:    'bg-teal-50 dark:bg-teal-950/30 text-teal-600 dark:text-teal-400',
  }
  return (
    <div className="bg-white dark:bg-zinc-900 rounded-xl border border-gray-200 dark:border-zinc-800 p-4 shadow-sm">
      <div className="flex items-center gap-1 mb-1">
        <p className="text-xs text-gray-400 dark:text-zinc-500 font-medium">{label}</p>
        {tooltip && <InfoTooltip text={tooltip} />}
      </div>
      <p className={`text-2xl font-semibold ${colors[color] ?? 'text-gray-900 dark:text-zinc-100'}`}>{value}</p>
      <p className="text-xs text-gray-400 dark:text-zinc-500 mt-1">{sub}</p>
    </div>
  )
}

function MetricRow({ label, value, note, highlight }: {
  label: string; value: string; note: string; highlight: 'green' | 'yellow' | 'red' | 'neutral'
}) {
  const colors = {
    green:   'text-emerald-600 dark:text-emerald-400',
    yellow:  'text-amber-600 dark:text-amber-400',
    red:     'text-red-600 dark:text-red-400',
    neutral: 'text-gray-800 dark:text-zinc-200',
  }
  return (
    <div className="flex items-start justify-between gap-4 py-2 border-b border-gray-100 dark:border-zinc-800 last:border-0">
      <div>
        <p className="text-xs text-gray-600 dark:text-zinc-400">{label}</p>
        <p className="text-xs text-gray-400 dark:text-zinc-600 mt-0.5">{note}</p>
      </div>
      <p className={`text-base font-semibold shrink-0 ${colors[highlight]}`}>{value}</p>
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
