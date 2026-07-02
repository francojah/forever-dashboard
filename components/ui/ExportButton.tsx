'use client'

import { exportCSV } from '@/lib/export'

type Column = { key: string; label?: string }

interface Props {
  rows: Record<string, unknown>[]
  filename: string
  columns?: Column[]
  label?: string
  className?: string
}

/**
 * Botón reutilizable para exportar cualquier tabla a CSV.
 * Uso:
 *   <ExportButton rows={adsets} filename="adsets" columns={[
 *     { key: 'name', label: 'Ad set' },
 *     { key: 'spend', label: 'Gasto' },
 *     { key: 'cost_per_result', label: 'CPA' },
 *   ]} />
 */
export function ExportButton({ rows, filename, columns, label = 'Exportar CSV', className }: Props) {
  const disabled = !rows || rows.length === 0
  return (
    <button
      onClick={() => exportCSV(rows, filename, columns)}
      disabled={disabled}
      className={
        className ??
        'inline-flex items-center gap-1.5 rounded-lg border border-gray-200 dark:border-zinc-700 ' +
          'bg-white dark:bg-zinc-900 px-3 py-1.5 text-xs font-medium text-gray-700 dark:text-zinc-200 ' +
          'hover:bg-gray-50 dark:hover:bg-zinc-800 disabled:opacity-40 disabled:cursor-not-allowed transition'
      }
      title={disabled ? 'No hay datos para exportar' : 'Descargar como CSV'}
    >
      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
        <polyline points="7 10 12 15 17 10" />
        <line x1="12" y1="15" x2="12" y2="3" />
      </svg>
      {label}
    </button>
  )
}
