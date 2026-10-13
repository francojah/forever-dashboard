import { unstable_cache } from 'next/cache'

/**
 * Inflación (INDEC, mensual) y dólar MEP (diario) para ver los números en pesos de hoy o en dólares.
 * Fuente: API pública de argentinadatos.com. Se cachea 12 horas; si no responde, Faro sigue en pesos corrientes.
 */

export type MoneyMode = 'nominal' | 'real' | 'usd'
export interface Macro { ipc: Record<string, number>; ipcLatest: string | null; mep: Record<string, number>; mepLast: { date: string; value: number } | null }

async function getJson<T>(url: string): Promise<T | null> {
  try {
    const ctrl = new AbortController()
    const t = setTimeout(() => ctrl.abort(), 8000)
    const r = await fetch(url, { signal: ctrl.signal, cache: 'no-store' })
    clearTimeout(t)
    return r.ok ? ((await r.json()) as T) : null
  } catch { return null }
}

/** Convierte las variaciones mensuales en un índice acumulado por mes (YYYY-MM). Pura. */
export function buildIndex(rows: { fecha: string; valor: number }[]): { ipc: Record<string, number>; latest: string | null } {
  const sorted = [...rows].filter((r) => r && typeof r.valor === 'number' && /^\d{4}-\d{2}/.test(r.fecha)).sort((a, b) => a.fecha.localeCompare(b.fecha))
  const ipc: Record<string, number> = {}
  let idx = 100
  for (const r of sorted) { idx *= 1 + r.valor / 100; ipc[r.fecha.slice(0, 7)] = idx }
  return { ipc, latest: sorted.length ? sorted[sorted.length - 1].fecha.slice(0, 7) : null }
}

/** Promedio mensual del dólar MEP (venta). Pura. */
export function monthlyAvg(rows: { fecha: string; venta: number }[]): { mep: Record<string, number>; last: { date: string; value: number } | null } {
  const acc: Record<string, { s: number; n: number }> = {}
  let last: { date: string; value: number } | null = null
  for (const r of rows) {
    if (!r || !(r.venta > 0) || !/^\d{4}-\d{2}-\d{2}$/.test(r.fecha)) continue
    const m = r.fecha.slice(0, 7)
    acc[m] = acc[m] || { s: 0, n: 0 }
    acc[m].s += r.venta; acc[m].n++
    if (!last || r.fecha > last.date) last = { date: r.fecha, value: r.venta }
  }
  return { mep: Object.fromEntries(Object.entries(acc).map(([m, v]) => [m, v.s / v.n])), last }
}

export const loadMacro = unstable_cache(async (): Promise<Macro | null> => {
  const [inf, mep] = await Promise.all([
    getJson<{ fecha: string; valor: number }[]>('https://api.argentinadatos.com/v1/finanzas/indices/inflacion'),
    getJson<{ fecha: string; venta: number }[]>('https://api.argentinadatos.com/v1/cotizaciones/dolares/bolsa'),
  ])
  if (!inf && !mep) return null
  const i = buildIndex(inf || [])
  const d = monthlyAvg(mep || [])
  return { ipc: i.ipc, ipcLatest: i.latest, mep: d.mep, mepLast: d.last }
}, ['faro-macro-v1'], { revalidate: 43200 })

export interface Adjuster { mode: MoneyMode; currency: 'ARS' | 'USD'; factor: (month: string) => number; label: string; note: string | null }

const MONTHS = ['enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio', 'julio', 'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre']
const mLabel = (m: string) => `${MONTHS[Number(m.slice(5)) - 1]} ${m.slice(0, 4)}`

/** Factor por mes para pasar montos de un mes a pesos de hoy o a dólares. Pura. */
export function makeAdjuster(mode: MoneyMode, macro: Macro | null): Adjuster {
  const nominal: Adjuster = { mode: 'nominal', currency: 'ARS', factor: () => 1, label: 'Pesos de cada mes', note: null }
  if (!macro || mode === 'nominal') return nominal
  if (mode === 'real') {
    if (!macro.ipcLatest) return nominal
    const base = macro.ipc[macro.ipcLatest]
    const keys = Object.keys(macro.ipc).sort()
    return {
      mode, currency: 'ARS', label: `Pesos de ${mLabel(macro.ipcLatest)}`,
      note: `Ajustado por inflación (INDEC) a pesos de ${mLabel(macro.ipcLatest)}, el último dato publicado. Los meses posteriores quedan sin ajustar.`,
      factor: (m) => {
        if (m >= macro.ipcLatest!) return 1
        const k = macro.ipc[m] ?? macro.ipc[keys.filter((x) => x <= m).pop() || ''] ?? null
        return k ? base / k : 1
      },
    }
  }
  const keys = Object.keys(macro.mep).sort()
  if (!keys.length) return nominal
  return {
    mode, currency: 'USD', label: 'Dólar MEP',
    note: `Cada mes convertido al dólar MEP promedio de ese mes${macro.mepLast ? ` (último: $ ${Math.round(macro.mepLast.value).toLocaleString('es-AR')} el ${macro.mepLast.date.slice(8, 10)}/${macro.mepLast.date.slice(5, 7)})` : ''}.`,
    factor: (m) => {
      const v = macro.mep[m] ?? macro.mep[keys.filter((x) => x <= m).pop() || keys[0]]
      return v ? 1 / v : 1
    },
  }
}

export function parseMode(v: string | undefined): MoneyMode {
  return v === 'real' || v === 'usd' ? v : 'nominal'
}
