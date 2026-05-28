'use client'

import { useState, useRef } from 'react'
import type { TNSnapshot, Snapshot } from '@/lib/supabase'

type Period = 'today' | '7d' | '30d' | 'ytd'
const PERIOD_LABELS: Record<Period, string> = {
  today: 'Hoy',
  '7d':  'Ultimos 7 dias',
  '30d': 'Ultimos 30 dias',
  'ytd': 'Este ano',
}

interface Settings {
  tn_commission_pct: number
  shipping_pct:      number
}

interface Props {
  tnSnapshot:   TNSnapshot | null
  metaSnapshot: Snapshot | null
  settings:     Settings
}

function fmt(n: number | null | undefined): string {
  if (n == null) return '—'
  return '$' + Math.round(n).toLocaleString('es-AR')
}

function fmtPct(n: number | null | undefined): string {
  if (n == null) return '—'
  return n.toFixed(1) + '%'
}

interface PnLRow {
  label:      string
  value:      number | null
  pct?:       number | null
  isPositive?: boolean
  isNegative?: boolean
  isTotal?:   boolean
  indent?:    boolean
  note?:      string
}

export default function BalanceClient({ tnSnapshot, metaSnapshot, settings }: Props) {
  const [period, setPeriod]         = useState<Period>('30d')
  const [manualShipping, setManual] = useState<string>('')
  const printRef = useRef<HTMLDivElement>(null)

  const tnData = period === 'today' ? tnSnapshot?.summary_today
    : period === '7d'  ? tnSnapshot?.summary_7d
    : period === '30d' ? tnSnapshot?.summary_30d
    : tnSnapshot?.summary_ytd

  // Meta spend for the selected period
  const periodMetaSpend = period === '7d'   ? (metaSnapshot?.summary?.total_spend_7d ?? null)
    : period === 'today'  ? (metaSnapshot?.periods?.today?.summary?.total_spend_7d ?? null)
    : period === '30d'    ? (metaSnapshot?.periods?.last_30d?.summary?.total_spend_7d ?? null)
    : null  // ytd not available from Meta snapshots

  const ventas = tnData?.total_revenue ?? null

  // Shipping: use actual TN shipping_revenue if available, else settings % estimate
  const shippingActual    = tnData?.shipping_revenue ?? null
  const shippingEstimated = ventas != null ? Math.round(ventas * (settings.shipping_pct / 100)) : null
  const useManual = manualShipping !== ''
  const shippingValue = useManual
    ? (parseFloat(manualShipping.replace(/\./g, '').replace(',', '.')) || 0)
    : (shippingActual ?? shippingEstimated)

  const comisionTN = ventas != null ? Math.round(ventas * (settings.tn_commission_pct / 100)) : null

  const resultadoBruto =
    ventas != null && periodMetaSpend != null && shippingValue != null && comisionTN != null
      ? ventas - periodMetaSpend - shippingValue - comisionTN
      : null

  const margen = ventas && ventas > 0 && resultadoBruto != null
    ? (resultadoBruto / ventas) * 100
    : null

  const rows: PnLRow[] = [
    {
      label: 'Ventas brutas (Tiendanube)',
      value: ventas,
      isPositive: true,
      note: tnData ? tnData.total_orders + ' ordenes · AOV ' + fmt(tnData.aov) : undefined,
    },
    {
      label: 'Gasto Meta Ads',
      value: periodMetaSpend != null ? -periodMetaSpend : null,
      pct: ventas && periodMetaSpend ? (-periodMetaSpend / ventas) * 100 : null,
      isNegative: true,
      indent: true,
      note: period !== '7d' && period !== '30d' ? 'Solo disponible para 7d/30d' : undefined,
    },
    {
      label: 'Gastos de envio',
      value: shippingValue != null ? -shippingValue : null,
      pct: ventas && shippingValue ? (-shippingValue / ventas) * 100 : null,
      isNegative: true,
      indent: true,
      note: shippingActual != null ? 'Dato real de Tiendanube' : 'Estimado (' + settings.shipping_pct + '% ventas)',
    },
    {
      label: 'Comision Tiendanube (' + settings.tn_commission_pct + '%)',
      value: comisionTN != null ? -comisionTN : null,
      pct: ventas && comisionTN ? (-comisionTN / ventas) * 100 : null,
      isNegative: true,
      indent: true,
    },
    {
      label: 'Resultado Bruto',
      value: resultadoBruto,
      pct: null,  // rendered via the isTotal colored span to avoid duplication
      isPositive: resultadoBruto != null && resultadoBruto >= 0,
      isNegative: resultadoBruto != null && resultadoBruto < 0,
      isTotal: true,
      note: 'Sin incluir CMV ni costos operativos',
    },
  ]

  function handlePrint() {
    window.print()
  }

  async function handleExcelDownload() {
    const lines: string[] = [
      'Balance Forever Basics — ' + PERIOD_LABELS[period],
      'Fecha,' + new Date().toLocaleDateString('es-AR'),
      '',
      'Concepto,Importe (ARS),% Ventas',
    ]
    rows.forEach(r => {
      const val = r.value != null ? Math.round(r.value).toString() : ''
      const pct = r.pct != null ? r.pct.toFixed(1) + '%' : ''
      lines.push('"' + r.label + '",' + val + ',' + pct)
    })
    lines.push('')
    lines.push('"Notas:","CMV y costos operativos no incluidos",')

    const blob = new Blob(['\uFEFF' + lines.join('\r\n')], { type: 'text/csv;charset=utf-8;' })
    const url  = URL.createObjectURL(blob)
    const a    = document.createElement('a')
    a.href     = url
    a.download = 'balance_forever_' + period + '_' + new Date().toISOString().split('T')[0] + '.csv'
    a.click()
    URL.revokeObjectURL(url)
  }

  return (
    <div className="max-w-3xl mx-auto space-y-6">
      {/* Header */}
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-xl font-semibold text-gray-900 dark:text-zinc-100">Balance</h1>
          <p className="text-sm text-gray-500 dark:text-zinc-500 mt-0.5">Resultado del negocio por periodo</p>
        </div>
        <div className="flex items-center gap-2 shrink-0">
          <button onClick={handlePrint}
            className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium border border-gray-200 dark:border-zinc-700 rounded-lg text-gray-600 dark:text-zinc-400 hover:bg-gray-100 dark:hover:bg-zinc-800 transition-all">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="w-3.5 h-3.5">
              <polyline points="6 9 6 2 18 2 18 9"/><path d="M6 18H4a2 2 0 01-2-2v-5a2 2 0 012-2h16a2 2 0 012 2v5a2 2 0 01-2 2h-2"/><rect x="6" y="14" width="12" height="8"/>
            </svg>
            PDF
          </button>
          <button onClick={handleExcelDownload}
            className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium border border-gray-200 dark:border-zinc-700 rounded-lg text-gray-600 dark:text-zinc-400 hover:bg-gray-100 dark:hover:bg-zinc-800 transition-all">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="w-3.5 h-3.5">
              <path d="M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8z"/><polyline points="14 2 14 8 20 8"/><line x1="16" y1="13" x2="8" y2="13"/><line x1="16" y1="17" x2="8" y2="17"/><polyline points="10 9 9 9 8 9"/>
            </svg>
            Excel
          </button>
        </div>
      </div>

      {/* Period selector */}
      <div className="flex bg-gray-100 dark:bg-zinc-800 rounded-lg p-0.5 gap-0.5 w-fit">
        {(Object.keys(PERIOD_LABELS) as Period[]).map(p => (
          <button key={p} onClick={() => setPeriod(p)}
            className={'px-3 py-1.5 text-xs font-medium rounded-md transition-all ' + (
              period === p
                ? 'bg-white dark:bg-zinc-700 text-gray-900 dark:text-zinc-100 shadow-sm'
                : 'text-gray-500 dark:text-zinc-400 hover:text-gray-700 dark:hover:text-zinc-200'
            )}>
            {PERIOD_LABELS[p]}
          </button>
        ))}
      </div>

      {/* P&L table */}
      <div ref={printRef} className="bg-white dark:bg-zinc-900 rounded-xl border border-gray-200 dark:border-zinc-800 overflow-hidden shadow-sm print:shadow-none print:border-0">
        <div className="px-5 py-3 border-b border-gray-100 dark:border-zinc-800 flex items-center justify-between">
          <div>
            <p className="text-sm font-semibold text-gray-800 dark:text-zinc-200">Estado de Resultados</p>
            <p className="text-xs text-gray-400 dark:text-zinc-500">{PERIOD_LABELS[period]} · {tnSnapshot?.snapshot_date ?? '—'}</p>
          </div>
          <p className="text-xs text-gray-400 dark:text-zinc-500">Forever Basics</p>
        </div>

        <table className="w-full text-sm">
          <thead>
            <tr className="text-xs text-gray-400 dark:text-zinc-500 bg-gray-50 dark:bg-zinc-800/50 border-b border-gray-100 dark:border-zinc-800">
              <th className="text-left px-5 py-2.5 font-medium">Concepto</th>
              <th className="text-right px-5 py-2.5 font-medium">Importe</th>
              <th className="text-right px-5 py-2.5 font-medium">% Ventas</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((row, i) => (
              <tr key={i} className={'border-b border-gray-50 dark:border-zinc-800/60 ' + (
                row.isTotal ? 'bg-gray-50 dark:bg-zinc-800/30' : 'hover:bg-gray-50/50 dark:hover:bg-zinc-800/20'
              )}>
                <td className={'px-5 py-3 ' + (row.indent ? 'pl-8' : '')}>
                  <p className={(row.isTotal ? 'font-semibold text-gray-900 dark:text-zinc-100' : 'text-gray-700 dark:text-zinc-300') + ' text-sm'}>
                    {row.label}
                  </p>
                  {row.note && <p className="text-[11px] text-gray-400 dark:text-zinc-600 mt-0.5">{row.note}</p>}
                </td>
                <td className={'px-5 py-3 text-right font-medium ' + (
                  row.isTotal
                    ? row.isPositive ? 'text-emerald-600 dark:text-emerald-400 text-base' : 'text-red-600 dark:text-red-400 text-base'
                    : row.isPositive ? 'text-emerald-600 dark:text-emerald-400'
                    : row.isNegative ? 'text-red-600 dark:text-red-400'
                    : 'text-gray-700 dark:text-zinc-300'
                )}>
                  {row.value != null ? fmt(row.value) : <span className="text-gray-400 font-normal">—</span>}
                </td>
                <td className="px-5 py-3 text-right text-xs text-gray-400 dark:text-zinc-500">
                  {!row.isTotal && row.pct != null ? fmtPct(row.pct) : ''}
                  {row.isTotal && margen != null ? (
                    <span className={'font-semibold ' + (margen >= 0 ? 'text-emerald-600 dark:text-emerald-400' : 'text-red-500')}>
                      {fmtPct(margen)}
                    </span>
                  ) : null}
                </td>
              </tr>
            ))}
          </tbody>
        </table>

        {/* Footer note */}
        <div className="px-5 py-3 bg-gray-50 dark:bg-zinc-800/30 border-t border-gray-100 dark:border-zinc-800">
          <p className="text-[11px] text-gray-400 dark:text-zinc-600">
            No incluye costo de mercaderia (CMV), sueldos ni costos operativos. El resultado bruto es antes de esos gastos.
          </p>
        </div>
      </div>

      {/* Manual shipping override */}
      <div className="bg-white dark:bg-zinc-900 rounded-xl border border-gray-200 dark:border-zinc-800 p-4 shadow-sm">
        <h3 className="text-sm font-medium text-gray-700 dark:text-zinc-300 mb-3">Ajustar costo de envios</h3>
        <div className="flex items-center gap-3">
          <div className="flex-1">
            <p className="text-xs text-gray-400 dark:text-zinc-500 mb-1">
              {shippingActual != null
                ? 'Tiendanube reporta ' + fmt(shippingActual) + ' cobrado por envios. Ajusta si el costo real es diferente.'
                : 'Sin datos de TN. Estimado en ' + settings.shipping_pct + '% de ventas = ' + fmt(shippingEstimated)
              }
            </p>
            <div className="flex items-center gap-2">
              <span className="text-sm text-gray-400">$</span>
              <input
                type="text"
                placeholder={shippingActual != null ? String(shippingActual) : String(shippingEstimated ?? '')}
                value={manualShipping}
                onChange={e => setManual(e.target.value)}
                className="w-36 text-sm bg-gray-50 dark:bg-zinc-800 border border-gray-200 dark:border-zinc-700 rounded-lg px-3 py-1.5 text-gray-900 dark:text-zinc-100 focus:outline-none focus:ring-2 focus:ring-gray-400"
              />
              {manualShipping && (
                <button onClick={() => setManual('')} className="text-xs text-gray-400 hover:text-gray-600">Limpiar</button>
              )}
            </div>
          </div>
          <div className="text-right">
            <a href="/settings" className="text-xs text-indigo-600 dark:text-indigo-400 hover:underline">
              Ajustar % en configuracion
            </a>
          </div>
        </div>
      </div>

      <style>{`
        @media print {
          body * { visibility: hidden; }
          .print-area, .print-area * { visibility: visible; }
          nav, header, footer, button { display: none !important; }
        }
      `}</style>
    </div>
  )
}
