'use client'

import { useState } from 'react'

// ── Simplified SVG province paths ──────────────────────────────
// ViewBox: 0 0 210 500
// Approximate polygons — geographically representative, not pixel-perfect.
// Each province is a closed polygon path.
const PROVINCE_PATHS: Record<string, string> = {
  Jujuy:
    'M 70 4 L 94 0 L 100 16 L 92 38 L 68 42 L 62 26 Z',
  Salta:
    'M 46 0 L 94 0 L 70 4 L 62 26 L 68 42 L 74 66 L 54 72 L 38 64 L 26 50 L 20 24 Z',
  Formosa:
    'M 100 0 L 156 0 L 172 12 L 174 46 L 144 52 L 110 46 L 92 38 L 100 16 Z',
  Chaco:
    'M 110 46 L 144 52 L 174 46 L 184 62 L 182 104 L 156 108 L 126 100 L 108 86 L 104 64 Z',
  Misiones:
    'M 174 46 L 196 42 L 208 62 L 204 96 L 182 104 L 174 94 L 184 62 Z',
  Tucumán:
    'M 68 66 L 90 62 L 96 78 L 86 90 L 70 84 L 62 74 Z',
  Corrientes:
    'M 156 108 L 182 104 L 204 96 L 208 124 L 196 148 L 176 160 L 154 156 L 142 130 L 148 108 Z',
  Catamarca:
    'M 26 50 L 38 64 L 54 72 L 62 74 L 70 84 L 64 106 L 50 118 L 36 112 L 20 94 L 20 66 Z',
  'Santiago del Estero':
    'M 90 62 L 104 64 L 108 86 L 126 100 L 122 130 L 100 138 L 80 132 L 74 112 L 74 90 L 86 90 L 96 78 Z',
  'Entre Ríos':
    'M 154 156 L 176 160 L 184 180 L 178 206 L 162 216 L 142 208 L 132 186 L 138 164 L 142 154 Z',
  'La Rioja':
    'M 20 94 L 36 112 L 50 118 L 56 138 L 54 164 L 40 170 L 22 162 L 14 136 L 16 112 Z',
  'Santa Fe':
    'M 122 100 L 142 100 L 142 130 L 154 156 L 142 154 L 138 164 L 132 186 L 132 212 L 120 222 L 106 212 L 102 184 L 100 158 L 100 138 L 122 130 Z',
  'San Juan':
    'M 16 162 L 40 170 L 54 164 L 64 180 L 58 204 L 44 216 L 18 212 L 8 188 Z',
  Córdoba:
    'M 64 106 L 80 132 L 100 138 L 100 158 L 102 184 L 102 212 L 86 224 L 68 220 L 58 204 L 64 180 L 60 160 L 56 138 Z',
  Mendoza:
    'M 8 188 L 44 216 L 58 204 L 68 220 L 66 258 L 52 278 L 28 274 L 6 258 L 4 230 Z',
  'San Luis':
    'M 58 204 L 86 224 L 90 248 L 80 266 L 64 270 L 52 260 L 52 242 L 54 222 Z',
  'Buenos Aires':
    'M 120 222 L 160 212 L 178 202 L 196 222 L 200 260 L 204 298 L 200 340 L 182 366 L 158 380 L 134 380 L 110 368 L 96 346 L 92 314 L 94 282 L 102 256 L 102 224 Z',
  CABA:
    'M 150 234 L 160 232 L 164 242 L 158 248 L 150 244 Z',
  'La Pampa':
    'M 66 258 L 90 268 L 102 256 L 102 282 L 102 318 L 86 332 L 66 332 L 50 316 L 48 290 L 52 278 Z',
  Neuquén:
    'M 6 258 L 28 274 L 52 278 L 66 292 L 62 320 L 46 332 L 28 328 L 6 314 L 0 288 Z',
  'Río Negro':
    'M 0 314 L 28 328 L 46 332 L 86 332 L 102 346 L 110 368 L 96 382 L 66 386 L 36 382 L 10 374 L 0 356 Z',
  Chubut:
    'M 0 382 L 36 382 L 66 386 L 118 386 L 130 400 L 132 430 L 112 440 L 80 444 L 46 438 L 14 428 L 0 414 Z',
  'Santa Cruz':
    'M 0 414 L 14 428 L 46 438 L 80 444 L 112 440 L 132 430 L 140 442 L 136 472 L 110 482 L 78 480 L 44 476 L 10 468 L 0 450 Z',
  'Tierra del Fuego':
    'M 66 474 L 108 472 L 122 482 L 116 494 L 92 498 L 70 494 Z',
}

// ── Province name normaliser ───────────────────────────────────
const ALIASES: Record<string, string> = {
  'capital federal': 'CABA',
  'ciudad autónoma de buenos aires': 'CABA',
  'ciudad autonoma de buenos aires': 'CABA',
  'ciudad de buenos aires': 'CABA',
  caba: 'CABA',
  'entre rios': 'Entre Ríos',
  'entre ríos': 'Entre Ríos',
  'rio negro': 'Río Negro',
  'río negro': 'Río Negro',
  'santiago del estero': 'Santiago del Estero',
  'santa fe': 'Santa Fe',
  'san juan': 'San Juan',
  'san luis': 'San Luis',
  'buenos aires': 'Buenos Aires',
  'la pampa': 'La Pampa',
  'la rioja': 'La Rioja',
  'neuquen': 'Neuquén',
  'neuquén': 'Neuquén',
  'santa cruz': 'Santa Cruz',
  'tierra del fuego': 'Tierra del Fuego',
  'tierra del fuego, antártida e islas del atlántico sur': 'Tierra del Fuego',
  'tierra del fuego antartida e islas del atlantico sur': 'Tierra del Fuego',
  córdoba: 'Córdoba',
  cordoba: 'Córdoba',
  mendoza: 'Mendoza',
  tucumán: 'Tucumán',
  tucuman: 'Tucumán',
  salta: 'Salta',
  jujuy: 'Jujuy',
  misiones: 'Misiones',
  corrientes: 'Corrientes',
  chaco: 'Chaco',
  formosa: 'Formosa',
  catamarca: 'Catamarca',
  chubut: 'Chubut',
}

function normalizeName(raw: string): string {
  const key = raw.trim().toLowerCase()
  return ALIASES[key] ?? raw.trim()
}

// ── Colour scale: 0 → neutral, 1 → deep violet ─────────────────
function intensityToColor(t: number, dark: boolean): string {
  if (t === 0) return dark ? '#27272a' : '#e4e4e7'
  if (t < 0.12) return dark ? 'rgba(139,92,246,0.18)' : 'rgba(139,92,246,0.12)'
  if (t < 0.28) return dark ? 'rgba(139,92,246,0.38)' : 'rgba(139,92,246,0.22)'
  if (t < 0.46) return dark ? 'rgba(139,92,246,0.55)' : 'rgba(139,92,246,0.38)'
  if (t < 0.64) return dark ? 'rgba(124,58,237,0.72)' : 'rgba(124,58,237,0.55)'
  if (t < 0.80) return dark ? 'rgba(109,40,217,0.88)' : 'rgba(109,40,217,0.70)'
  return dark ? 'rgba(91,33,182,1)' : 'rgba(91,33,182,0.88)'
}

// ── Component ─────────────────────────────────────────────────
interface Province {
  name: string
  count: number
}

interface Props {
  provinces: Province[]
  totalOrders: number
  dark?: boolean
}

export default function ArgentinaMap({ provinces, totalOrders, dark = false }: Props) {
  const [hovered, setHovered] = useState<string | null>(null)

  // Build normalised count map
  const countMap = new Map<string, number>()
  for (const p of provinces) {
    const norm = normalizeName(p.name)
    countMap.set(norm, (countMap.get(norm) ?? 0) + p.count)
  }

  const maxCount = Math.max(...Array.from(countMap.values()), 1)

  function getIntensity(name: string): number {
    const c = countMap.get(name) ?? 0
    if (c === 0) return 0
    return Math.pow(c / maxCount, 0.45) // power < 1 spreads low values
  }

  const stroke = dark ? '#3f3f46' : '#ffffff'
  const hoverStroke = dark ? '#a78bfa' : '#7c3aed'

  return (
    <div className="relative w-full flex flex-col items-center">
      <svg
        viewBox="0 0 210 500"
        className="w-full max-w-[190px]"
        aria-label="Mapa de Argentina — ventas por provincia"
      >
        {Object.entries(PROVINCE_PATHS).map(([name, path]) => {
          const intensity = getIntensity(name)
          const count = countMap.get(name) ?? 0
          const pct = totalOrders > 0 ? ((count / totalOrders) * 100).toFixed(1) : '0.0'
          const isHov = hovered === name
          const fill = intensityToColor(intensity, dark)

          return (
            <path
              key={name}
              d={path}
              fill={fill}
              stroke={isHov ? hoverStroke : stroke}
              strokeWidth={isHov ? 1.8 : 0.7}
              style={{
                cursor: 'pointer',
                transition: 'stroke-width 80ms, stroke 80ms',
                filter: isHov ? 'brightness(1.18) drop-shadow(0 0 3px rgba(139,92,246,0.45))' : 'none',
              }}
              onMouseEnter={() => setHovered(name)}
              onMouseLeave={() => setHovered(null)}
            >
              <title>{name}: {count} órds ({pct}%)</title>
            </path>
          )
        })}
      </svg>

      {/* Hover tooltip */}
      {hovered && (
        <div className="mt-2 text-center pointer-events-none">
          <p className="text-[12px] font-semibold text-gray-800 dark:text-zinc-200 leading-tight">{hovered}</p>
          <p className="text-[11px] text-gray-500 dark:text-zinc-400">
            {countMap.get(hovered) ?? 0} órdenes
            {totalOrders > 0 && (
              <span className="ml-1 text-violet-600 dark:text-violet-400 font-medium">
                · {(((countMap.get(hovered) ?? 0) / totalOrders) * 100).toFixed(1)}%
              </span>
            )}
          </p>
        </div>
      )}

      {/* Legend */}
      <div className="mt-3 flex items-center gap-1.5 text-[10px] text-gray-400 dark:text-zinc-500">
        <span>Menos</span>
        {[0.08, 0.22, 0.40, 0.60, 0.82, 1].map((t) => (
          <div
            key={t}
            className="w-3.5 h-2.5 rounded-sm"
            style={{ background: intensityToColor(t, dark) }}
          />
        ))}
        <span>Más</span>
      </div>
    </div>
  )
}
