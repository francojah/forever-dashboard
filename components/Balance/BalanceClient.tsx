'use client'

import { useState, useMemo, useCallback, useEffect } from 'react'
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

interface RecurringExpense {
  id:         string
  name:       string
  amount_ars: number
  category:   string
  active:     boolean
}

interface MonthData {
  meta_spend: number
  tn_revenue: number
  tn_orders:  number
  tn_units:   number
  source:     'live' | 'saved' | 'empty'
}

interface PnL {
  tn_revenue:      number
  merch:           number
  shipping:        number
  platform:        number
  packaging:       number
  cuotas_cost:     number
  cogs:            number
  gross_profit:    number
  meta_spend:      number
  ad_result:       number
  recurring_total: number
  var_total:       number
  iibb_cost:       number
  net_result:      number
  margin_gross:    number
  margin_net:      number
  roi_ads:         number  // net_result / meta_spend × 100
  roi_negocio:     number  // net_result / total_invested × 100
  tn_orders:       number
  tn_units:        number
  aov:             number
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

function calcPnL(data: MonthData, varExpenses: Expense[], recurringTotal = 0, cuotasCostPct = 0, iibbRatePct = 0): PnL {
  const { tn_revenue, meta_spend, tn_orders, tn_units } = data
  const aov         = tn_orders > 0 ? tn_revenue / tn_orders : AOV_DEFAULT
  const units       = tn_units > 0 ? tn_units : tn_orders * UNITS_PER_ORDER
  const merch       = units * UNIT_COST
  const shipping    = tn_revenue * SHIPPING_PCT
  const platform    = tn_revenue * PLATFORM_PCT
  const packaging   = tn_orders * PACKAGING_PER_ORD
  const cuotas_cost = tn_revenue * (cuotasCostPct / 100)
  const cogs        = merch + shipping + platform + packaging + cuotas_cost
  const gross_profit = tn_revenue - cogs
  const ad_result    = gross_profit - meta_spend
  const var_total    = varExpenses.reduce((s, e) => s + e.amount_ars, 0)
  const iibb_cost    = tn_revenue * (iibbRatePct / 100)
  const net_result   = ad_result - recurringTotal - var_total - iibb_cost
  const total_invested = cogs + meta_spend + recurringTotal + var_total + iibb_cost
  const roi_ads        = meta_spend > 0 ? (net_result / meta_spend) * 100 : 0
  const roi_negocio    = total_invested > 0 ? (net_result / total_invested) * 100 : 0
  return {
    tn_revenue, merch, shipping, platform, packaging, cuotas_cost, cogs,
    gross_profit, meta_spend, ad_result,
    recurring_total: recurringTotal, var_total, iibb_cost, net_result,
    margin_gross: tn_revenue > 0 ? gross_profit / tn_revenue : 0,
    margin_net:   tn_revenue > 0 ? net_result   / tn_revenue : 0,
    roi_ads, roi_negocio,
    tn_orders, tn_units: units, aov,
  }
}

function aggregatePnL(months: MonthData[], allExpenses: Expense[], keys: string[], recurringTotal = 0, cuotasCostPct = 0, iibbRatePct = 0): PnL {
  const merged: MonthData = { meta_spend: 0, tn_revenue: 0, tn_orders: 0, tn_units: 0, source: 'live' }
  months.forEach(m => {
    merged.meta_spend += m.meta_spend
    merged.tn_revenue += m.tn_revenue
    merged.tn_orders  += m.tn_orders
    merged.tn_units   += m.tn_units
  })
  const expenses = allExpenses.filter(e => keys.includes(e.month))
  return calcPnL(merged, expenses, recurringTotal, cuotasCostPct, iibbRatePct)
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

  // Gastos fijos recurrentes
  const [recurringExpenses, setRecurringExpenses] = useState<RecurringExpense[]>([])

  useEffect(() => {
    fetch('/api/recurring-expenses')
      .then(r => r.json())
      .then(d => { if (Array.isArray(d)) setRecurringExpenses(d) })
      .catch(() => { /* silent */ })
  }, [])

  // Costos fiscales (cuotas + IIBB) — cargados desde /api/settings
  const [cuotasCostPct, setCuotasCostPct] = useState(0)
  const [iibbRatePct,   setIibbRatePct]   = useState(0)

  useEffect(() => {
    fetch('/api/settings')
      .then(r => r.json())
      .then(d => {
        if (d.cuotas_cost_pct != null) setCuotasCostPct(Number(d.cuotas_cost_pct))
        if (d.iibb_rate_pct   != null) setIibbRatePct(Number(d.iibb_rate_pct))
      })
      .catch(() => { /* silent */ })
  }, [])

  // Capital en inventario — stock de TN + costos manuales
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const [stockProducts,  setStockProducts]  = useState<{ id: string|number; name: string; total_units: number }[] | null>(null)
  const [loadingStock,   setLoadingStock]   = useState(false)
  const [stockError,     setStockError]     = useState<string | null>(null)
  const [productCosts,   setProductCosts]   = useState<Record<string, number>>({})   // product_id → unit_cost
  const [costsEdited,    setCostsEdited]    = useState<Record<string, number>>({})   // unsaved edits
  const [savingCosts,    setSavingCosts]    = useState(false)

  // Load saved costs on mount
  useEffect(() => {
    fetch('/api/product-costs')
      .then(r => r.json())
      .then((rows: { product_id: string; unit_cost: number }[]) => {
        if (!Array.isArray(rows)) return
        const map: Record<string, number> = {}
        rows.forEach(r => { map[String(r.product_id)] = r.unit_cost })
        setProductCosts(map)
      })
      .catch(() => { /* silent */ })
  }, [])

  async function handleFetchStock() {
    setLoadingStock(true); setStockError(null)
    try {
      const r = await fetch('/api/tn-stock')
      const j = await r.json()
      if (!r.ok) throw new Error(j.error ?? 'Error al consultar stock')
      setStockProducts(j.products ?? [])
    } catch (e) { setStockError(e instanceof Error ? e.message : 'Error desconocido') }
    finally { setLoadingStock(false) }
  }

  async function handleSaveCosts() {
    setSavingCosts(true)
    try {
      const prods = stockProducts ?? []
      await Promise.all(
        Object.entries(costsEdited).map(([pid, cost]) => {
          const prod = prods.find(p => String(p.id) === pid)
          return fetch('/api/product-costs', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ product_id: pid, product_name: prod?.name ?? '', unit_cost: cost }),
          })
        })
      )
      setProductCosts(prev => ({ ...prev, ...costsEdited }))
      setCostsEdited({})
    } catch { /* silent */ }
    setSavingCosts(false)
  }

  function getCost(pid: string|number): number {
    const key = String(pid)
    return costsEdited[key] ?? productCosts[key] ?? 0
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

  // ── Recurring expenses monthly total ──────────────────────────────────────
  const recurringMonthTotal = useMemo(
    () => recurringExpenses.filter(x => x.active).reduce((s, x) => s + x.amount_ars, 0),
    [recurringExpenses]
  )
  const activeRecurring = useMemo(
    () => recurringExpenses.filter(x => x.active),
    [recurringExpenses]
  )

  // ── P&L for selected period ────────────────────────────────────────────────
  const pnl = useMemo(() => {
    const datas = periodKeys.map(k => getMonthData(k))
    return aggregatePnL(datas, expenses, periodKeys, recurringMonthTotal * periodKeys.length, cuotasCostPct, iibbRatePct)
  }, [periodKeys, getMonthData, expenses, recurringMonthTotal, cuotasCostPct, iibbRatePct])

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
      const p    = calcPnL(data, exp, recurringMonthTotal, cuotasCostPct, iibbRatePct)
      return { m, key, data, pnl: p }
    }), [year, getMonthData, expenses, recurringMonthTotal, cuotasCostPct, iibbRatePct])

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

      {/* ── ROI Cards ──────────────────────────────────────────────────────── */}
      {hasData && (
        <div className="grid grid-cols-2 gap-3">
          <div className="rounded-xl border border-gray-100 dark:border-zinc-800 border-l-[3px] border-l-violet-400 p-4 shadow-sm">
            <p className="text-[11px] font-semibold text-gray-400 dark:text-zinc-500 uppercase tracking-wider mb-1">ROI publicitario</p>
            <p className={`text-2xl font-bold tabular-nums leading-none ${pnl.roi_ads >= 0 ? 'text-emerald-600 dark:text-emerald-400' : 'text-red-500'}`}>
              {pnl.roi_ads >= 0 ? '+' : ''}{pnl.roi_ads.toFixed(0)}%
            </p>
            <p className="text-[11px] text-gray-400 dark:text-zinc-500 mt-1.5">
              Resultado neto ÷ gasto Meta · {pnl.meta_spend > 0 ? `por cada $100 invertido en ads, retornás $${(100 + pnl.roi_ads).toFixed(0)}` : 'sin datos de ads'}
            </p>
          </div>
          <div className="rounded-xl border border-gray-100 dark:border-zinc-800 border-l-[3px] border-l-sky-400 p-4 shadow-sm">
            <p className="text-[11px] font-semibold text-gray-400 dark:text-zinc-500 uppercase tracking-wider mb-1">ROI del negocio</p>
            <p className={`text-2xl font-bold tabular-nums leading-none ${pnl.roi_negocio >= 0 ? 'text-emerald-600 dark:text-emerald-400' : 'text-red-500'}`}>
              {pnl.roi_negocio >= 0 ? '+' : ''}{pnl.roi_negocio.toFixed(0)}%
            </p>
            <p className="text-[11px] text-gray-400 dark:text-zinc-500 mt-1.5">
              Resultado neto ÷ total invertido (CMV + ads + gastos)
            </p>
          </div>
        </div>
      )}

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
            {cuotasCostPct > 0 && (
              <PnLRow label={`Costo financiero cuotas (${cuotasCostPct}%)`} value={-pnl.cuotas_cost}
                pctVal={pnl.tn_revenue > 0 ? pnl.cuotas_cost / pnl.tn_revenue : 0}
                note="Descuento del procesador de pagos por ventas en cuotas"
                indent />
            )}
            <PnLRow isSeparator label="" value={null} />
            <PnLRow label="= Ganancia bruta" value={pnl.gross_profit} isSubtotal
              note={`Margen: ${pct(Math.abs(pnl.margin_gross))}`} />
            <PnLRow label="Gasto Meta Ads" value={-pnl.meta_spend}
              pctVal={pnl.tn_revenue > 0 ? pnl.meta_spend / pnl.tn_revenue : 0} indent />
            <PnLRow isSeparator label="" value={null} />
            <PnLRow label="= Resultado publicidad" value={pnl.ad_result} isSubtotal
              note={pnl.tn_revenue > 0 ? `${pct(Math.abs(pnl.ad_result / pnl.tn_revenue))} de ventas` : undefined} />
            {/* Gastos fijos recurrentes */}
            {activeRecurring.length > 0 && activeRecurring.map(re => {
              const monthsCount = periodKeys.length
              const totalAmt = re.amount_ars * monthsCount
              return (
                <PnLRow key={re.id}
                  label={re.name + (monthsCount > 1 ? ` ×${monthsCount}m` : '')}
                  value={-totalAmt}
                  pctVal={pnl.tn_revenue > 0 ? totalAmt / pnl.tn_revenue : 0}
                  note={`Fijo · $${(re.amount_ars / 1000).toFixed(0)}K/mes`}
                  indent />
              )
            })}
            {/* Gastos variables */}
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
            {/* Carga impositiva */}
            {iibbRatePct > 0 && (
              <PnLRow label={`IIBB sobre ventas (${iibbRatePct}%)`} value={-pnl.iibb_cost}
                pctVal={pnl.tn_revenue > 0 ? pnl.iibb_cost / pnl.tn_revenue : 0}
                note="Ingresos Brutos · calculado sobre ventas brutas"
                indent />
            )}
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
              Stock desde Tiendanube · ingresá el costo por unidad manualmente
            </p>
          </div>
          <div className="flex items-center gap-2 shrink-0">
            {Object.keys(costsEdited).length > 0 && (
              <button
                onClick={handleSaveCosts}
                disabled={savingCosts}
                className="flex items-center gap-1.5 text-xs font-medium bg-emerald-600 hover:bg-emerald-700 disabled:bg-emerald-400 text-white rounded-lg px-3 py-2 transition-colors"
              >
                {savingCosts ? 'Guardando…' : `Guardar costos (${Object.keys(costsEdited).length})`}
              </button>
            )}
            <button
              onClick={handleFetchStock}
              disabled={loadingStock}
              className="flex items-center gap-2 text-xs font-medium bg-sky-600 hover:bg-sky-700 disabled:bg-sky-400 text-white rounded-lg px-3.5 py-2 transition-colors"
            >
              {loadingStock ? (
                <><svg className="w-3.5 h-3.5 animate-spin" viewBox="0 0 24 24" fill="none"><circle cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="3" strokeDasharray="60" strokeDashoffset="20"/></svg>Consultando…</>
              ) : stockProducts ? 'Actualizar stock' : 'Consultar stock'}
            </button>
          </div>
        </div>

        {stockError && (
          <div className="px-5 py-4 text-sm text-red-600 dark:text-red-400 bg-red-50 dark:bg-red-950/20">{stockError}</div>
        )}

        {!stockProducts && !stockError && (
          <div className="px-5 py-10 text-center text-gray-400 dark:text-zinc-500 text-sm">
            Hacé click en &quot;Consultar stock&quot; para cargar las unidades desde Tiendanube.
          </div>
        )}

        {stockProducts && (() => {
          const totalCapital = stockProducts.reduce((s, p) => s + p.total_units * getCost(p.id), 0)
          const pendingCost  = stockProducts.filter(p => getCost(p.id) === 0).length
          return (
            <>
              {/* Summary KPIs */}
              <div className="grid grid-cols-3 divide-x divide-gray-100 dark:divide-zinc-800">
                <div className="px-5 py-4">
                  <p className="text-[11px] font-medium text-gray-400 dark:text-zinc-500 uppercase tracking-wide mb-1">Unidades en stock</p>
                  <p className="text-xl font-semibold text-gray-900 dark:text-zinc-100 tabular-nums">
                    {stockProducts.reduce((s, p) => s + p.total_units, 0).toLocaleString('es-AR')}
                  </p>
                  <p className="text-[11px] text-gray-400 dark:text-zinc-500 mt-0.5">{stockProducts.length} productos</p>
                </div>
                <div className="px-5 py-4">
                  <p className="text-[11px] font-medium text-gray-400 dark:text-zinc-500 uppercase tracking-wide mb-1">Capital a costo</p>
                  <p className="text-xl font-semibold text-gray-900 dark:text-zinc-100 tabular-nums">
                    {totalCapital > 0 ? '$' + Math.round(totalCapital / 1000) + 'K' : '—'}
                  </p>
                  <p className="text-[11px] text-gray-400 dark:text-zinc-500 mt-0.5">ARS inmovilizados</p>
                </div>
                <div className="px-5 py-4">
                  <p className="text-[11px] font-medium text-gray-400 dark:text-zinc-500 uppercase tracking-wide mb-1">Sin costo</p>
                  <p className={`text-xl font-semibold tabular-nums ${pendingCost > 0 ? 'text-amber-500' : 'text-emerald-600 dark:text-emerald-400'}`}>
                    {pendingCost}
                  </p>
                  <p className="text-[11px] text-gray-400 dark:text-zinc-500 mt-0.5">
                    {pendingCost > 0 ? 'productos sin costo ingresado' : 'Todos con costo cargado'}
                  </p>
                </div>
              </div>

              {/* Products table with editable cost */}
              <div className="border-t border-gray-100 dark:border-zinc-800 overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="bg-gray-50/60 dark:bg-zinc-800/40 border-b border-gray-100 dark:border-zinc-800">
                      <th className="text-left px-5 py-2.5 text-xs text-gray-400 dark:text-zinc-500 font-semibold uppercase tracking-wide">Producto</th>
                      <th className="text-right px-4 py-2.5 text-xs text-gray-400 dark:text-zinc-500 font-semibold uppercase tracking-wide">Stock</th>
                      <th className="text-right px-4 py-2.5 text-xs text-gray-400 dark:text-zinc-500 font-semibold uppercase tracking-wide">Costo/un (ARS)</th>
                      <th className="text-right px-4 py-2.5 text-xs text-gray-400 dark:text-zinc-500 font-semibold uppercase tracking-wide">Capital</th>
                    </tr>
                  </thead>
                  <tbody>
                    {stockProducts.map(p => {
                      const key      = String(p.id)
                      const cost     = getCost(p.id)
                      const capital  = p.total_units * cost
                      const isEdited = key in costsEdited
                      const barW     = totalCapital > 0 ? Math.round(capital / totalCapital * 100) : 0
                      return (
                        <tr key={key} className="border-t border-gray-50 dark:border-zinc-800 hover:bg-gray-50/40 dark:hover:bg-zinc-800/30 transition-colors">
                          <td className="px-5 py-3">
                            <span className="text-gray-800 dark:text-zinc-200 font-medium text-sm truncate max-w-[200px] block">{p.name}</span>
                            {capital > 0 && (
                              <div className="mt-1 h-1 bg-gray-100 dark:bg-zinc-800 rounded-full overflow-hidden w-full max-w-[200px]">
                                <div className="h-full bg-sky-400 rounded-full" style={{ width: barW + '%' }} />
                              </div>
                            )}
                          </td>
                          <td className="px-4 py-3 text-right text-gray-600 dark:text-zinc-300 tabular-nums">{p.total_units}</td>
                          <td className="px-4 py-3 text-right">
                            <div className="flex items-center justify-end gap-1">
                              {isEdited && <span className="w-1.5 h-1.5 rounded-full bg-amber-400 shrink-0" />}
                              <input
                                type="number"
                                min="0"
                                step="500"
                                placeholder="0"
                                value={costsEdited[key] ?? (productCosts[key] || '')}
                                onChange={e => {
                                  const v = parseFloat(e.target.value) || 0
                                  setCostsEdited(prev => ({ ...prev, [key]: v }))
                                }}
                                className="w-28 text-right text-sm bg-gray-50 dark:bg-zinc-800 border border-gray-200 dark:border-zinc-700 rounded-lg px-2 py-1 text-gray-900 dark:text-zinc-100 focus:outline-none focus:ring-2 focus:ring-sky-400 tabular-nums"
                              />
                            </div>
                          </td>
                          <td className="px-4 py-3 text-right font-semibold tabular-nums">
                            {capital > 0
                              ? <span className="text-gray-800 dark:text-zinc-200">${Math.round(capital / 1000)}K</span>
                              : <span className="text-gray-300 dark:text-zinc-700">—</span>
                            }
                          </td>
                        </tr>
                      )
                    })}
                  </tbody>
                  {totalCapital > 0 && (
                    <tfoot>
                      <tr className="border-t-2 border-gray-200 dark:border-zinc-700 bg-gray-50/80 dark:bg-zinc-800/50">
                        <td colSpan={3} className="px-5 py-3 text-xs font-semibold text-gray-500 dark:text-zinc-400 uppercase tracking-wide">Total capital inmovilizado</td>
                        <td className="px-4 py-3 text-right font-bold text-lg text-sky-600 dark:text-sky-400 tabular-nums">${Math.round(totalCapital / 1000)}K</td>
                      </tr>
                    </tfoot>
                  )}
                </table>
              </div>
              {pendingCost > 0 && (
                <p className="px-5 py-3 text-[11px] text-amber-600 dark:text-amber-400 border-t border-gray-100 dark:border-zinc-800">
                  {pendingCost} producto{pendingCost > 1 ? 's' : ''} sin costo ingresado. Completalos para calcular el capital total.
                </p>
              )}
            </>
          )
        })()}
      </div>
    </div>
  )
}
