/**
 * Skeleton — Placeholder de carga con shimmer. Reemplaza los textos "Cargando..."
 * por bloques que anticipan el layout (percepción de velocidad + look pro).
 */
export function Skeleton({ className = '' }: { className?: string }) {
  return <div className={'animate-pulse rounded-md bg-gray-100 dark:bg-zinc-800 ' + className} />
}

/** Bloque típico para paneles con KPIs + gráfico. */
export function PanelSkeleton() {
  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        {Array.from({ length: 4 }).map((_, i) => (
          <div key={i} className="space-y-2">
            <Skeleton className="h-3 w-16" />
            <Skeleton className="h-6 w-20" />
          </div>
        ))}
      </div>
      <Skeleton className="h-40 w-full" />
    </div>
  )
}
