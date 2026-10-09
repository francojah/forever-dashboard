/**
 * Períodos en la zona horaria del espacio de trabajo.
 * Todo se maneja como fechas 'YYYY-MM-DD' locales + instantes UTC para filtrar órdenes.
 */

export type PeriodKey = 'today' | 'yesterday' | '7d' | '30d' | 'mtd' | 'lastmonth' | 'custom'

export const PERIOD_LABELS: Record<PeriodKey, string> = {
  today: 'Hoy',
  yesterday: 'Ayer',
  '7d': '7 días',
  '30d': '30 días',
  mtd: 'Este mes',
  lastmonth: 'Mes pasado',
  custom: 'Rango',
}

export interface Period {
  key: PeriodKey
  from: string        // YYYY-MM-DD inclusive (local)
  to: string          // YYYY-MM-DD inclusive (local)
  days: number
  label: string
  /** Para "hoy": comparar contra ayer hasta la misma hora (fracción del día transcurrida) */
  partialDayFraction?: number
}

/** Fecha local YYYY-MM-DD de un instante en una zona horaria. */
export function localDate(d: Date, tz: string): string {
  const parts = new Intl.DateTimeFormat('en-CA', { timeZone: tz, year: 'numeric', month: '2-digit', day: '2-digit' }).formatToParts(d)
  const get = (t: string) => parts.find((p) => p.type === t)?.value || '00'
  return `${get('year')}-${get('month')}-${get('day')}`
}

/** Minutos desde medianoche local. */
export function localMinutes(d: Date, tz: string): number {
  const parts = new Intl.DateTimeFormat('en-GB', { timeZone: tz, hour: '2-digit', minute: '2-digit', hourCycle: 'h23' }).formatToParts(d)
  const h = Number(parts.find((p) => p.type === 'hour')?.value || 0)
  const m = Number(parts.find((p) => p.type === 'minute')?.value || 0)
  return h * 60 + m
}

/** Offset de la zona horaria en minutos para un instante (ej: -180 para Argentina). */
export function tzOffsetMinutes(d: Date, tz: string): number {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: tz, hourCycle: 'h23', year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', second: '2-digit',
  }).formatToParts(d)
  const g = (t: string) => Number(parts.find((p) => p.type === t)?.value || 0)
  const asUTC = Date.UTC(g('year'), g('month') - 1, g('day'), g('hour'), g('minute'), g('second'))
  return Math.round((asUTC - d.getTime()) / 60000)
}

/** Instante UTC (ISO) del inicio del día local `ymd`. */
export function startOfLocalDayUTC(ymd: string, tz: string): string {
  const guess = new Date(`${ymd}T00:00:00Z`)
  const off = tzOffsetMinutes(guess, tz)
  return new Date(guess.getTime() - off * 60000).toISOString()
}

export function addDays(ymd: string, n: number): string {
  const d = new Date(`${ymd}T12:00:00Z`)
  d.setUTCDate(d.getUTCDate() + n)
  return d.toISOString().slice(0, 10)
}

export function daysBetween(from: string, to: string): number {
  return Math.round((Date.parse(`${to}T12:00:00Z`) - Date.parse(`${from}T12:00:00Z`)) / 86400000) + 1
}

export function eachDay(from: string, to: string): string[] {
  const out: string[] = []
  for (let d = from; d <= to; d = addDays(d, 1)) out.push(d)
  return out
}

export function monthKey(ymd: string): string {
  return ymd.slice(0, 7)
}

export function monthRange(month: string): { from: string; to: string } {
  const [y, m] = month.split('-').map(Number)
  const from = `${month}-01`
  const last = new Date(Date.UTC(y, m, 0)).getUTCDate()
  return { from, to: `${month}-${String(last).padStart(2, '0')}` }
}

const MONTHS = ['enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio', 'julio', 'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre']
export function monthLabel(month: string): string {
  const [y, m] = month.split('-').map(Number)
  const name = MONTHS[m - 1] || ''
  return `${name.charAt(0).toUpperCase()}${name.slice(1)} ${y}`
}

export function shortDay(ymd: string): string {
  const [, m, d] = ymd.split('-').map(Number)
  return `${d}/${m}`
}

export function resolvePeriod(key: PeriodKey, tz: string, now = new Date(), custom?: { from?: string; to?: string }): Period {
  const today = localDate(now, tz)
  const frac = localMinutes(now, tz) / 1440
  switch (key) {
    case 'today':
      return { key, from: today, to: today, days: 1, label: 'Hoy', partialDayFraction: frac }
    case 'yesterday': {
      const y = addDays(today, -1)
      return { key, from: y, to: y, days: 1, label: 'Ayer' }
    }
    case '30d':
      return { key, from: addDays(today, -29), to: today, days: 30, label: 'Últimos 30 días' }
    case 'mtd': {
      const from = `${today.slice(0, 7)}-01`
      return { key, from, to: today, days: daysBetween(from, today), label: 'Este mes' }
    }
    case 'lastmonth': {
      const firstThis = `${today.slice(0, 7)}-01`
      const lastPrev = addDays(firstThis, -1)
      const from = `${lastPrev.slice(0, 7)}-01`
      return { key, from, to: lastPrev, days: daysBetween(from, lastPrev), label: 'Mes pasado' }
    }
    case 'custom': {
      let from = custom?.from && /^\d{4}-\d{2}-\d{2}$/.test(custom.from) ? custom.from : addDays(today, -6)
      let to = custom?.to && /^\d{4}-\d{2}-\d{2}$/.test(custom.to) ? custom.to : today
      if (from > to) [from, to] = [to, from]
      if (to > today) to = today
      return { key, from, to, days: daysBetween(from, to), label: `${shortDay(from)} – ${shortDay(to)}` }
    }
    case '7d':
    default:
      return { key: '7d', from: addDays(today, -6), to: today, days: 7, label: 'Últimos 7 días' }
  }
}

/** Período anterior de igual duración (para "hoy": ayer, recortado a la misma hora). */
export function previousPeriod(p: Period): Period {
  if (p.key === 'mtd') {
    // mismo tramo del mes anterior (días 1..N)
    const firstThis = p.from
    const lastPrev = addDays(firstThis, -1)
    const from = `${lastPrev.slice(0, 7)}-01`
    const to = addDays(from, Math.min(p.days, daysBetween(from, lastPrev)) - 1)
    return { key: 'custom', from, to, days: daysBetween(from, to), label: 'mismo tramo del mes anterior' }
  }
  const to = addDays(p.from, -1)
  const from = addDays(to, -(p.days - 1))
  return {
    key: 'custom', from, to, days: p.days,
    label: p.key === 'today' ? 'ayer a esta hora' : p.key === 'yesterday' ? 'anteayer' : 'período anterior',
    partialDayFraction: p.partialDayFraction,
  }
}

export function parsePeriodKey(v: string | undefined | null): PeriodKey {
  const k = (v || '') as PeriodKey
  return (['today', 'yesterday', '7d', '30d', 'mtd', 'lastmonth', 'custom'] as PeriodKey[]).includes(k) ? k : '7d'
}
