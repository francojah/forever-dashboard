/** Junta la versión de feed (4:5 o 1:1) y la de historias (9:16) de un mismo creativo en un solo anuncio. */

export interface PairableFile {
  key: string
  file: { name: string }
  type: 'image' | 'video'
  state: string
  vertical?: boolean
  story?: string
  partOf?: string
}

/** Nombre sin marcas de formato, para reconocer las dos versiones de un mismo creativo. */
export const pairKey = (f: string) => f.replace(/\.[^.]+$/, '').toLowerCase()
  .replace(/(^|[\s_\-.])(story|stories|historias?|reels?|feed|post|vertical|cuadrad[oa]|9x16|9-16|916|4x5|4-5|45|1x1|1-1|1080x1920|1080x1350|1080x1080)(?=$|[\s_\-.])/g, ' ')
  .replace(/[\s_\-.]+/g, ' ').trim()

/** Junta cada versión 9:16 con su versión de feed (mismo tipo y mismo nombre base). */
export function autoPair<T extends PairableFile>(list: T[]): T[] {
  const out = list.map((f) => ({ ...f }))
  const free = (f: T) => !f.story && !f.partOf && (f.state === 'listo' || f.state === 'error')
  const verticals = out.filter((f) => f.vertical === true && free(f))
  for (const v of verticals) {
    const feeds = out.filter((f) => f.vertical === false && free(f) && f.type === v.type)
    const match = feeds.find((f) => pairKey(f.file.name) === pairKey(v.file.name)) || (feeds.length === 1 && verticals.length === 1 ? feeds[0] : undefined)
    if (match) { match.story = v.key; v.partOf = match.key }
  }
  return out
}

