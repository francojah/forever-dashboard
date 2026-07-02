'use client'

import { useState } from 'react'
import { ARGENTINA_PROVINCES, TN_NAME_MAP } from '@/lib/argentina-paths'

// ── Types ─────────────────────────────────────────────────────
interface Province {
  name: string
  count: number
}

interface Props {
  provinces: Province[]
  totalOrders: number
}

// ── Name normalisation ────────────────────────────────────────
function normalizeName(raw: string): string {
  const key = raw.trim().toLowerCase()
  return TN_NAME_MAP[key] ?? raw.trim()
}

// ── Colour scale: neutral → deep violet ──────────────────────
function getVioletFill(intensity: number, dark: boolean): string {
  if (intensity === 0) return dark ? '#27272a' : '#e4e4e7'
  const stops = dark
    ? ['#3b1d6e', '#4c1d95', '#5b21b6', '#6d28d9', '#7c3aed', '#8b5cf6']
    : ['#ede9fe', '#ddd6fe', '#c4b5fd', '#a78bfa', '#7c3aed', '#5b21b6']
  const idx = Math.min(Math.floor(intensity * stops.length), stops.length - 1)
  return stops[idx]
}

// ── Component ─────────────────────────────────────────────────
export default function ArgentinaMap({ provinces, totalOrders }: Props) {
  const [hovered, setHovered] = useState<string | null>(null)

  // Build normalised count map
  const countMap = new Map<string, number>()
  for (const p of provinces) {
    const norm = normalizeName(p.name)
    countMap.set(norm, (countMap.get(norm) ?? 0) + p.count)
  }

  const maxCount = Math.max(...Array.from(countMap.values()), 1)

  function intensity(name: string): number {
    const c = countMap.get(name) ?? 0
    if (c === 0) return 0
    return Math.pow(c / maxCount, 0.45)
  }

  // Detect dark mode via CSS variable presence
  // We use two separate fills so Tailwind dark: handles it via parent class
  const hoveredData = hovered
    ? { count: countMap.get(hovered) ?? 0, pct: totalOrders > 0 ? ((countMap.get(hovered) ?? 0) / totalOrders * 100).toFixed(1) : '0.0' }
    : null

  return (
    <div className="flex flex-col items-center w-full">
      {/* SVG Map */}
      <div className="relative w-full">
        <svg
          viewBox="0 0 200 480"
          className="w-full"
          aria-label="Mapa de Argentina — ventas por provincia"
          role="img"
        >
          {ARGENTINA_PROVINCES.map((prov) => {
            const t = intensity(prov.name)
            const isHov = hovered === prov.name
            return (
              <path
                key={prov.id}
                d={prov.path}
                className={`transition-all duration-100 cursor-pointer ${
                  t === 0
                    ? 'fill-zinc-200 dark:fill-zinc-800'
                    : t < 0.17 ? 'fill-violet-100 dark:fill-violet-950/40'
                    : t < 0.34 ? 'fill-violet-200 dark:fill-violet-900/60'
                    : t < 0.50 ? 'fill-violet-300 dark:fill-violet-800/70'
                    : t < 0.67 ? 'fill-violet-400 dark:fill-violet-700'
                    : t < 0.83 ? 'fill-violet-500 dark:fill-violet-600'
                    : 'fill-violet-700 dark:fill-violet-500'
                }`}
                stroke={isHov ? '#7c3aed' : undefined}
                strokeWidth={isHov ? 1.5 : undefined}
                style={{
                  stroke: isHov ? '#7c3aed' : undefined,
                }}
                onMouseEnter={() => setHovered(prov.name)}
                onMouseLeave={() => setHovered(null)}
              >
                <title>{prov.name}: {countMap.get(prov.name) ?? 0} órdenes</title>
              </path>
            )
          })}
          {/* Province borders overlay — very subtle */}
          {ARGENTINA_PROVINCES.map((prov) => (
            <path
              key={`border-${prov.id}`}
              d={prov.path}
              fill="none"
              stroke="white"
              strokeWidth="0.5"
              strokeOpacity="0.6"
              className="dark:[stroke:rgba(0,0,0,0.4)] pointer-events-none"
            />
          ))}
        </svg>
      </div>

      {/* Hover info */}
      <div className="min-h-[36px] text-center mt-1 px-2">
        {hovered && hoveredData ? (
          <>
            <p className="text-[12px] font-semibold text-gray-800 dark:text-zinc-200 leading-tight">{hovered}</p>
            <p className="text-mini text-gray-500 dark:text-zinc-400">
              {hoveredData.count} órdenes
              {totalOrders > 0 && (
                <span className="ml-1 font-medium text-violet-600 dark:text-violet-400">· {hoveredData.pct}%</span>
              )}
            </p>
          </>
        ) : (
          <p className="text-mini text-gray-400 dark:text-zinc-600">Hover para ver detalles</p>
        )}
      </div>

      {/* Legend */}
      <div className="flex items-center gap-1.5 mt-1 text-micro text-gray-400 dark:text-zinc-600">
        <span>Menos</span>
        <div className="flex gap-0.5">
          <div className="w-3 h-2 rounded-sm bg-violet-100 dark:bg-violet-950/40" />
          <div className="w-3 h-2 rounded-sm bg-violet-200 dark:bg-violet-900/60" />
          <div className="w-3 h-2 rounded-sm bg-violet-300 dark:bg-violet-800/70" />
          <div className="w-3 h-2 rounded-sm bg-violet-400 dark:bg-violet-700" />
          <div className="w-3 h-2 rounded-sm bg-violet-500 dark:bg-violet-600" />
          <div className="w-3 h-2 rounded-sm bg-violet-700 dark:bg-violet-500" />
        </div>
        <span>Más</span>
      </div>
    </div>
  )
}
