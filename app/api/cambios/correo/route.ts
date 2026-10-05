import { NextResponse } from 'next/server'
import { getLocalidades, getSucursales } from '@/lib/cambios/correo'
import { PROVINCIAS } from '@/lib/cambios/config'

export const dynamic = 'force-dynamic'

/** GET ?provincia=B → localidades · GET ?provincia=B&localidad=123 → sucursales */
export async function GET(req: Request) {
  const q = new URL(req.url).searchParams
  const provincia = (q.get('provincia') || '').toUpperCase()
  const localidad = (q.get('localidad') || '').replace(/[^0-9]/g, '')
  if (!PROVINCIAS.some((p) => p.code === provincia)) return NextResponse.json({ ok: false, reason: 'Provincia inválida' }, { status: 400 })
  try {
    const headers = { 'Cache-Control': 'public, s-maxage=43200, stale-while-revalidate=86400' }
    if (!localidad) return NextResponse.json({ ok: true, localidades: await getLocalidades(provincia) }, { headers })
    return NextResponse.json({ ok: true, sucursales: await getSucursales(provincia, localidad) }, { headers })
  } catch (e) {
    console.error('[cambios/correo]', e)
    // El formulario cae a "escribí tu sucursal" cuando esto falla
    return NextResponse.json({ ok: false, reason: 'No pudimos consultar las sucursales del correo.' }, { status: 502 })
  }
}
