'use client'

import { useState, useMemo, useCallback } from 'react'
import type { TNSnapshot, Snapshot } from '@/lib/supabase'

// ─── Estructura de costos (mirrors DashboardClient.tsx) ───────────────────────
const UNIT_COST         = 6500    // ARS por unidad
const UNITS_PER_ORDER   = 3       // unidades promedio por orden
const SHIPPING_PCT      = 0.10    // 10% del ticket
const PLATFORM_PCT      = 0.025   // 2.5% comisión TN
const PACKAGING_PER_ORD = 350     // ARS por orden
const AOV_DEFAULT       = 57500   // ticket promedio estimado

// ─── Constantes de UI ─────────────────────────────────────────────────────────
const MONTH_SHORT = ['Ene','Feb','Mar','Abr','May','Jun','Jul','Ago','Sep','Oct','Nov','Dic']
const MONTH_FULL  = ['Enero','Febrero','Marzo','Abril','Mayo','Junio','Julio','Agosto','Septiembre','Octubre','Noviembre','Diciembre']

const EXPENSE_CATS = [
  { value: 'mercaderia',   label: 'Compra mercadería',        color: 'bg-blue-100 dark:bg-blue-950/60 text-blue-700 dark:text-blue-400' },
  { value: 'packaging',    label: 'Packaging / insumos',      color: 'bg-violet-100 dark:bg-violet-950/60 text-violet-700 dark:text-violet-400' },
  { value: 'distribucion', label: 'Distribución ganancias',   color: 'bg-emerald-100 dark:bg-emerald-950/60 text-emerald-700 dark:text-emerald-400' },
  { value: 'logistica',    label: 'Logística / operativa',    color: 'bg-amber-100 dark:bg-amber-950/60 text-amber-700 dark:text-amber-400' },
  { value: 'fijo',         label: 'Gasto fijo',               color: 'bg-gray-100 dark:bg-zinc-800 text-gray-700 dark:text-zinc-400' },
  { value: 'otro',         label: 'Otro',                     color: 'bg-gray-100 dark:bg-zinc-700 text-gray-500 dark:text-zinc-500' },
]

// ─── Types ────────────────────────────────────────────────────────────────────
interface MonthlySummary {
  month:      string
  meta_spend: number | null
  tn_revenue: number | null
  tn_orders:  number | null
  tn_units:   number | null
  notes:      string | null
  updated_at: string
}

interface Expense {
  id:          string
  month:       string
  category:    string
  description: string
  amount_ars:  number
  created_at:  string
}

interface MonthData {
  meta_spend: number
  tn_revenue: number
  tn_orders:  number
  tn_units:   number
  source:     'live' | 'saved' | 'empty'
}

interface PnL {
  tn_revenue:   number
  merch:        number
  shipping:     number
  platform:     number
  packaging:    number
  cogs:         number
  gross_profit: number
  meta_spend:   number
  ad_result:    number
  var_total:    number
  net_result:   number
  margin_gross: number
  margin_net:   number
  tn_orders:    number
  tn_units:     number
  aov:          number
}

interface Props {
  tnSnapshot:        TNSnapshot | null
  metaSnapshot:      Snapshot | null
  initialExpenses:   Expense[]
  initialSummaries:  MonthlySummary[]
}

// ─── Helpers ──────────────────────────────────────────────────────────────────
function fmt(n: number | null | undefined, opts?: { sign?: boolean }): string {
  if (n == null || isNaN(n)) return '—'
  const abs = Math.abs(Math.round(n))
  const sign = opts?.sign && n > 0 ? '+' : n < 0 ? '−' : ''
  return sign + '$' + abs.toLocaleString('es-AR')
}
function pct(n: number) { return (n * 100).toFixed(1) + '%' }
function mkKey(y: number, m: number) { return `${y}-${String(m).padStart(2, '0')}` }

function calcPnL(data: MonthData, varExpenses: Expense[]): PnL {
  const { tn_revenue, meta_spend, tn_orders, tn_units } = data
  const aov      = tn_orders > 0 ? tn_revenue / tn_orders : AOV_DEFAULT
  const units    = tn_units > 0 ? tn_units : tn_orders * UNITS_PER_ORDER
  const merch    = units * UNIT_COST
  const shipping = tn_revenue * SHIPPING_PCT
  const platform = tn_revenue * PLATFORM_PCT
  const packaging= tn_orders * PACKAGING_PER_ORD
  const cogs     = merch + shipping + platform + packaging
  const gross_profit = tn_revenue - cogs
  const ad_result    = gross_profit - meta_spend
  const var_total    = varExpenses.reduce((s, e) => s + e.amount_ars, 0)
  const net_result   = ad_result - var_total
  return {
    tn_revenue, merch, shipping, platform, packaging, cogs,
    gross_profit, meta_spend, ad_result, var_total, net_result,
    margin_gross: tn_revenue > 0 ? gross_profit / tn_revenue : 0,
    margin_net:   tn_revenue > 0 ? net_result   / tn_revenue : 0,
    tn_orders, tn_units: units, aov,
  }
}

function aggregatePnL(months: MonthData[], allExpenses: Expense[], keys: string[]): PnL {
  const merged: MonthData = { meta_spend: 0, tn_revenue: 0, tn_orders: 0, tn_units: 0, source: 'live' }
  months.forEach(m => {
    merged.meta_spend += m.meta_spend
    merged.tn_revenue += m.tn_revenue
    merged.tn_orders  += m.tn_orders
    merged.tn_units   += m.tn_units
  })
  const expenses = allExpenses.filter(e => keys.includes(e.month))
  return calcPnL(merged, expenses)
}

// ─── Sub-components ───────────────────────────────────────────────────────────
function KpiCard({ label, value, sub, color }: { label: string; value: string; sub?: string; color: string }) {
  return (
    <div className={`rounded-xl border border-gray-100 dark:border-zinc-800 border-l-[3px] ${color} p-4 shadow-sm`}>
      <p className="text-[11px] font-semibold text-gray-400 dark:text-zinc-500 uppercase tracking-wider mb-1">{label}</p>
      <p className="text-2xl font-bold tabular-nums text-gray-900 dark:text-zinc-100 leading-none">{value}</p>
      {sub && <p className="text-[11px] text-gray-400 dark:text-zinc-500 mt-1.5">{sub}</p>}
    </div>
  )
}

function PnLRow({ label, value, pctVal, indent, isTotal, isSubtotal, isSeparator, note, positive }: {
  label: string; value: number | null; pctVal?: number; indent?: boolean; isTotal?: boolean
  isSubtotal?: boolean; isSeparator?: boolean; note?: string; positive?: boolean
}) {
  if (isSeparator) return (
    <tr><td colSpan={3} className="border-t border-gray-200 dark:border-zinc-700 py-0" /></tr>
  )
  const valStr = value != null ? fmt(value) : '—'
  const colorCls = value == null ? 'text-gray-300 dark:text-zinc-700'
    : isTotal || isSubtotal ? (value >= 0 ? 'text-emerald-600 dark:text-emerald-400' : 'text-red-600 dark:text-red-400')
    : positive ? 'text-emerald-600 dark:text-emerald-400'
    : value < 0 ? 'text-red-500 dark:text-red-400'
    : 'text-gray-700 dark:text-zinc-300'

  return (
    <tr className={isTotal ? 'bg-gray-50 dark:bg-zinc-800/40' : isSubtotal ? 'bg-gray-50/50 dark:bg-zinc-800/20' : ''}>
      <td className={`px-5 py-2.5 ${indent ? 'pl-9' : ''}`}>
        <p className={`text-sm ${isTotal ? 'font-semibold text-gray-900 dark:text-zinc-100' : isSubtotal ? 'font-medium text-gray-800 dark:text-zinc-200' : 'text-gray-600 dark:text-zinc-400'}`}>
          {label}
        </p>
        {note && <p className="text-[11px] text-gray-400 dark:text-zinc-600 mt-0.5">{note}</p>}
      </td>
      <td className={`px-5 py-2.5 text-right font-medium tabular-nums ${colorCls} ${isTotal ? 'text-base' : 'text-sm'}`}>
        {valStr}
      </td>
      <td className="px-5 py-2.5 text-right text-xs text-gray-400 dark:text-zinc-600 tabular-nums">
        {pctVal != null && pct(Math.abs(pctVal))}
        {isTotal && value != null && <span className={`font-semibold ${value >= 0 ? 'text-emerald-600 dark:text-emerald-400' : 'text-red-500'}`}>{pct(Math.abs(value / (value || 1)))}</span>}
      </td>
    </tr>
  )
}

// ─── Main component ───────────────────────────────────────────────────────────
export default function BalanceClient({ tnSnapshot, metaSnapshot, initialExpenses, initialSummaries }: Props) {
  const today    = new Date()
  const curYear  = today.getFullYear()
  const curMonth = today.getMonth() + 1  // 1-12
  const curKey   = mkKey(curYear, curMonth)
  const curQ     = Math.ceil(curMonth / 3)

  // ── State ──────────────────────────────────────────────────────────────────
  const [year,     setYear]     = useState(curYear)
  const [mode,     setMode]     = useState<'month' | 'quarter' | 'year'>('month')
  const [selMonth, setSelMonth] = useState(curMonth)
  const [selQ,     setSelQ]     = useState(curQ)
  const [expenses, setExpenses] = useState<Expense[]>(initialExpenses)
  const [summaries,setSummaries]= useState<MonthlySummary[]>(initialSummaries)

  // Add expense form
  const [showAdd,    setShowAdd]    = useState(false)
  const [newCat,     setNewCat]     = useState('mercaderia')
  const [newDesc,    setNewDesc]    = useState('')
  const [newAmt,     setNewAmt]     = useState('')

  // Capital en inventario
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const [stockData,    setStockData]    = useState<any>(null)
  const [loadingStock, setLoadingStock] = useState(false)
  const [stockError,   setStockError]   = useState<string | null>(null)

  async function handleFetchStock() {
    setLoadingStock(true); setStockError(null)
    try {
      const r = await fetch('/api/tn-stock')
      const j = await r.json()
      if (!r.ok) throw new Error(j.error ?? 'Error al consultar stock')
      setStockData(j)
    } catch (e) { setStockError(e instanceof Error ? e.message : 'Error desconocido') }
    finally { setLoadingStock(false) }
  }
  const [savingExp,  setSavingExp]  = useState(false)

  // Manual month data entry
  const [showManual, setShowManual] = useState(false)
  const [manRev,     setManRev]     = useState('')
  const [manSpend,   setManSpend]   = useState('')
  const [manOrders,  setManOrders]  = useState('')
  const [manUnits,   setManUnits]   = useState('')
  const [savingMan,  setSavingMan]  = useState(false)
  const [syncingMonth, setSyncingMonth] = useState(false)

  // ── Live data from snapshots ───────────────────────────────────────────────
  // Usamos summary_mtd (mes calendario del 1 al hoy) en lugar de summary_30d
  // para evitar doble conteo: summary_30d incluye días del mes anterior
  // que ya están en el resumen guardado de ese mes.
  const liveData: MonthData = useMemo(() => ({
    tn_revenue: tnSnapshot?.summary_mtd?.total_revenue    ?? tnSnapshot?.summary_30d?.total_revenue   ?? 0,
    tn_orders:  tnSnapshot?.summary_mtd?.total_orders     ?? tnSnapshot?.summary_30d?.total_orders    ?? 0,
    tn_units:   tnSnapshot?.summary_mtd?.total_units_sold ?? tnSnapshot?.summary_30d?.total_units_sold ?? 0,
    meta_spend: metaSnapshot?.periods?.last_30d?.summary?.total_spend_7d
             ?? metaSnapshot?.summary?.total_spend_7d
             ?? 0,
    source: 'live',
  }), [tnSnapshot, metaSnapshot])

  // ── Get data for any month key ─────────────────────────────────────────────
  const getMonthData = useCallback((key: string): MonthData => {
    if (key === curKey) return liveData
    const s = summaries.find(s => s.month === key)
    if (!s) return { meta_spend: 0, tn_revenue: 0, tn_orders: 0, tn_units: 0, source: 'empty' }
    return {
      meta_spend: s.meta_spend ?? 0,
      tn_revenue: s.tn_revenue ?? 0,
      tn_orders:  s.tn_orders  ?? 0,
      tn_units:   s.tn_units   ?? 0,
      source: 'saved',
    }
  }, [curKey, liveData, summaries])

  // ── Selected period keys ───────────────────────────────────────────────────
  const periodKeys = useMemo(() => {
    if (mode === 'month') return [mkKey(year, selMonth)]
    if (mode === 'quarter') {
      const start = (selQ - 1) * 3 + 1
      return [1,2,3].map(i => mkKey(year, start + i - 1))
    }
    return Array.from({ length: 12 }, (_, i) => mkKey(year, i + 1))
  }, [mode, year, selMonth, selQ])

  const selectedMonthKey = mkKey(year, selMonth)
  const isPastMonth = selectedMonthKey < curKey
  const isFuture = selectedMonthKey > curKey

  // ── P&L for selected period ────────────────────────────────────────────────
  const pnl = useMemo(() => {
    const datas   = periodKeys.map(k => getMonthData(k))
    const expList = expenses.filter(e => periodKeys.includes(e.month))
    return aggregatePnL(datas, expenses, periodKeys)
  }, [periodKeys, getMonthData, expenses])

  const periodExpenses = useMemo(
    () => expenses.filter(e => periodKeys.includes(e.month)).sort((a, b) => b.created_at.localeCompare(a.created_at)),
    [expenses, periodKeys]
  )

  // ── Annual summary (all 12 months of selected year) ───────────────────────
  const annualRows = useMemo(() =>
    Array.from({ length: 12 }, (_, i) => {
      const m = i + 1
      const key = mkKey(year, m)
      const data = getMonthData(key)
      const exp  = expenses.filter(e => e.month === key)
      const p    = calcPnL(data, exp)
      return { m, key, data, pnl: p }
    }), [year, getMonthData, expenses])

  // ── Period label ──────────────────────────────────────────────────────────
  const periodLabel = mode === 'month'
    ? `${MONTH_FULL[selMonth - 1]} ${year}`
    : mode === 'quarter'
    ? `Q${selQ} ${year}`
    : `Año ${year}`

  const hasData = pnl.tn_revenue > 0 || pnl.meta_spend > 0

  // ── Mutations ─────────────────────────────────────────────────────────────
  async function handleAddExpense() {
    if (!newDesc.trim() || !newAmt) return
    setSavingExp(true)
    try {
      const targetMonth = mode === 'month' ? selectedMonthKey : mkKey(year, selQ * 3)
      const res = await fetch('/api/expenses', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          month: targetMonth,
          category: newCat,
          description: newDesc.trim(),
          amount_ars: parseFloat(newAmt.replace(/\./g, '').replace(',', '.')) || 0,
        }),
      })
      const saved = await res.json()
      if (!res.ok) throw new Error(saved.error)
      setExpenses(prev => [saved, ...prev])
      setNewDesc('')
      setNewAmt('')
      setShowAdd(false)
    } catch (e) { alert('Error al guardar: ' + e) }
    finally { setSavingExp(false) }
  }

  async function handleDeleteExpense(id: string) {
    if (!confirm('¿Eliminar este gasto?')) return
    const res = await fetch(`/api/expenses?id=${id}`, { method: 'DELETE' })
    if (res.ok) setExpenses(prev => prev.filter(e => e.id !== id))
  }

  async function handleSaveManual() {
    if (!manRev && !manSpend) return
    setSavingMan(true)
    try {
      const parse = (s: string) => s ? parseFloat(s.replace(/\./g, '').replace(',', '.')) : null
      const res = await fetch('/api/monthly', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          month:      selectedMonthKey,
          tn_revenue: parse(manRev),
          meta_spend: parse(manSpend),
          tn_orders:  parse(manOrders),
          tn_units:   parse(manUnits),
        }),
      })
      const saved = await res.json()
      if (!res.ok) throw new Error(saved.error)
      setSummaries(prev => {
        const idx = prev.findIndex(s => s.month === selectedMonthKey)
        if (idx >= 0) { const n = [...prev]; n[idx] = saved; return n }
        return [saved, ...prev]
      })
      setShowManual(false)
      setManRev(''); setManSpend(''); setManOrders(''); setManUnits('')
    } catch (e) { alert('Error al guardar: ' + e) }
    finally { setSavingMan(false) }
  }

  async function handleSyncMonth(month: string) {
    setSyncingMonth(true)
    try {
      const res = await fetch(`/api/sync-month?month=${month}`, { method: 'POST' })
      const json = await res.json()
      if (!res.ok) throw new Error(json.error ?? 'Error al sincronizar')
      const newSummary: MonthlySummary = {
        month,
        meta_spend: json.meta_spend ?? null,
        tn_revenue: json.tn_revenue ?? null,
        tn_orders:  json.tn_orders  ?? null,
        tn_units:   json.tn_units   ?? null,
        notes:      json.summary?.notes ?? null,
        updated_at: new Date().toISOString(),
      }
      setSummaries(prev => {
        const idx = prev.findIndex(s => s.month === month)
        if (idx >= 0) { const n = [...prev]; n[idx] = newSummary; return n }
        return [newSummary, ...prev]
      })
    } catch (e) { alert('Error al sincronizar: ' + e) }
    finally { setSyncingMonth(false) }
  }

  async function handleExport() {
    const lines = [
      `Balance Forever Basics — ${periodLabel}`,
      `Fecha,${new Date().toLocaleDateString('es-AR')}`,
      '',
      'Concepto,Importe (ARS),% Ventas',
      `Ventas brutas,${Math.round(pnl.tn_revenue)},100%`,
      `Merch (${pnl.tn_units} un × $${UNIT_COST.toLocaleString('es-AR')}),-${Math.round(pnl.merch)},${pct(pnl.merch/pnl.tn_revenue)}`,
      `Envío (10%),-${Math.round(pnl.shipping)},${pct(pnl.shipping/pnl.tn_revenue)}`,
      `Plataforma TN (2.5%),-${Math.round(pnl.platform)},${pct(pnl.platform/pnl.tn_revenue)}`,
      `Packaging,-${Math.round(pnl.packaging)},${pct(pnl.packaging/pnl.tn_revenue)}`,
      `Ganancia bruta,${Math.round(pnl.gross_profit)},${pct(pnl.margin_gross)}`,
      `Gasto Meta Ads,-${Math.round(pnl.meta_spend)},${pct(pnl.meta_spend/pnl.tn_revenue)}`,
      `Resultado publicidad,${Math.round(pnl.ad_result)},${pct(pnl.ad_result/pnl.tn_revenue)}`,
      ...periodExpenses.map(e => `"${e.description}",-${Math.round(e.amount_ars)},`),
      `Resultado neto,${Math.round(pnl.net_result)},${pct(pnl.margin_net)}`,
    ]
    const blob = new Blob(['﻿' + lines.join('\r\n')], { type: 'text/csv;charset=utf-8;' })
    const url  = URL.createObjectURL(blob)
    const a    = document.createElement('a')
    a.href     = url
    a.download = `balance_forever_${periodLabel.replace(/\s/g, '_')}.csv`
    a.click()
    URL.revokeObjectURL(url)
  }

  // ── Render ─────────────────────────────────────────────────────────────────
  return (
    <div className="max-w-4xl mx-auto space-y-5 pb-12">

      {/* ── Header ─────────────────────────────────────────────────────────── */}
      <div className="flex items-center justify-between gap-4">
        <div>
          <h1 className="text-xl font-semibold text-gray-900 dark:text-zinc-100">Balance</h1>
          <p className="text-sm text-gray-400 dark:text-zinc-500 mt-0.5">P&L real del negocio</p>
        </div>
        <div className="flex items-center gap-2">
          <button onClick={() => { setShowAdd(true) }}
            className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium bg-violet-600 hover:bg-violet-700 text-white rounded-lg transition-all">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" className="w-3.5 h-3.5"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>
            Gasto variable
          </button>
          <button onClick={handleExport}
            className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium border border-gray-200 dark:border-zinc-700 rounded-lg text-gray-600 dark:text-zinc-400 hover:bg-gray-100 dark:hover:bg-zinc-800 transition-all">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="w-3.5 h-3.5"><path d="M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8z"/><polyline points="14 2 14 8 20 8"/><line x1="16" y1="13" x2="8" y2="13"/><line x1="16" y1="17" x2="8" y2="17"/></svg>
            CSV
          </button>
        </div>
      </div>

      {/* ── Period selector ────────────────────────────────────────────────── */}
      <div className="bg-white dark:bg-zinc-900 rounded-xl border border-gray-100 dark:border-zinc-800 p-4 shadow-sm space-y-3">

        {/* Year + mode */}
        <div className="flex items-center gap-3 flex-wrap">
          <div className="flex items-center gap-1">
            <button onClick={() => setYear(y => y - 1)}
              className="w-7 h-7 flex items-center justify-center rounded-lg text-gray-400 hover:bg-gray-100 dark:hover:bg-zinc-800 transition-colors">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="w-4 h-4"><polyline points="15 18 9 12 15 6"/></svg>
            </button>
            <span className="text-sm font-semibold text-gray-800 dark:text-zinc-200 min-w-[48px] text-center">{year}</span>
            <button onClick={() => setYear(y => Math.min(y + 1, curYear))}
              disabled={year >= curYear}
              className="w-7 h-7 flex items-center justify-center rounded-lg text-gray-400 hover:bg-gray-100 dark:hover:bg-zinc-800 transition-colors disabled:opacity-30">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="w-4 h-4"><polyline points="9 18 15 12 9 6"/></svg>
            </button>
          </div>

          <div className="flex bg-gray-100 dark:bg-zinc-800 rounded-lg p-0.5 gap-0.5">
            {(['month','quarter','year'] as const).map(m => (
              <button key={m} onClick={() => setMode(m)}
                className={'px-3 py-1 text-xs font-medium rounded-md transition-all ' + (
                  mode === m
                    ? 'bg-white dark:bg-zinc-700 text-gray-900 dark:text-zinc-100 shadow-sm'
                    : 'text-gray-500 dark:text-zinc-400 hover:text-gray-700 dark:hover:text-zinc-200'
                )}>
                {m === 'month' ? 'Mensual' : m === 'quarter' ? 'Trimestral' : 'Anual'}
              </button>
            ))}
          </div>
        </div>

        {/* Month buttons */}
        {mode === 'month' && (
          <div className="flex gap-1 flex-wrap">
            {MONTH_SHORT.map((name, i) => {
              const m   = i + 1
              const key = mkKey(year, m)
              const fut = key > curKey
              const hasSavedData = summaries.some(s => s.month === key)
              const isLive = key === curKey
              return (
                <button key={m} onClick={() => { if (!fut) setSelMonth(m) }}
                  disabled={fut}
                  className={'relative px-3 py-1.5 text-xs font-medium rounded-lg transition-all ' + (
                    selMonth === m && !fut
                      ? 'bg-violet-600 text-white shadow-sm'
                      : fut
                      ? 'text-gray-300 dark:text-zinc-700 cursor-not-allowed'
                      : 'text-gray-600 dark:text-zinc-400 hover:bg-gray-100 dark:hover:bg-zinc-800 border border-gray-100 dark:border-zinc-800'
                  )}>
                  {name}
                  {(isLive || hasSavedData) && selMonth !== m && (
                    <span className={`absolute top-0.5 right-0.5 w-1.5 h-1.5 rounded-full ${isLive ? 'bg-emerald-400' : 'bg-violet-400'}`} />
                  )}
                </button>
              )
            })}
          </div>
        )}

        {/* Quarter buttons */}
        {mode === 'quarter' && (
          <div className="flex gap-2">
            {[1,2,3,4].map(q => {
              const lastMonth = q * 3
              const fut = mkKey(year, lastMonth) > curKey && q > Math.ceil(curMonth/3)
              return (
                <button key={q} onClick={() => { if (!fut) setSelQ(q) }}
                  disabled={fut}
                  className={'px-5 py-2 text-sm font-medium rounded-lg transition-all ' + (
                    selQ === q && !fut
                      ? 'bg-violet-600 text-white shadow-sm'
                      : fut
                      ? 'text-gray-300 dark:text-zinc-700 cursor-not-allowed border border-gray-100 dark:border-zinc-800'
                      : 'text-gray-600 dark:text-zinc-400 hover:bg-gray-100 dark:hover:bg-zinc-800 border border-gray-100 dark:border-zinc-800'
                  )}>
                  Q{q}
                  <span className="text-[10px] block font-normal opacity-70">
                    {MONTH_SHORT[(q-1)*3]}–{MONTH_SHORT[q*3-1]}
                  </span>
                </button>
              )
            })}
          </div>
        )}

        {mode === 'year' && (
          <p className="text-xs text-gray-400 dark:text-zinc-500">
            Mostrando agregado de todos los meses de {year}
          </p>
        )}
      </div>

      {/* ── KPI Cards ──────────────────────────────────────────────────────── */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <KpiCard
          label="Ventas"
          value={hasData ? fmt(pnl.tn_revenue) : '—'}
          sub={hasData ? `${pnl.tn_orders} órdenes · AOV ${fmt(pnl.aov)}` : 'Sin datos'}
          color={hasData ? 'border-l-blue-400' : 'border-l-gray-200 dark:border-l-zinc-700'}
        />
        <KpiCard
          label="Ganancia bruta"
          value={hasData ? fmt(pnl.gross_profit) : '—'}
          sub={hasData ? `${pct(pnl.margin_gross)} de ventas` : 'antes de Meta'}
          color={hasData ? (pnl.gross_profit >= 0 ? 'border-l-emerald-400' : 'border-l-red-400') : 'border-l-gray-200 dark:border-l-zinc-700'}
        />
        <KpiCard
          label="Resultado pub."
          value={hasData ? fmt(pnl.ad_result) : '—'}
          sub={hasData ? `Meta: ${fmt(pnl.meta_spend)}` : 'después de Meta'}
          color={hasData ? (pnl.ad_result >= 0 ? 'border-l-emerald-400' : 'border-l-amber-400') : 'border-l-gray-200 dark:border-l-zinc-700'}
        />
        <KpiCard
          label="Resultado neto"
          value={hasData ? fmt(pnl.net_result) : '—'}
          sub={hasData ? `${pct(Math.abs(pnl.margin_net))} de ventas` : 'después de todo'}
          color={hasData ? (pnl.net_result >= 0 ? 'border-l-emerald-500 bg-gradient-to-br from-emerald-50/60 to-white dark:from-emerald-950/20 dark:to-zinc-900' : 'border-l-red-500 bg-gradient-to-br from-red-50/60 to-white dark:from-red-950/20 dark:to-zinc-900') : 'border-l-gray-200 dark:border-l-zinc-700'}
        />
      </div>

      {/* ── Alert: past month without data ─────────────────────────────────── */}
      {mode === 'month' && isPastMonth && !hasData && (
        <div className="bg-amber-50 dark:bg-amber-950/30 border border-amber-200 dark:border-amber-800/50 rounded-xl p-4 flex items-start justify-between gap-4">
          <div>
            <p className="text-sm font-medium text-amber-800 dark:text-amber-300">Sin datos para {MONTH_FULL[selMonth-1]} {year}</p>
            <p className="text-xs text-amber-600 dark:text-amber-500 mt-0.5">
              Sincronizá desde Tiendanube y Meta Ads, o cargá los datos manualmente.
            </p>
          </div>
          <div className="flex items-center gap-2 shrink-0">
            <button onClick={() => handleSyncMonth(selectedMonthKey)} disabled={syncingMonth}
              className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium bg-blue-600 hover:bg-blue-700 disabled:opacity-50 text-white rounded-lg transition-colors">
              {syncingMonth ? (
                <svg className="animate-spin w-3 h-3" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><path d="M12 2v4m0 12v4M4.93 4.93l2.83 2.83m8.48 8.48 2.83 2.83M2 12h4m12 0h4M4.93 19.07l2.83-2.83m8.48-8.48 2.83-2.83"/></svg>
              ) : (
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" className="w-3 h-3"><path d="M23 4v6h-6"/><path d="M20.49 15a9 9 0 1 1-2.12-9.36L23 10"/></svg>
              )}
              {syncingMonth ? 'Sincronizando…' : 'Sincronizar desde API'}
            </button>
            <button onClick={() => setShowManual(true)}
              className="shrink-0 px-3 py-1.5 text-xs font-medium border border-amber-300 dark:border-amber-700 text-amber-700 dark:text-amber-400 hover:bg-amber-100 dark:hover:bg-amber-950/50 rounded-lg transition-colors">
              Manual
            </button>
          </div>
        </div>
      )}

      {/* ── Manual data entry modal ─────────────────────────────────────────── */}
      {showManual && (
        <div className="bg-white dark:bg-zinc-900 rounded-xl border border-gray-200 dark:border-zinc-700 p-5 shadow-lg space-y-4">
          <div className="flex items-center justify-between">
            <p className="text-sm font-semibold text-gray-800 dark:text-zinc-200">
              Datos de {MONTH_FULL[selMonth-1]} {year}
            </p>
            <button onClick={() => setShowManual(false)} className="text-gray-400 hover:text-gray-600 dark:hover:text-zinc-300">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="w-4 h-4"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
            </button>
          </div>
          <div className="grid grid-cols-2 gap-3">
            {[
              { label: 'Ventas TN (ARS)', val: manRev,    set: setManRev,    placeholder: 'ej: 2500000' },
              { label: 'Gasto Meta (ARS)', val: manSpend, set: setManSpend,  placeholder: 'ej: 450000' },
              { label: 'Órdenes',          val: manOrders,set: setManOrders, placeholder: 'ej: 48' },
              { label: 'Unidades vendidas',val: manUnits, set: setManUnits,  placeholder: 'ej: 144' },
            ].map(f => (
              <div key={f.label}>
                <label className="text-xs font-medium text-gray-500 dark:text-zinc-500 mb-1 block">{f.label}</label>
                <input type="text" value={f.val} onChange={e => f.set(e.target.value)} placeholder={f.placeholder}
                  className="w-full text-sm bg-gray-50 dark:bg-zinc-800 border border-gray-200 dark:border-zinc-700 rounded-lg px-3 py-2 text-gray-900 dark:text-zinc-100 focus:outline-none focus:ring-2 focus:ring-violet-500/50" />
              </div>
            ))}
          </div>
          <div className="flex justify-end gap-2">
            <button onClick={() => setShowManual(false)}
              className="px-4 py-2 text-xs font-medium border border-gray-200 dark:border-zinc-700 rounded-lg text-gray-600 dark:text-zinc-400 hover:bg-gray-100 dark:hover:bg-zinc-800 transition-colors">
              Cancelar
            </button>
            <button onClick={handleSaveManual} disabled={savingMan}
              className="px-4 py-2 text-xs font-medium bg-violet-600 hover:bg-violet-700 text-white rounded-lg transition-colors disabled:opacity-50">
              {savingMan ? 'Guardando…' : 'Guardar'}
            </button>
          </div>
        </div>
      )}

      {/* ── P&L Table ──────────────────────────────────────────────────────── */}
      <div className="bg-white dark:bg-zinc-900 rounded-xl border border-gray-100 dark:border-zinc-800 overflow-hidden shadow-sm">
        <div className="px-5 py-3 border-b border-gray-100 dark:border-zinc-800 flex items-center justify-between">
          <div>
            <p className="text-sm font-semibold text-gray-800 dark:text-zinc-200">Estado de resultados</p>
            <p className="text-xs text-gray-400 dark:text-zinc-500">{periodLabel}
              {mode === 'month' && selectedMonthKey === curKey && <span className="ml-2 text-[10px] bg-emerald-100 dark:bg-emerald-950/60 text-emerald-700 dark:text-emerald-400 px-1.5 py-0.5 rounded-full font-medium">Datos en vivo · mes actual</span>}
              {mode === 'month' && isPastMonth && getMonthData(selectedMonthKey).source === 'saved' && (() => {
                const s = summaries.find(x => x.month === selectedMonthKey)
                const isAutoSync = s?.notes?.startsWith('Auto-sync')
                return (
                  <span className={`ml-2 text-[10px] px-1.5 py-0.5 rounded-full font-medium ${isAutoSync ? 'bg-emerald-100 dark:bg-emerald-950/60 text-emerald-700 dark:text-emerald-400' : 'bg-blue-100 dark:bg-blue-950/60 text-blue-700 dark:text-blue-400'}`}>
                    {isAutoSync ? 'Sincronizado desde API' : 'Datos manuales'}
                  </span>
                )
              })()}
            </p>
          </div>
          {mode === 'month' && isPastMonth && getMonthData(selectedMonthKey).source === 'saved' && (
            <div className="flex items-center gap-2">
              <button onClick={() => handleSyncMonth(selectedMonthKey)} disabled={syncingMonth}
                className="flex items-center gap-1 text-xs text-blue-600 dark:text-blue-400 hover:underline disabled:opacity-50">
                {syncingMonth ? (
                  <svg className="animate-spin w-3 h-3" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><path d="M12 2v4m0 12v4M4.93 4.93l2.83 2.83m8.48 8.48 2.83 2.83M2 12h4m12 0h4M4.93 19.07l2.83-2.83m8.48-8.48 2.83-2.83"/></svg>
                ) : (
                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" className="w-3 h-3"><path d="M23 4v6h-6"/><path d="M20.49 15a9 9 0 1 1-2.12-9.36L23 10"/></svg>
                )}
                {syncingMonth ? 'Sincronizando…' : 'Re-sincronizar'}
              </button>
              <span className="text-gray-200 dark:text-zinc-700">·</span>
              <button onClick={() => setShowManual(true)}
                className="text-xs text-violet-600 dark:text-violet-400 hover:underline">
                Editar datos
              </button>
            </div>
          )}
        </div>
        <table className="w-full text-sm">
          <thead>
            <tr className="text-[11px] text-gray-400 dark:text-zinc-500 bg-gray-50 dark:bg-zinc-800/50 border-b border-gray-100 dark:border-zinc-800">
              <th className="text-left px-5 py-2.5 font-medium">Concepto</th>
              <th className="text-right px-5 py-2.5 font-medium">Importe</th>
              <th className="text-right px-5 py-2.5 font-medium">% Ventas</th>
            </tr>
          </thead>
          <tbody>
            <PnLRow label="Ventas brutas (Tiendanube)" value={pnl.tn_revenue} positive
              note={`${pnl.tn_orders} órdenes · ${pnl.tn_units} unidades · AOV ${fmt(pnl.aov)}`} />
            <PnLRow label={`Mercadería (${pnl.tn_units} un × $${UNIT_COST.toLocaleString('es-AR')})`} value={-pnl.merch}
              pctVal={pnl.tn_revenue > 0 ? pnl.merch / pnl.tn_revenue : 0} indent />
            <PnLRow label="Envío (10% del ticket)" value={-pnl.shipping}
              pctVal={pnl.tn_revenue > 0 ? pnl.shipping / pnl.tn_revenue : 0} indent />
            <PnLRow label="Comisión Tiendanube (2.5%)" value={-pnl.platform}
              pctVal={pnl.tn_revenue > 0 ? pnl.platform / pnl.tn_revenue : 0} indent />
            <PnLRow label={`Packaging (${pnl.tn_orders} órd × $${PACKAGING_PER_ORD.toLocaleString('es-AR')})`} value={-pnl.packaging}
              pctVal={pnl.tn_revenue > 0 ? pnl.packaging / pnl.tn_revenue : 0} indent />
            <PnLRow isSeparator label="" value={null} />
            <PnLRow label="= Ganancia bruta" value={pnl.gross_profit} isSubtotal
              note={`Margen: ${pct(Math.abs(pnl.margin_gross))}`} />
            <PnLRow label="Gasto Meta Ads" value={-pnl.meta_spend}
              pctVal={pnl.tn_revenue > 0 ? pnl.meta_spend / pnl.tn_revenue : 0} indent />
            <PnLRow isSeparator label="" value={null} />
            <PnLRow label="= Resultado publicidad" value={pnl.ad_result} isSubtotal
              note={pnl.tn_revenue > 0 ? `${pct(Math.abs(pnl.ad_result / pnl.tn_revenue))} de ventas` : undefined} />
            {periodExpenses.length > 0 && periodExpenses.map(e => {
              const cat = EXPENSE_CATS.find(c => c.value === e.category)
              return (
                <PnLRow key={e.id}
                  label={e.description}
                  value={-e.amount_ars}
                  pctVal={pnl.tn_revenue > 0 ? e.amount_ars / pnl.tn_revenue : 0}
                  note={cat?.label ?? e.category}
                  indent />
              )
            })}
            <PnLRow isSeparator label="" value={null} />
            <PnLRow label="RESULTADO NETO" value={pnl.net_result} isTotal />
          </tbody>
        </table>
        <div className="px-5 py-2.5 bg-gray-50 dark:bg-zinc-800/30 border-t border-gray-100 dark:border-zinc-800">
          <p className="text-[10px] text-gray-400 dark:text-zinc-600">
            Costo/orden: merch ${UNIT_COST.toLocaleString('es-AR')}/un × {UNITS_PER_ORDER} + envío 10% + TN 2.5% + packaging ${PACKAGING_PER_ORD.toLocaleString('es-AR')} = ~$27.000 ARS promedio
          </p>
        </div>
      </div>

      {/* ── Gastos variables ────────────────────────────────────────────────── */}
      <div className="bg-white dark:bg-zinc-900 rounded-xl border border-gray-100 dark:border-zinc-800 shadow-sm overflow-hidden">
        <div className="px-5 py-3 border-b border-gray-100 dark:border-zinc-800 flex items-center justify-between">
          <div>
            <p className="text-sm font-semibold text-gray-800 dark:text-zinc-200">Gastos variables</p>
            <p className="text-xs text-gray-400 dark:text-zinc-500">{periodLabel} · {periodExpenses.length} {periodExpenses.length === 1 ? 'gasto' : 'gastos'}</p>
          </div>
          <button onClick={() => setShowAdd(!showAdd)}
            className="flex items-center gap-1 px-3 py-1.5 text-xs font-medium border border-gray-200 dark:border-zinc-700 rounded-lg text-gray-600 dark:text-zinc-400 hover:bg-gray-100 dark:hover:bg-zinc-800 transition-colors">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" className="w-3.5 h-3.5"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>
            Agregar
          </button>
        </div>

        {/* Add form */}
        {showAdd && (
          <div className="px-5 py-4 border-b border-gray-100 dark:border-zinc-800 bg-gray-50/50 dark:bg-zinc-800/20 space-y-3">
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
              <div>
                <label className="text-[11px] font-medium text-gray-400 dark:text-zinc-500 mb-1 block">Categoría</label>
                <select value={newCat} onChange={e => setNewCat(e.target.value)}
                  className="w-full text-sm bg-white dark:bg-zinc-800 border border-gray-200 dark:border-zinc-700 rounded-lg px-3 py-2 text-gray-900 dark:text-zinc-100 focus:outline-none focus:ring-2 focus:ring-violet-500/50">
                  {EXPENSE_CATS.map(c => <option key={c.value} value={c.value}>{c.label}</option>)}
                </select>
              </div>
              <div>
                <label className="text-[11px] font-medium text-gray-400 dark:text-zinc-500 mb-1 block">Descripción</label>
                <input type="text" value={newDesc} onChange={e => setNewDesc(e.target.value)}
                  placeholder="ej: Compra stock invierno"
                  className="w-full text-sm bg-white dark:bg-zinc-800 border border-gray-200 dark:border-zinc-700 rounded-lg px-3 py-2 text-gray-900 dark:text-zinc-100 focus:outline-none focus:ring-2 focus:ring-violet-500/50" />
              </div>
              <div>
                <label className="text-[11px] font-medium text-gray-400 dark:text-zinc-500 mb-1 block">Importe (ARS)</label>
                <input type="text" value={newAmt} onChange={e => setNewAmt(e.target.value)}
                  placeholder="ej: 250000"
                  className="w-full text-sm bg-white dark:bg-zinc-800 border border-gray-200 dark:border-zinc-700 rounded-lg px-3 py-2 text-gray-900 dark:text-zinc-100 focus:outline-none focus:ring-2 focus:ring-violet-500/50" />
              </div>
            </div>
            {mode !== 'month' && (
              <p className="text-[11px] text-amber-600 dark:text-amber-400">
                En vista {mode === 'quarter' ? 'trimestral' : 'anual'}, el gasto se asigna al mes actual. Cambiá a vista mensual para asignar a un mes específico.
              </p>
            )}
            <div className="flex justify-end gap-2">
              <button onClick={() => { setShowAdd(false); setNewDesc(''); setNewAmt('') }}
                className="px-4 py-1.5 text-xs border border-gray-200 dark:border-zinc-700 rounded-lg text-gray-500 hover:bg-gray-100 dark:hover:bg-zinc-800 transition-colors">
                Cancelar
              </button>
              <button onClick={handleAddExpense} disabled={savingExp || !newDesc || !newAmt}
                className="px-4 py-1.5 text-xs font-medium bg-violet-600 hover:bg-violet-700 text-white rounded-lg transition-colors disabled:opacity-40">
                {savingExp ? 'Guardando…' : 'Guardar gasto'}
              </button>
            </div>
          </div>
        )}

        {/* Expense list */}
        {periodExpenses.length === 0 ? (
          <div className="px-5 py-8 text-center">
            <p className="text-sm text-gray-400 dark:text-zinc-500">Sin gastos variables registrados para {periodLabel}</p>
            <p className="text-xs text-gray-300 dark:text-zinc-600 mt-1">Ej: compra de mercadería, nuevo packaging, distribución de ganancias</p>
          </div>
        ) : (
          <div className="divide-y divide-gray-50 dark:divide-zinc-800/60">
            {periodExpenses.map(e => {
              const cat = EXPENSE_CATS.find(c => c.value === e.category)
              return (
                <div key={e.id} className="px-5 py-3 flex items-center justify-between gap-4 hover:bg-gray-50/50 dark:hover:bg-zinc-800/20 transition-colors">
                  <div className="flex items-center gap-3 min-w-0">
                    <span className={`text-[11px] font-medium px-2 py-0.5 rounded-full shrink-0 ${cat?.color ?? 'bg-gray-100 dark:bg-zinc-800 text-gray-500'}`}>
                      {cat?.label ?? e.category}
                    </span>
                    <div className="min-w-0">
                      <p className="text-sm text-gray-800 dark:text-zinc-200 truncate">{e.description}</p>
                      <p className="text-[11px] text-gray-400 dark:text-zinc-500">{e.month}</p>
                    </div>
                  </div>
                  <div className="flex items-center gap-3 shrink-0">
                    <span className="text-sm font-medium tabular-nums text-red-600 dark:text-red-400">{fmt(-e.amount_ars)}</span>
                    <button onClick={() => handleDeleteExpense(e.id)}
                      className="text-gray-300 dark:text-zinc-700 hover:text-red-500 dark:hover:text-red-400 transition-colors">
                      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="w-4 h-4"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
                    </button>
                  </div>
                </div>
              )
            })}
            {pnl.var_total > 0 && (
              <div className="px-5 py-2 bg-gray-50 dark:bg-zinc-800/30 flex justify-between">
                <span className="text-xs font-medium text-gray-500 dark:text-zinc-500">Total gastos variables</span>
                <span className="text-xs font-semibold tabular-nums text-red-600 dark:text-red-400">{fmt(-pnl.var_total)}</span>
              </div>
            )}
          </div>
        )}
      </div>

      {/* ── Annual summary table ─────────────────────────────────────────────── */}
      <div className="bg-white dark:bg-zinc-900 rounded-xl border border-gray-100 dark:border-zinc-800 shadow-sm overflow-hidden">
        <div className="px-5 py-3 border-b border-gray-100 dark:border-zinc-800">
          <p className="text-sm font-semibold text-gray-800 dark:text-zinc-200">Resumen {year}</p>
          <p className="text-xs text-gray-400 dark:text-zinc-500">Todos los meses del año · Hacé click para ver el detalle</p>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-xs">
            <thead>
              <tr className="text-[11px] text-gray-400 dark:text-zinc-500 bg-gray-50 dark:bg-zinc-800/50 border-b border-gray-100 dark:border-zinc-800">
                <th className="text-left px-4 py-2.5 font-medium">Mes</th>
                <th className="text-right px-4 py-2.5 font-medium">Ventas</th>
                <th className="text-right px-4 py-2.5 font-medium">G. Bruta</th>
                <th className="text-right px-4 py-2.5 font-medium">Meta</th>
                <th className="text-right px-4 py-2.5 font-medium">Gastos Var.</th>
                <th className="text-right px-4 py-2.5 font-medium">Resultado</th>
                <th className="text-right px-4 py-2.5 font-medium">Margen</th>
              </tr>
            </thead>
            <tbody>
              {annualRows.map(({ m, key, data, pnl: mp }) => {
                const isCur = key === curKey
                const isSel = mode === 'month' && selMonth === m && year === curYear || mode === 'month' && selMonth === m
                const isEmpty = data.source === 'empty'
                const isFut = key > curKey
                const varTotal = expenses.filter(e => e.month === key).reduce((s, e) => s + e.amount_ars, 0)

                return (
                  <tr key={m}
                    onClick={() => { if (!isFut) { setMode('month'); setSelMonth(m) } }}
                    className={`border-b border-gray-50 dark:border-zinc-800/60 cursor-pointer transition-colors ${
                      isSel && mode === 'month' ? 'bg-violet-50 dark:bg-violet-950/20'
                      : isFut ? 'opacity-30 cursor-not-allowed'
                      : 'hover:bg-gray-50 dark:hover:bg-zinc-800/30'
                    }`}>
                    <td className="px-4 py-2.5">
                      <div className="flex items-center gap-2">
                        <span className={`font-medium ${isCur ? 'text-emerald-600 dark:text-emerald-400' : 'text-gray-700 dark:text-zinc-300'}`}>
                          {MONTH_SHORT[m-1]}
                        </span>
                        {isCur && <span className="text-[10px] bg-emerald-100 dark:bg-emerald-950/60 text-emerald-700 dark:text-emerald-400 px-1.5 py-0.5 rounded-full font-medium">vivo</span>}
                      </div>
                    </td>
                    <td className="px-4 py-2.5 text-right tabular-nums text-gray-700 dark:text-zinc-300">{isEmpty ? <span className="text-gray-300 dark:text-zinc-700">—</span> : fmt(mp.tn_revenue)}</td>
                    <td className="px-4 py-2.5 text-right tabular-nums text-gray-600 dark:text-zinc-400">{isEmpty ? '—' : fmt(mp.gross_profit)}</td>
                    <td className="px-4 py-2.5 text-right tabular-nums text-gray-500 dark:text-zinc-500">{isEmpty ? '—' : fmt(mp.meta_spend)}</td>
                    <td className="px-4 py-2.5 text-right tabular-nums text-gray-500 dark:text-zinc-500">{varTotal > 0 ? fmt(-varTotal) : '—'}</td>
                    <td className={`px-4 py-2.5 text-right tabular-nums font-semibold ${isEmpty ? 'text-gray-300 dark:text-zinc-700' : mp.net_result >= 0 ? 'text-emerald-600 dark:text-emerald-400' : 'text-red-600 dark:text-red-400'}`}>
                      {isEmpty ? '—' : fmt(mp.net_result)}
                    </td>
                    <td className={`px-4 py-2.5 text-right tabular-nums ${isEmpty ? 'text-gray-300 dark:text-zinc-700' : mp.margin_net >= 0 ? 'text-emerald-600 dark:text-emerald-400' : 'text-red-500'}`}>
                      {isEmpty ? '—' : pct(Math.abs(mp.margin_net))}
                    </td>
                  </tr>
                )
              })}
              {/* Year total row */}
              {(() => {
                const allData = annualRows.filter(r => r.data.source !== 'empty').map(r => r.pnl)
                if (allData.length === 0) return null
                const totRev = allData.reduce((s, p) => s + p.tn_revenue, 0)
                const totGross = allData.reduce((s, p) => s + p.gross_profit, 0)
                const totMeta  = allData.reduce((s, p) => s + p.meta_spend, 0)
                const totVar   = annualRows.reduce((s, r) => s + expenses.filter(e => e.month === r.key).reduce((x, e) => x + e.amount_ars, 0), 0)
                const totNet   = allData.reduce((s, p) => s + p.net_result, 0) - (totVar - allData.reduce((s, p) => s + p.var_total, 0))
                return (
                  <tr className="bg-gray-50 dark:bg-zinc-800/40 border-t-2 border-gray-200 dark:border-zinc-700">
                    <td className="px-4 py-3 font-semibold text-gray-700 dark:text-zinc-300">Total {year}</td>
                    <td className="px-4 py-3 text-right tabular-nums font-semibold text-gray-700 dark:text-zinc-300">{fmt(totRev)}</td>
                    <td className="px-4 py-3 text-right tabular-nums font-semibold text-gray-600 dark:text-zinc-400">{fmt(totGross)}</td>
                    <td className="px-4 py-3 text-right tabular-nums font-semibold text-gray-500 dark:text-zinc-500">{fmt(totMeta)}</td>
                    <td className="px-4 py-3 text-right tabular-nums font-semibold text-gray-500 dark:text-zinc-500">{totVar > 0 ? fmt(-totVar) : '—'}</td>
                    <td className={`px-4 py-3 text-right tabular-nums font-bold ${totNet >= 0 ? 'text-emerald-600 dark:text-emerald-400' : 'text-red-600 dark:text-red-400'}`}>
                      {fmt(totNet)}
                    </td>
                    <td className={`px-4 py-3 text-right tabular-nums font-semibold ${totNet >= 0 ? 'text-emerald-600 dark:text-emerald-400' : 'text-red-500'}`}>
                      {totRev > 0 ? pct(Math.abs(totNet / totRev)) : '—'}
                    </td>
                  </tr>
                )
              })()}
            </tbody>
          </table>
        </div>
      </div>

      {/* ── Capital en inventario ──────────────────────────────────────── */}
      <div className="bg-white dark:bg-zinc-900 rounded-2xl border border-gray-200 dark:border-zinc-800 shadow-sm overflow-hidden">
        <div className="px-5 py-4 flex items-center justify-between gap-3 border-b border-gray-100 dark:border-zinc-800">
          <div>
            <h2 className="text-sm font-semibold text-gray-800 dark:text-zinc-200">Capital en inventario</h2>
            <p className="text-xs text-gray-400 dark:text-zinc-500 mt-0.5">
              Stock actual en Tiendanube · costo real del producto cuando está disponible, fallback $6.500/unidad
            </p>
          </div>
          <button
            onClick={handleFetchStock}
            disabled={loadingStock}
            className="shrink-0 flex items-center gap-2 text-xs font-medium bg-sky-600 hover:bg-sky-700 disabled:bg-sky-400 text-white rounded-lg px-3.5 py-2 transition-colors"
          >
            {loadingStock ? (
              <><svg className="w-3.5 h-3.5 animate-spin" viewBox="0 0 24 24" fill="none"><circle cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="3" strokeDasharray="60" strokeDashoffset="20"/></svg>Consultando…</>
            ) : stockData ? 'Actualizar' : 'Consultar stock'}
          </button>
        </div>

        {stockError && (
          <div className="px-5 py-4 text-sm text-red-600 dark:text-red-400 bg-red-50 dark:bg-red-950/20">{stockError}</div>
        )}

        {!stockData && !stockError && (
          <div className="px-5 py-10 text-center text-gray-400 dark:text-zinc-500 text-sm">
            Hacé click en "Consultar stock" para calcular el capital inmovilizado en mercadería.
          </div>
        )}

        {stockData && (() => {
          const s = stockData.summary
          const ratio = s.capital_at_cost > 0 ? s.capital_at_retail / s.capital_at_cost : null
          return (
            <>
              {/* KPI row */}
              <div className="grid grid-cols-2 sm:grid-cols-4 divide-x divide-gray-100 dark:divide-zinc-800">
                {[
                  { label: 'Unidades en stock', value: s.total_units.toLocaleString('es-AR'), sub: `${s.units_without_cost > 0 ? s.units_without_cost + ' sin costo → fallback $6.5K' : 'Todos con costo real'}` },
                  { label: 'Capital a costo', value: '$' + Math.round(s.capital_at_cost / 1000) + 'K', sub: 'ARS inmovilizados en merch' },
                  { label: 'Valor a precio venta', value: '$' + Math.round(s.capital_at_retail / 1000) + 'K', sub: 'Si vendés todo el stock' },
                  { label: 'Markup promedio', value: ratio ? ratio.toFixed(2) + 'x' : '—', sub: `${ratio ? Math.round((ratio - 1) * 100) + '% de ganancia bruta sobre costo' : ''}` },
                ].map(k => (
                  <div key={k.label} className="px-4 py-4">
                    <p className="text-[11px] font-medium text-gray-400 dark:text-zinc-500 uppercase tracking-wide mb-1">{k.label}</p>
                    <p className="text-xl font-semibold text-gray-900 dark:text-zinc-100 tabular-nums">{k.value}</p>
                    <p className="text-[11px] text-gray-400 dark:text-zinc-500 mt-0.5">{k.sub}</p>
                  </div>
                ))}
              </div>
              {/* Top products by capital */}
              {stockData.products?.length > 0 && (
                <div className="border-t border-gray-100 dark:border-zinc-800">
                  <div className="px-5 py-2.5 bg-gray-50/60 dark:bg-zinc-800/40">
                    <p className="text-[11px] font-semibold text-gray-400 dark:text-zinc-500 uppercase tracking-wide">
                      Productos — mayor capital inmovilizado
                    </p>
                  </div>
                  <div className="overflow-x-auto">
                    <table className="w-full text-sm">
                      <thead>
                        <tr className="border-b border-gray-100 dark:border-zinc-800">
                          <th className="text-left px-5 py-2 text-xs text-gray-400 dark:text-zinc-500 font-semibold uppercase tracking-wide">Producto</th>
                          <th className="text-right px-4 py-2 text-xs text-gray-400 dark:text-zinc-500 font-semibold uppercase tracking-wide">Unidades</th>
                          <th className="text-right px-4 py-2 text-xs text-gray-400 dark:text-zinc-500 font-semibold uppercase tracking-wide">Cap. costo</th>
                          <th className="text-right px-4 py-2 text-xs text-gray-400 dark:text-zinc-500 font-semibold uppercase tracking-wide">Val. retail</th>
                          <th className="text-right px-4 py-2 text-xs text-gray-400 dark:text-zinc-500 font-semibold uppercase tracking-wide">% total</th>
                        </tr>
                      </thead>
                      <tbody>
                        {/* eslint-disable-next-line @typescript-eslint/no-explicit-any */}
                        {stockData.products.slice(0, 15).map((p: any) => {
                          const pct = s.capital_at_cost > 0 ? (p.capital_at_cost / s.capital_at_cost * 100).toFixed(1) : '—'
                          const barW = s.capital_at_cost > 0 ? Math.round(p.capital_at_cost / s.capital_at_cost * 100) : 0
                          return (
                            <tr key={p.id} className="border-t border-gray-50 dark:border-zinc-800 hover:bg-gray-50/40 dark:hover:bg-zinc-800/30 transition-colors">
                              <td className="px-5 py-3">
                                <div className="flex items-center gap-2">
                                  {!p.has_real_cost && (
                                    <span className="text-[10px] bg-amber-100 dark:bg-amber-950/40 text-amber-700 dark:text-amber-400 px-1.5 py-0.5 rounded font-medium">est.</span>
                                  )}
                                  <span className="text-gray-800 dark:text-zinc-200 font-medium text-sm truncate max-w-[220px]">{p.name}</span>
                                </div>
                                <div className="mt-1 h-1 bg-gray-100 dark:bg-zinc-800 rounded-full overflow-hidden w-full max-w-[200px]">
                                  <div className="h-full bg-sky-400 rounded-full" style={{ width: barW + '%' }} />
                                </div>
                              </td>
                              <td className="px-4 py-3 text-right text-gray-600 dark:text-zinc-300 tabular-nums">{p.units}</td>
                              <td className="px-4 py-3 text-right font-medium text-gray-800 dark:text-zinc-200 tabular-nums">
                                ${Math.round(p.capital_at_cost / 1000)}K
                              </td>
                              <td className="px-4 py-3 text-right text-emerald-600 dark:text-emerald-400 tabular-nums text-xs">
                                {p.capital_at_retail > 0 ? '$' + Math.round(p.capital_at_retail / 1000) + 'K' : '—'}
                              </td>
                              <td className="px-4 py-3 text-right text-gray-400 dark:text-zinc-500 tabular-nums text-xs">{pct}%</td>
                            </tr>
                          )
                        })}
                      </tbody>
                    </table>
                  </div>
                  {stockData.products.length > 15 && (
                    <p className="px-5 py-3 text-xs text-gray-400 dark:text-zinc-500 border-t border-gray-100 dark:border-zinc-800">
                      Mostrando 15 de {stockData.products.length} productos con stock.
                    </p>
                  )}
                </div>
              )}
              <div className="px-5 py-3 border-t border-gray-100 dark:border-zinc-800 text-[11px] text-gray-400 dark:text-zinc-500">
                Consultado: {new Date(stockData.fetched_at).toLocaleString('es-AR')} · Productos con costo estimado: {s.units_without_cost} unidades usan $6.500 de fallback
              </div>
            </>
          )
        })()}
      </div>
    </div>
  )
}
