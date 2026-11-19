/**
 * Zonas de la moto (espejo de Tiendanube → Medios de envío → "Moto Express").
 * Sirve para ofrecer la moto en el cambio según DÓNDE VIVE el cliente,
 * aunque la compra original haya salido por Correo o Punto de retiro.
 * Si cambian los partidos o precios en Tiendanube, actualizar acá (o los precios por env).
 */
const num = (v: string | undefined, d: number) => {
  const n = Number(v)
  return v !== undefined && v !== '' && Number.isFinite(n) ? n : d
}

export type MotoTier = 'caba' | 't1' | 't2' | 't3'

/** Precio de la moto en la tienda, por zona */
export const MOTO_PRICE: Record<MotoTier, number> = {
  caba: num(process.env.CAMBIOS_MOTO_PRICE_CABA, 4990),
  t1: num(process.env.CAMBIOS_MOTO_PRICE_T1, 8500),
  t2: num(process.env.CAMBIOS_MOTO_PRICE_T2, 9900),
  t3: num(process.env.CAMBIOS_MOTO_PRICE_T3, 25000),
}
/** Recargo del cambio por moto sobre el precio de la tienda (lo cobra el servicio de moto) */
export const MOTO_SURCHARGE = num(process.env.CAMBIOS_MOTO_SURCHARGE, 500)

export const motoAmount = (tier: MotoTier) => MOTO_PRICE[tier] + MOTO_SURCHARGE

/** Partidos con moto (nombre para mostrar → zona) */
export const MOTO_PARTIDOS: Record<string, MotoTier> = {
  'Avellaneda': 't1', 'General San Martín': 't1', 'Ituzaingó': 't1', 'La Matanza': 't1', 'Lanús': 't1',
  'San Isidro': 't1', 'Tres de Febrero': 't1', 'Vicente López': 't1',
  'Almirante Brown': 't2', 'Berazategui': 't2', 'Cañuelas': 't2', 'Esteban Echeverría': 't2', 'Ezeiza': 't2',
  'Florencio Varela': 't2', 'Hurlingham': 't2', 'Lomas de Zamora': 't2', 'Malvinas Argentinas': 't2', 'Merlo': 't2',
  'Moreno': 't2', 'Morón': 't2', 'Quilmes': 't2', 'San Fernando': 't2', 'San Miguel': 't2', 'Tigre': 't2',
  'Berisso': 't3', 'Campana': 't3', 'Ensenada': 't3', 'Escobar': 't3', 'General Rodríguez': 't3', 'La Plata': 't3',
  'Luján': 't3', 'Marcos Paz': 't3', 'Pilar': 't3', 'San Vicente': 't3', 'Zárate': 't3',
}

/** Localidades/barrios → partido (los clientes escriben la localidad, no el partido) */
const ALIASES: Record<string, string[]> = {
  'Almirante Brown': ['brown', 'adrogue', 'burzaco', 'longchamps', 'rafael calzada', 'jose marmol', 'claypole', 'glew', 'san jose', 'ministro rivadavia', 'malvinas argentinas alte brown'],
  'Esteban Echeverría': ['monte grande', 'luis guillon', 'el jaguel', '9 de abril', 'nueve de abril', 'echeverria'],
  'Lomas de Zamora': ['lomas', 'banfield', 'temperley', 'turdera', 'llavallol', 'villa fiorito', 'ingeniero budge', 'villa centenario'],
  'Lanús': ['lanus', 'remedios de escalada', 'valentin alsina', 'monte chingolo', 'lanus oeste', 'lanus este'],
  'Avellaneda': ['wilde', 'sarandi', 'dock sud', 'villa dominico', 'gerli', 'pineyro'],
  'Quilmes': ['bernal', 'quilmes oeste', 'ezpeleta', 'san francisco solano', 'don bosco'],
  'Berazategui': ['hudson', 'ranelagh', 'platanos', 'sourigues', 'gutierrez'],
  'Florencio Varela': ['varela', 'bosques', 'zeballos', 'villa vatteone'],
  'La Matanza': ['matanza', 'ramos mejia', 'san justo', 'isidro casanova', 'laferrere', 'gregorio de laferrere', 'gonzalez catan', 'villa luzuriaga', 'tapiales', 'lomas del mirador', 'ciudad evita', 'villa madero', 'aldo bonzi', 'virrey del pino', 'rafael castillo', 'la tablada', 'villa celina', '20 de junio'],
  'Morón': ['moron', 'castelar', 'haedo', 'el palomar', 'villa sarmiento'],
  'Hurlingham': ['william morris', 'villa tesei'],
  'Ituzaingó': ['ituzaingo', 'villa udaondo'],
  'Tres de Febrero': ['3 de febrero', 'caseros', 'ciudadela', 'santos lugares', 'martin coronado', 'saenz pena', 'villa bosch', 'loma hermosa', 'pablo podesta', 'ciudad jardin', 'el libertador', 'villa raffo', 'jose ingenieros', 'churruca', 'once de septiembre', '11 de septiembre'],
  'General San Martín': ['san martin', 'gral san martin', 'villa ballester', 'san andres', 'jose leon suarez', 'villa maipu', 'billinghurst', 'villa lynch', 'chilavert'],
  'Vicente López': ['vicente lopez', 'olivos', 'florida', 'munro', 'la lucila', 'carapachay', 'villa martelli', 'florida oeste'],
  'San Isidro': ['martinez', 'acassuso', 'beccar', 'boulogne', 'villa adelina'],
  'San Fernando': ['victoria', 'virreyes'],
  'Tigre': ['don torcuato', 'general pacheco', 'gral pacheco', 'pacheco', 'el talar', 'benavidez', 'nordelta', 'rincon de milberg', 'troncos del talar', 'ricardo rojas', 'dique lujan'],
  'San Miguel': ['bella vista', 'muniz', 'santa maria'],
  'Malvinas Argentinas': ['malvinas', 'los polvorines', 'grand bourg', 'tortuguitas', 'pablo nogues', 'villa de mayo', 'adolfo sourdeaux', 'tierras altas'],
  'Moreno': ['paso del rey', 'francisco alvarez', 'la reja', 'trujui', 'cuartel v'],
  'Merlo': ['libertad', 'parque san martin', 'mariano acosta', 'san antonio de padua', 'padua', 'pontevedra'],
  'Ezeiza': ['tristan suarez', 'carlos spegazzini', 'canning'],
  'Cañuelas': ['canuelas'],
  'Pilar': ['derqui', 'presidente derqui', 'del viso', 'villa rosa', 'manzanares', 'fatima', 'pilar sur', 'la lonja'],
  'Escobar': ['belen de escobar', 'garin', 'ingeniero maschwitz', 'maschwitz', 'matheu'],
  'La Plata': ['city bell', 'gonnet', 'manuel b gonnet', 'villa elisa', 'los hornos', 'tolosa', 'ringuelet', 'gorina', 'abasto', 'melchor romero', 'villa castells'],
  'General Rodríguez': ['gral rodriguez', 'general rodriguez'],
  'Luján': ['lujan', 'open door'],
}

export const norm = (s: string | null | undefined) =>
  (s || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase()
    .replace(/\b(partido de|pdo\.?|prov(incia)?\.? de buenos aires|bs\.? ?as\.?|buenos aires)\b/g, ' ')
    .replace(/[^a-z0-9 ]/g, ' ').replace(/\s+/g, ' ').trim()

const LOOKUP = new Map<string, string>()
for (const p of Object.keys(MOTO_PARTIDOS)) LOOKUP.set(norm(p), p)
for (const [p, list] of Object.entries(ALIASES)) for (const a of list) if (!LOOKUP.has(a)) LOOKUP.set(a, p)

/** Busca el partido con moto a partir de un texto libre (ciudad, localidad o barrio). */
export function partidoFromText(text: string | null | undefined): string | null {
  const t = norm(text)
  if (!t) return null
  if (LOOKUP.has(t)) return LOOKUP.get(t)!
  // Coincidencia por palabra completa dentro del texto (ej: "Monte Grande, Esteban Echeverría")
  let best: { p: string; len: number } | null = null
  for (const [k, p] of Array.from(LOOKUP.entries())) {
    if (k.length < 5) continue
    if ((' ' + t + ' ').includes(' ' + k + ' ') && (!best || k.length > best.len)) best = { p, len: k.length }
  }
  return best?.p ?? null
}

export const isCabaProvince = (prov: string | null | undefined) =>
  /capital federal|ciudad autonoma|caba/.test(norm(prov) || (prov || '').toLowerCase())

/** Provincias donde puede llegar la moto (para mostrar el selector de partido) */
export const isAmbaProvince = (prov: string | null | undefined) =>
  isCabaProvince(prov) || /gran buenos aires|^buenos aires$/i.test((prov || '').trim())

export type MotoMatch = { tier: MotoTier; partido: string }

/** Zona de moto según la dirección de la orden. null = no llega o no la reconocemos. */
export function motoMatchFromAddress(a: { province?: string; city?: string; locality?: string } | undefined | null): MotoMatch | null {
  if (!a) return null
  if (isCabaProvince(a.province)) return { tier: 'caba', partido: 'CABA' }
  if (!isAmbaProvince(a.province)) return null
  const p = partidoFromText(a.city) || partidoFromText(a.locality)
  return p ? { tier: MOTO_PARTIDOS[p], partido: p } : null
}

/** Para el selector: partidos con su monto de cambio por moto */
export function partidoOptions() {
  return [
    { name: 'CABA', tier: 'caba' as MotoTier, amount: motoAmount('caba') },
    ...Object.entries(MOTO_PARTIDOS)
      .sort(([a], [b]) => a.localeCompare(b, 'es'))
      .map(([name, tier]) => ({ name, tier, amount: motoAmount(tier) })),
  ]
}

export function matchFromPartido(name: string | null | undefined): MotoMatch | null {
  if (!name) return null
  if (name === 'CABA') return { tier: 'caba', partido: 'CABA' }
  return MOTO_PARTIDOS[name] ? { tier: MOTO_PARTIDOS[name], partido: name } : null
}
