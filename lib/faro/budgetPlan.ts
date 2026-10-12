/** Plan de inversión mensual: cuánto llevás gastado, a qué ritmo y qué presupuesto diario cierra el mes en el plan. */

export interface PlanPacing {
  month: string
  plan: number
  spent: number              // gastado del 1 a hoy (incluye hoy parcial)
  daysInMonth: number
  daysElapsed: number        // días completos + fracción de hoy
  expected: number           // lo que deberías llevar a ritmo parejo
  forecast: number           // proyección de cierre al ritmo actual
  dailyNeeded: number        // presupuesto diario para terminar en el plan
  dailyNow: number           // suma de presupuestos diarios activos
  status: 'ok' | 'over' | 'under'
}

export function monthOf(date: string) { return date.slice(0, 7) }

export function planPacing(o: { plan: number; spent: number; today: string; hourShare: number; dailyNow: number }): PlanPacing {
  const [y, m] = o.today.split('-').map(Number)
  const daysInMonth = new Date(Date.UTC(y, m, 0)).getUTCDate()
  const day = Number(o.today.slice(8, 10))
  const daysElapsed = Math.max(0.25, day - 1 + Math.min(1, Math.max(0, o.hourShare)))
  const expected = o.plan * (daysElapsed / daysInMonth)
  const forecast = (o.spent / daysElapsed) * daysInMonth
  const daysLeft = Math.max(0.25, daysInMonth - daysElapsed)
  const dailyNeeded = Math.max(0, (o.plan - o.spent) / daysLeft)
  const ratio = o.plan > 0 ? forecast / o.plan : 1
  return {
    month: monthOf(o.today), plan: o.plan, spent: o.spent, daysInMonth, daysElapsed, expected, forecast, dailyNeeded, dailyNow: o.dailyNow,
    status: ratio > 1.07 ? 'over' : ratio < 0.93 ? 'under' : 'ok',
  }
}
