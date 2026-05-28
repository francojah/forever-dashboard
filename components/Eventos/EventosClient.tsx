'use client'

import { useMemo, useState } from 'react'

type EventCategory = 'mega' | 'social' | 'seasonal' | 'special'

interface CalendarEvent {
  id: string
  name: string
  date: string
  end_date?: string
  category: EventCategory
  desc: string
  tip: string
}

const CATEGORY_CONFIG: Record<EventCategory, { label: string; color: string; bg: string; dot: string; border: string }> = {
  mega:     { label: 'Mega evento',  color: 'text-purple-700 dark:text-purple-400',   bg: 'bg-purple-50 dark:bg-purple-900/20',   dot: 'bg-purple-500',  border: 'border-purple-200 dark:border-purple-800' },
  social:   { label: 'Fecha social', color: 'text-blue-700 dark:text-blue-400',       bg: 'bg-blue-50 dark:bg-blue-900/20',       dot: 'bg-blue-500',    border: 'border-blue-200 dark:border-blue-800'   },
  seasonal: { label: 'Temporada',    color: 'text-emerald-700 dark:text-emerald-400', bg: 'bg-emerald-50 dark:bg-emerald-900/20', dot: 'bg-emerald-500', border: 'border-emerald-200 dark:border-emerald-800' },
  special:  { label: 'Especial',     color: 'text-amber-700 dark:text-amber-400',     bg: 'bg-amber-50 dark:bg-amber-900/20',     dot: 'bg-amber-500',   border: 'border-amber-200 dark:border-amber-800' },
}

const MONTH_NAMES = ['Ene','Feb','Mar','Abr','May','Jun','Jul','Ago','Sep','Oct','Nov','Dic']

const EVENTS: CalendarEvent[] = [
  {
    id: 'hot-sale-2026', name: 'Hot Sale 2026',
    date: '2026-05-18', end_date: '2026-05-20', category: 'mega',
    desc: 'El evento de ecommerce mas grande de Argentina organizado por CACE. 3 dias de ofertas con alta intencion de compra.',
    tip: 'Publicitar descuentos especiales en basicos de algodon. Aumentar presupuesto 2-3x los dias previos al evento.',
  },
  {
    id: 'dia-padre-2026', name: 'Dia del Padre 2026',
    date: '2026-06-21', category: 'social',
    desc: '3er domingo de junio. Alta demanda de regalos de ropa. Gran oportunidad para basicos masculinos y packs regalo.',
    tip: 'Armar packs regalo (remera + boxer + envio gratis). Iniciar campana en Meta 2 semanas antes.',
  },
  {
    id: 'dia-amigo-2026', name: 'Dia del Amigo 2026',
    date: '2026-07-20', category: 'social',
    desc: 'Fecha muy emotiva en Argentina con alta actividad en redes. Oportunidad para campanas de awareness y contenido viral.',
    tip: 'Creativos con grupos de amigos usando la ropa. Descuento 2x1 o shipping gratis en compras de 2+ prendas.',
  },
  {
    id: 'dia-nino-2026', name: 'Dia del Nino 2026',
    date: '2026-08-09', category: 'social',
    desc: '2do domingo de agosto. Alta demanda de ropa para regalar. Funciona aunque no tengan linea infantil propia.',
    tip: 'Campana de regalo para los hijos. Creativos con familias. Bundle especial de temporada.',
  },
  {
    id: 'primavera-2026', name: 'Inicio de Primavera',
    date: '2026-09-21', category: 'seasonal',
    desc: 'Cambio de temporada. Alta busqueda de ropa liviana y colores claros. El momento ideal para renovar el guardarropa.',
    tip: 'Lanzar coleccion de temporada. Campana de nueva temporada, nueva ropa. Colores pasteles y blancos.',
  },
  {
    id: 'dia-madre-2026', name: 'Dia de la Madre 2026',
    date: '2026-10-18', category: 'social',
    desc: '3er domingo de octubre en Argentina. Uno de los picos mas altos del ano para ropa y accesorios.',
    tip: 'El evento social mas importante para una marca de ropa. Campana minimo 3 semanas antes. Packs regalo premium con packaging especial.',
  },
  {
    id: '11-11-2026', name: 'Singles Day 11/11',
    date: '2026-11-11', category: 'mega',
    desc: 'Fecha de descuentos popularizada por Alibaba. Creciente adopcion en ecommerce latinoamericano. 24 horas de descuentos.',
    tip: 'Descuentos flash de 24hs. Comunicar urgencia: solo hoy 11/11. Creativos con el numero 11 grande.',
  },
  {
    id: 'black-friday-2026', name: 'Black Friday 2026',
    date: '2026-11-27', category: 'mega',
    desc: 'Ultimo viernes de noviembre. Alta competencia pero alto volumen de compras. El CPC sube pero el volumen justifica.',
    tip: 'Activar retargeting agresivo 1 semana antes. Mantener ROAS objetivo aunque suba el CPC. Preparar stock con anticipacion.',
  },
  {
    id: 'cybermonday-2026', name: 'CyberMonday 2026',
    date: '2026-11-30', end_date: '2026-12-02', category: 'mega',
    desc: 'Evento CACE de 3 dias: Lunes-Miercoles despues del Black Friday. Alto trafico y alta intencion de compra online.',
    tip: 'Preparar landing especifica en Tiendanube. Aumentar presupuesto Meta 3x los 3 dias del evento.',
  },
  {
    id: '12-12-2026', name: 'Doble 12 (12/12)',
    date: '2026-12-12', category: 'special',
    desc: 'Fecha simbolica en ecommerce para descuentos flash. Menor que 11/11 pero facil de comunicar en redes.',
    tip: 'Descuento 12% off por 12 horas. Creativos con la fecha 12/12 grande en el visual. Story + feed.',
  },
  {
    id: 'navidad-2026', name: 'Navidad 2026',
    date: '2026-12-25', category: 'social',
    desc: 'Pico maximo de ventas anual. La intencion de compra sube desde principios de diciembre.',
    tip: 'Campana de regalo de Navidad desde el 1 de diciembre. Enfatizar entrega garantizada antes del 24. El mejor momento del ano.',
  },
  {
    id: 'ano-nuevo-2027', name: 'Ano Nuevo 2027',
    date: '2027-01-01', category: 'social',
    desc: 'Inicio de ano. Alta motivacion de cambio y renovacion personal. Ideal para campanas de look nuevo, ano nuevo.',
    tip: 'Creativos de renovacion de guardarropa. Descuento de inicio de ano. Liquidacion de temporada.',
  },
  {
    id: 'san-valentin-2027', name: 'San Valentin 2027',
    date: '2027-02-14', category: 'social',
    desc: 'Dia de los enamorados. Demanda de regalos de ropa especialmente prendas basicas premium para regalar.',
    tip: 'Packs regalo para parejas. Embalaje especial. Creativos romanticos con modelos en pareja.',
  },
  {
    id: 'dia-mujer-2027', name: 'Dia de la Mujer 2027',
    date: '2027-03-08', category: 'special',
    desc: 'Creciente importancia como fecha de consumo femenino. Oportunidad para la linea mujer de Forever Basics.',
    tip: 'Mensaje de empoderamiento, no solo descuento. Creativos con mujeres reales usando los productos.',
  },
  {
    id: 'inicio-otono-2027', name: 'Inicio de Otono',
    date: '2027-03-21', category: 'seasonal',
    desc: 'Cambio de temporada. Renovacion de guardarropa hacia telas mas abrigadas. Basicos de algodon pesado en demanda.',
    tip: 'Lanzar prendas de abrigo liviano. Campanar la transicion de temporada con looks de otono.',
  },
  {
    id: 'hot-sale-2027', name: 'Hot Sale 2027',
    date: '2027-05-17', end_date: '2027-05-19', category: 'mega',
    desc: 'Estimado 3ra semana de mayo 2027. El evento de ecommerce mas grande del pais organizado por CACE.',
    tip: 'Preparar stock desde marzo. Subir bids en Meta 2 semanas antes. Crear landing especial en Tiendanube.',
  },
  {
    id: 'dia-padre-2027', name: 'Dia del Padre 2027',
    date: '2027-06-20', category: 'social',
    desc: '3er domingo de junio. Alta demanda de regalos de ropa. Categorias: remeras, boxers, bermudas.',
    tip: 'Packs regalo masculinos con discount especial. Campana desde 2 semanas antes.',
  },
]

function getDaysFromNow(dateStr: string): number {
  const today = new Date()
  today.setHours(0, 0, 0, 0)
  const target = new Date(dateStr + 'T00:00:00')
  return Math.round((target.getTime() - today.getTime()) / (1000 * 60 * 60 * 24))
}

function formatDate(dateStr: string, endDateStr?: string): string {
  const d = new Date(dateStr + 'T00:00:00')
  const day = d.getDate()
  const month = MONTH_NAMES[d.getMonth()]
  const year = d.getFullYear()
  if (!endDateStr) return day + ' ' + month + ' ' + year
  const e = new Date(endDateStr + 'T00:00:00')
  const eday = e.getDate()
  const emonth = MONTH_NAMES[e.getMonth()]
  if (d.getMonth() === e.getMonth()) return day + '-' + eday + ' ' + month + ' ' + year
  return day + ' ' + month + ' - ' + eday + ' ' + emonth + ' ' + year
}

function CountdownBadge({ days }: { days: number }) {
  if (days < -7) return (
    <span className="text-xs text-gray-400 dark:text-zinc-600">
      {Math.abs(days)}d atras
    </span>
  )
  if (days < 0) return (
    <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium bg-gray-100 dark:bg-zinc-800 text-gray-500 dark:text-zinc-500">
      Hace {Math.abs(days)} dias
    </span>
  )
  if (days === 0) return (
    <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-bold bg-red-500 text-white animate-pulse">
      HOY
    </span>
  )
  if (days <= 7) return (
    <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-bold bg-red-100 dark:bg-red-900/30 text-red-700 dark:text-red-400">
      {days}d
    </span>
  )
  if (days <= 30) return (
    <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium bg-amber-100 dark:bg-amber-900/30 text-amber-700 dark:text-amber-400">
      {days}d
    </span>
  )
  if (days <= 90) return (
    <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium bg-blue-50 dark:bg-blue-900/20 text-blue-600 dark:text-blue-400">
      {days}d
    </span>
  )
  return (
    <span className="text-xs text-gray-400 dark:text-zinc-600">
      {days}d
    </span>
  )
}

type FilterCat = 'all' | EventCategory

export default function EventosClient() {
  const [filterCat, setFilterCat] = useState<FilterCat>('all')
  const [showPast, setShowPast] = useState(false)

  const eventsWithDays = useMemo(() => {
    return EVENTS.map(e => ({ ...e, days: getDaysFromNow(e.date) }))
      .sort((a, b) => a.days - b.days)
  }, [])

  const upcoming = eventsWithDays.filter(e => e.days >= -3)
  const past     = eventsWithDays.filter(e => e.days < -3)

  const filtered = (list: typeof eventsWithDays) =>
    filterCat === 'all' ? list : list.filter(e => e.category === filterCat)

  const nextEvent = upcoming[0]

  return (
    <div className="max-w-4xl mx-auto space-y-6">

      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-3">
        <div>
          <h1 className="text-xl font-semibold text-gray-900 dark:text-zinc-100">Calendario Ecommerce Argentina</h1>
          <p className="text-sm text-gray-500 dark:text-zinc-500 mt-0.5">Fechas clave para planificar tus campanas de Meta Ads</p>
        </div>
      </div>

      {/* Next event hero */}
      {nextEvent && nextEvent.days >= 0 && nextEvent.days <= 60 && (
        <div className="rounded-xl border border-purple-200 dark:border-purple-800 bg-purple-50 dark:bg-purple-900/10 p-5">
          <div className="flex items-start justify-between gap-4">
            <div>
              <p className="text-xs font-medium text-purple-500 dark:text-purple-400 uppercase tracking-wide mb-1">Proximo evento</p>
              <h2 className="text-lg font-semibold text-gray-900 dark:text-zinc-100">{nextEvent.name}</h2>
              <p className="text-sm text-gray-500 dark:text-zinc-400 mt-0.5">{formatDate(nextEvent.date, nextEvent.end_date)}</p>
              <p className="text-sm text-gray-600 dark:text-zinc-400 mt-2 max-w-lg">{nextEvent.tip}</p>
            </div>
            <div className="text-center flex-shrink-0">
              <p className="text-4xl font-bold text-purple-600 dark:text-purple-400">{nextEvent.days}</p>
              <p className="text-xs text-purple-500 dark:text-purple-400 font-medium">dias</p>
            </div>
          </div>
        </div>
      )}

      {/* Filter chips */}
      <div className="flex flex-wrap gap-2">
        {(['all', 'mega', 'social', 'seasonal', 'special'] as const).map(cat => {
          const cfg = cat !== 'all' ? CATEGORY_CONFIG[cat] : null
          return (
            <button key={cat} onClick={() => setFilterCat(cat)}
              className={'flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-medium border transition-all ' + (
                filterCat === cat
                  ? 'bg-gray-900 dark:bg-zinc-100 text-white dark:text-zinc-900 border-transparent'
                  : 'border-gray-200 dark:border-zinc-700 text-gray-600 dark:text-zinc-400 hover:border-gray-400'
              )}>
              {cfg && <span className={'w-1.5 h-1.5 rounded-full ' + cfg.dot} />}
              {cat === 'all' ? 'Todos' : CATEGORY_CONFIG[cat].label}
            </button>
          )
        })}
      </div>

      {/* Upcoming events */}
      <div className="space-y-3">
        <h2 className="text-sm font-semibold text-gray-700 dark:text-zinc-300 uppercase tracking-wide">Proximos eventos</h2>
        {filtered(upcoming).length === 0 ? (
          <p className="text-sm text-gray-400 dark:text-zinc-500">No hay eventos proximos en esta categoria.</p>
        ) : (
          filtered(upcoming).map(event => {
            const cfg = CATEGORY_CONFIG[event.category]
            return (
              <div key={event.id}
                className={'rounded-xl border p-4 transition-all ' + cfg.border + ' ' + cfg.bg}>
                <div className="flex items-start justify-between gap-3">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 mb-1">
                      <span className={'w-2 h-2 rounded-full flex-shrink-0 ' + cfg.dot} />
                      <span className={'text-xs font-medium ' + cfg.color}>{cfg.label}</span>
                    </div>
                    <h3 className="text-sm font-semibold text-gray-900 dark:text-zinc-100">{event.name}</h3>
                    <p className="text-xs text-gray-500 dark:text-zinc-500 mt-0.5">{formatDate(event.date, event.end_date)}</p>
                    <p className="text-xs text-gray-600 dark:text-zinc-400 mt-2">{event.desc}</p>
                    <div className="mt-2 flex items-start gap-2">
                      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" className="w-3.5 h-3.5 text-gray-400 flex-shrink-0 mt-0.5">
                        <circle cx="12" cy="12" r="10"/><path d="M12 8v4l3 3"/>
                      </svg>
                      <p className="text-xs text-gray-600 dark:text-zinc-400 italic">{event.tip}</p>
                    </div>
                  </div>
                  <div className="flex-shrink-0">
                    <CountdownBadge days={event.days} />
                  </div>
                </div>
              </div>
            )
          })
        )}
      </div>

      {/* Past events toggle */}
      {past.length > 0 && (
        <div>
          <button onClick={() => setShowPast(p => !p)}
            className="flex items-center gap-2 text-sm text-gray-400 dark:text-zinc-500 hover:text-gray-600 dark:hover:text-zinc-300 transition-colors">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className={'w-4 h-4 transition-transform ' + (showPast ? 'rotate-180' : '')}>
              <polyline points="6 9 12 15 18 9"/>
            </svg>
            {showPast ? 'Ocultar' : 'Ver'} eventos pasados ({filtered(past).length})
          </button>
          {showPast && (
            <div className="mt-3 space-y-2">
              {filtered(past).map(event => {
                const cfg = CATEGORY_CONFIG[event.category]
                return (
                  <div key={event.id}
                    className="rounded-xl border border-gray-100 dark:border-zinc-800 bg-white dark:bg-zinc-900 p-4 opacity-60">
                    <div className="flex items-start justify-between gap-3">
                      <div className="flex-1">
                        <div className="flex items-center gap-2 mb-1">
                          <span className={'w-2 h-2 rounded-full flex-shrink-0 bg-gray-300 dark:bg-zinc-600'} />
                          <span className="text-xs font-medium text-gray-400 dark:text-zinc-500">{cfg.label}</span>
                        </div>
                        <h3 className="text-sm font-medium text-gray-600 dark:text-zinc-400">{event.name}</h3>
                        <p className="text-xs text-gray-400 dark:text-zinc-600 mt-0.5">{formatDate(event.date, event.end_date)}</p>
                      </div>
                      <CountdownBadge days={event.days} />
                    </div>
                  </div>
                )
              })}
            </div>
          )}
        </div>
      )}

    </div>
  )
}
