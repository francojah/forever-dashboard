/**
 * export.ts — Utilidades de exportación (CSV / PDF) sin dependencias externas.
 *
 * CSV: se genera en el cliente y se descarga como Blob.
 * PDF: se usa la impresión del navegador (window.print) sobre una vista
 *      aislada — cero dependencias y respeta estilos. Para PDFs server-side
 *      más elaborados se puede sumar luego una lib, pero esto cubre el 90%.
 */

type Row = Record<string, unknown>

/** Escapa un valor para CSV (comillas, comas, saltos de línea). */
function escapeCsv(value: unknown): string {
  if (value == null) return ''
  const s = String(value)
  if (/[",\n;]/.test(s)) return '"' + s.replace(/"/g, '""') + '"'
  return s
}

/**
 * Convierte filas a CSV. `columns` permite elegir/ordenar/renombrar columnas:
 *   [{ key: 'name', label: 'Nombre' }, { key: 'spend', label: 'Gasto' }]
 * Si se omite, usa las keys de la primera fila.
 */
export function toCSV(
  rows: Row[],
  columns?: { key: string; label?: string }[]
): string {
  if (!rows.length) return ''
  const cols: { key: string; label?: string }[] =
    columns ?? Object.keys(rows[0]).map((k) => ({ key: k }))
  const header = cols.map((c) => escapeCsv(c.label ?? c.key)).join(',')
  const body = rows
    .map((r) => cols.map((c) => escapeCsv(r[c.key])).join(','))
    .join('\n')
  // BOM para que Excel abra bien los acentos
  return '﻿' + header + '\n' + body
}

/** Descarga un string como archivo. */
export function downloadFile(content: string, filename: string, mime = 'text/csv;charset=utf-8') {
  const blob = new Blob([content], { type: mime })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = filename
  document.body.appendChild(a)
  a.click()
  document.body.removeChild(a)
  URL.revokeObjectURL(url)
}

/** Atajo: exporta filas a CSV y dispara la descarga. */
export function exportCSV(
  rows: Row[],
  filename: string,
  columns?: { key: string; label?: string }[]
) {
  const stamp = new Date().toISOString().split('T')[0]
  const name = filename.endsWith('.csv') ? filename : `${filename}_${stamp}.csv`
  downloadFile(toCSV(rows, columns), name)
}

/**
 * Exporta a PDF un elemento del DOM usando la impresión del navegador.
 * Abre una ventana con solo ese contenido + estilos mínimos y llama a print().
 */
export function exportElementToPDF(el: HTMLElement | null, title = 'Reporte') {
  if (!el) return
  const win = window.open('', '_blank', 'width=1000,height=800')
  if (!win) return
  const styles = Array.from(document.querySelectorAll('style, link[rel="stylesheet"]'))
    .map((n) => n.outerHTML)
    .join('\n')
  win.document.write(`<!doctype html><html><head><title>${title}</title>${styles}
    <style>@media print{body{-webkit-print-color-adjust:exact;print-color-adjust:exact}}
    body{padding:24px;font-family:system-ui,sans-serif}</style></head>
    <body>${el.outerHTML}</body></html>`)
  win.document.close()
  win.focus()
  setTimeout(() => {
    win.print()
    win.close()
  }, 400)
}
