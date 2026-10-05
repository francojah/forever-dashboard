/**
 * Sucursales de Correo Argentino, consultadas en vivo al buscador público de correoargentino.com.ar
 * (el mismo que usa su página "Nuestras sucursales"). Sin credenciales.
 * Si el sitio del correo no responde, el formulario deja escribir la sucursal a mano.
 */
const WS = 'https://www.correoargentino.com.ar/sites/all/modules/custom/ca_forms/api/wsFacade.php'
const TTL = 12 * 3600 * 1000

export type Localidad = { id: string; nombre: string; cp: string }
export type Sucursal = { name: string; address: string; locality: string; hours: string }

const cache = new Map<string, { at: number; value: unknown }>()

async function call(params: Record<string, string>): Promise<string> {
  // El WS del correo a veces devuelve vacío: reintentamos (su propia web hace lo mismo)
  let last: unknown
  for (let i = 0; i < 3; i++) {
    try {
      const txt = await callOnce(params)
      if (txt) return txt
    } catch (e) { last = e }
  }
  throw last instanceof Error ? last : new Error('Correo sin respuesta')
}

async function callOnce(params: Record<string, string>): Promise<string> {
  const ctrl = new AbortController()
  const t = setTimeout(() => ctrl.abort(), 9000)
  try {
    const res = await fetch(WS, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded; charset=UTF-8',
        'X-Requested-With': 'XMLHttpRequest',
        'User-Agent': 'Mozilla/5.0 (compatible; ForeverBasicsCambios/1.0)',
      },
      body: new URLSearchParams(params).toString(),
      cache: 'no-store',
      signal: ctrl.signal,
    })
    if (!res.ok) throw new Error(`Correo HTTP ${res.status}`)
    // El sitio responde en latin1/utf-8 según el endpoint: decodificamos tolerante
    const buf = Buffer.from(await res.arrayBuffer())
    const utf = buf.toString('utf8')
    return (utf.includes('\uFFFD') ? buf.toString('latin1') : utf).replace(/^\uFEFF/, '').trim()
  } finally {
    clearTimeout(t)
  }
}

const title = (s: string) =>
  s.toLowerCase().replace(/(^|[\s(.\-/])([a-záéíóúñü])/g, (_, a, b) => a + b.toUpperCase()).replace(/\bN°\b/gi, 'N°').trim()
const clean = (s: string) => s.replace(/<[^>]+>/g, ' ').replace(/&nbsp;/g, ' ').replace(/\s+/g, ' ').trim()

export async function getLocalidades(provincia: string): Promise<Localidad[]> {
  if (provincia === 'C') return [{ id: '5001', nombre: 'Ciudad Autónoma de Buenos Aires', cp: '' }]
  const key = `loc:${provincia}`
  const hit = cache.get(key)
  if (hit && Date.now() - hit.at < TTL) return hit.value as Localidad[]
  const txt = await call({ action: 'localidadesconsucursales', provincia })
  const json = JSON.parse(txt) as { Localidades?: { lista?: { id: string; nombre: string; cp: string }[] } }
  const list = (json.Localidades?.lista ?? [])
    .filter((l) => l.id && l.id !== 'none')
    .map((l) => ({ id: String(l.id), nombre: title(l.nombre), cp: String(l.cp || '') }))
    .sort((a, b) => a.nombre.localeCompare(b.nombre, 'es'))
  if (list.length) cache.set(key, { at: Date.now(), value: list })
  return list
}

export async function getSucursales(provincia: string, localidad: string): Promise<Sucursal[]> {
  const key = `suc:${provincia}:${localidad}`
  const hit = cache.get(key)
  if (hit && Date.now() - hit.at < TTL) return hit.value as Sucursal[]
  const html = await call({ action: 'sucursales', provincia, localidad, departamento: 'none', nis: '', servicios: '' })
  const out: Sucursal[] = []
  const re = /<address>([\s\S]*?)<\/address>\s*(?:<p>\s*<strong>HORARIOS:\s*<\/strong>([\s\S]*?)<\/p>)?/gi
  let m: RegExpExecArray | null
  while ((m = re.exec(html))) {
    const parts = m[1].split(/<\/?br\s*\/?>/i).map(clean).filter(Boolean)
    const name = title((parts[0] || '').replace(/\s*:\s*/, ' '))
    if (!name || /\{nis\}/.test(name)) continue
    out.push({ name, address: title(parts[1] || ''), locality: title(parts[2] || ''), hours: clean(m[2] || '') })
  }
  // Sin duplicados (el HTML repite bloques)
  const seen = new Set<string>()
  const list = out.filter((s) => { const k = `${s.name}|${s.address}`; if (seen.has(k)) return false; seen.add(k); return true })
    .sort((a, b) => a.name.localeCompare(b.name, 'es'))
  if (list.length) cache.set(key, { at: Date.now(), value: list })
  return list
}
