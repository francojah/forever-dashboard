/** Formatos para pantalla (es-AR). Sin abreviar montos: "$ 526.000", no "$526K". */

export function money(v: number | null | undefined, opts: { sign?: boolean; currency?: string } = {}): string {
  if (v == null || !isFinite(v)) return '—'
  const abs = Math.abs(Math.round(v)).toLocaleString('es-AR')
  const sym = !opts.currency || opts.currency === 'ARS' ? '$' : opts.currency === 'USD' ? 'US$' : opts.currency
  const sign = v < 0 ? '−' : opts.sign && v > 0 ? '+' : ''
  return `${sign}${sym} ${abs}`
}

/** Solo para ejes de gráficos, donde el espacio manda. */
export function moneyAxis(v: number): string {
  const a = Math.abs(v)
  if (a >= 1_000_000) return `$ ${(v / 1_000_000).toLocaleString('es-AR', { maximumFractionDigits: 1 })} M`
  if (a >= 1_000) return `$ ${Math.round(v / 1_000).toLocaleString('es-AR')} mil`
  return `$ ${Math.round(v)}`
}

export function int(v: number | null | undefined): string {
  if (v == null || !isFinite(v)) return '—'
  return Math.round(v).toLocaleString('es-AR')
}

export function pct(v: number | null | undefined, digits = 0): string {
  if (v == null || !isFinite(v)) return '—'
  return `${(v * 100).toLocaleString('es-AR', { minimumFractionDigits: digits, maximumFractionDigits: digits })}%`
}

export function ratio(v: number | null | undefined): string {
  if (v == null || !isFinite(v)) return '—'
  return `${v.toLocaleString('es-AR', { minimumFractionDigits: 1, maximumFractionDigits: 1 })}x`
}

export function delta(v: number | null | undefined): string {
  if (v == null || !isFinite(v)) return ''
  const p = Math.round(v * 100)
  return `${p > 0 ? '+' : p < 0 ? '−' : ''}${Math.abs(p)}%`
}

export function ago(iso: string | null | undefined, now = Date.now()): string {
  if (!iso) return 'nunca'
  const m = Math.round((now - new Date(iso).getTime()) / 60000)
  if (m < 1) return 'recién'
  if (m < 60) return `hace ${m} min`
  const h = Math.round(m / 60)
  if (h < 24) return `hace ${h} h`
  return `hace ${Math.round(h / 24)} d`
}

export function clock(iso: string | null | undefined, tz: string): string {
  if (!iso) return '—'
  return new Date(iso).toLocaleTimeString('es-AR', { hour: '2-digit', minute: '2-digit', timeZone: tz })
}
