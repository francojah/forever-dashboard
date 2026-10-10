/**
 * Mejoras automáticas de Meta (Advantage+ creative) que Faro manda explícitamente en cada anuncio nuevo.
 *
 * Valores por defecto tomados del consenso de especialistas en compra de medios para ecommerce con
 * creativos propios (Jon Loomer, SparkUGC, Metalla, AdsUploader, 2026): dejar prendido lo que adapta
 * el creativo a cada ubicación sin cambiar el mensaje (más inventario = más entrega) y apagar lo que
 * reescribe, superpone o genera contenido que no revisaste.
 */

export type Applies = 'image' | 'video' | 'all' | 'catalog'

export interface Enhancement {
  key: string
  label: string
  what: string
  why: string
  on: boolean          // recomendado
  applies: Applies
}

export const ENHANCEMENTS: Enhancement[] = [
  // Prendidas: adaptan a la ubicación sin tocar el mensaje
  { key: 'image_touchups', label: 'Retoques visuales', applies: 'image', on: true,
    what: 'Recorta y adapta la imagen a cada ubicación (feed, historias, reels).',
    why: 'Habilita más ubicaciones sin cambiar el mensaje: más inventario, CPM más bajo. Casi todos los especialistas la dejan prendida.' },
  { key: 'image_brightness_and_contrast', label: 'Brillo y contraste', applies: 'image', on: true,
    what: 'Ajustes sutiles de brillo y contraste según dónde se muestra.',
    why: 'Riesgo bajo y cambios mínimos. Apagala solo si tu marca tiene colores muy estrictos.' },
  { key: 'pac_relaxation', label: 'Medios flexibles', applies: 'all', on: true,
    what: 'Permite mostrar la versión pensada para una ubicación en otras ubicaciones.',
    why: 'Suma inventario sin cambiar el creativo. Riesgo bajo.' },
  { key: 'inline_comment', label: 'Comentarios destacados', applies: 'all', on: true,
    what: 'Muestra debajo del anuncio un comentario real del público.',
    why: 'Prueba social sin modificar el creativo. Apagala si no moderás los comentarios.' },
  { key: 'adapt_to_placement', label: 'Adaptar catálogo a la ubicación', applies: 'catalog', on: true,
    what: 'Lleva las imágenes del catálogo a 4:5 y 9:16.',
    why: 'Solo aplica a anuncios de catálogo. Riesgo bajo.' },
  { key: 'description_automation', label: 'Descripción dinámica', applies: 'catalog', on: true,
    what: 'Usa datos del catálogo en la descripción.',
    why: 'No genera texto nuevo: toma tu catálogo. Riesgo bajo.' },
  { key: 'media_type_automation', label: 'Medios dinámicos', applies: 'catalog', on: true,
    what: 'Elige entre imagen y video del producto según quién lo ve.',
    why: 'Usa solo material que ya cargaste. Riesgo bajo.' },

  // Apagadas: reescriben, superponen o generan contenido
  { key: 'text_optimizations', label: 'Mejoras de texto', applies: 'all', on: false,
    what: 'Recombina y mueve tu texto principal, título y descripción.',
    why: 'Perdés control de qué frase sale con cada creativo. Un test de agencia midió 26% más ROAS con esto apagado.' },
  { key: 'image_templates', label: 'Superposiciones (plantillas)', applies: 'image', on: false,
    what: 'Agrega barras y textos con estilo automático sobre la imagen.',
    why: 'Choca con el diseño y las zonas seguras. Mejor el texto ya diseñado en el creativo.' },
  { key: 'add_text_overlay', label: 'Superposiciones dinámicas', applies: 'all', on: false,
    what: 'Pone textos o precios generados sobre la imagen.',
    why: 'Puede tapar el producto o mostrar datos que no revisaste.' },
  { key: 'image_uncrop', label: 'Expandir imagen (IA)', applies: 'image', on: false,
    what: 'Inventa píxeles en los bordes para llenar otros formatos.',
    why: 'Puede deformar el producto. Mejor exportar 4:5 y 9:16 reales (Faro avisa si la proporción no sirve).' },
  { key: 'image_background_gen', label: 'Fondos generados (IA)', applies: 'image', on: false,
    what: 'Genera fondos nuevos para la foto del producto.',
    why: 'Calidad variable y sin revisión previa.' },
  { key: 'video_auto_crop', label: 'Recorte automático de video', applies: 'video', on: false,
    what: 'Recorta el video para otras ubicaciones.',
    why: 'Puede cortar la acción o el producto en los bordes. Mejor editar 9:16 y 4:5.' },
  { key: 'enhance_cta', label: 'Mejorar el botón', applies: 'all', on: false,
    what: 'Cambia tu llamado a la acción por uno prearmado.',
    why: 'Ganancia chica y perdés el control del CTA. Probala aparte si querés.' },
  { key: 'text_translation', label: 'Traducción automática', applies: 'all', on: false,
    what: 'Traduce el texto a otros idiomas.',
    why: 'Vendés en Argentina: no suma y puede salir mal.' },
  { key: 'creative_stickers', label: 'Stickers con CTA', applies: 'all', on: false,
    what: 'Agrega stickers con llamados a la acción.',
    why: 'Modifica el creativo sin revisión.' },
  { key: 'reveal_details_over_time', label: 'Revelar detalles en el tiempo', applies: 'all', on: false,
    what: 'Muestra información extra mientras se ve el anuncio.',
    why: 'Agrega contenido que no controlás.' },
  { key: 'product_extensions', label: 'Productos del catálogo debajo', applies: 'all', on: false,
    what: 'Suma productos del catálogo debajo del anuncio.',
    why: 'Útil solo con un catálogo limpio y un set relevante; en anuncios de un producto distrae. Prendela si tu feed está ordenado.' },
]

export const MUSIC = {
  key: 'music', label: 'Música automática', on: false,
  what: 'Meta elige una canción para imágenes y videos en Reels e Historias.',
  why: 'Puede no pegar con el tono o pisar la voz del video. Mejor poner la música en la edición.',
}

export interface EnhancementPrefs { features: Record<string, boolean>; music: boolean }

export function defaultPrefs(): EnhancementPrefs {
  return { features: Object.fromEntries(ENHANCEMENTS.map((e) => [e.key, e.on])), music: MUSIC.on }
}

export function normalizePrefs(raw: unknown): EnhancementPrefs {
  const d = defaultPrefs()
  const r = (raw && typeof raw === 'object' ? raw : {}) as Partial<EnhancementPrefs>
  const f = (r.features && typeof r.features === 'object' ? r.features : {}) as Record<string, unknown>
  for (const e of ENHANCEMENTS) if (typeof f[e.key] === 'boolean') d.features[e.key] = f[e.key] as boolean
  if (typeof r.music === 'boolean') d.music = r.music
  return d
}

/** Spec para la API: todas las mejoras explícitas (prendidas u apagadas), según el tipo de anuncio. */
export function degreesOfFreedomSpec(prefs: EnhancementPrefs, media: 'image' | 'video') {
  const spec: Record<string, { enroll_status: 'OPT_IN' | 'OPT_OUT' }> = {}
  for (const e of ENHANCEMENTS) {
    if (e.applies === 'catalog') continue
    if (e.applies !== 'all' && e.applies !== media) continue
    spec[e.key] = { enroll_status: prefs.features[e.key] ? 'OPT_IN' : 'OPT_OUT' }
  }
  return { creative_features_spec: spec }
}

export const enabledCount = (p: EnhancementPrefs) => ENHANCEMENTS.filter((e) => p.features[e.key]).length + (p.music ? 1 : 0)
