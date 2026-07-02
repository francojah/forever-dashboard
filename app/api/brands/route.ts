import { NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { createClientServer } from '@/lib/supabase'

export const dynamic = 'force-dynamic'

/**
 * GET  /api/brands   → marcas del usuario autenticado
 * POST /api/brands   → crea una marca y la vincula al usuario como owner
 *
 * La inserción usa service-role (brands no tiene policy de INSERT), pero SIEMPRE
 * se ata al usuario autenticado obtenido de la sesión.
 */

function slugify(name: string): string {
  const base = name.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') || 'marca'
  return `${base}-${Math.random().toString(36).slice(2, 6)}`
}

async function getUser() {
  const supa = createClientServer()
  const { data } = await supa.auth.getUser()
  return data.user
}

function service() {
  return createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!)
}

export async function GET() {
  const user = await getUser()
  if (!user) return NextResponse.json({ error: 'No autenticado' }, { status: 401 })
  const sb = service()
  const { data: links } = await sb.from('user_brands').select('brand_id, role').eq('user_id', user.id)
  const ids = (links || []).map((l: { brand_id: string }) => l.brand_id)
  if (!ids.length) return NextResponse.json({ brands: [] })
  const { data: brands } = await sb.from('brands').select('id, name, slug, meta_account_id, tn_user_id, active, settings').in('id', ids)
  return NextResponse.json({ brands: brands || [] })
}

export async function POST(req: Request) {
  const user = await getUser()
  if (!user) return NextResponse.json({ error: 'No autenticado' }, { status: 401 })

  let body: {
    name?: string
    platform?: string
    currency?: string
    settings?: Record<string, number>
  }
  try { body = await req.json() } catch { return NextResponse.json({ error: 'JSON inválido' }, { status: 400 }) }

  const name = (body.name || '').trim()
  if (!name) return NextResponse.json({ error: 'El nombre de la marca es requerido' }, { status: 400 })

  const sb = service()
  const settings = {
    breakeven_cpa: body.settings?.breakeven_cpa ?? 30462,
    roas_min: body.settings?.roas_min ?? 1.77,
    currency: body.currency || 'ARS',
    margin_pct: body.settings?.margin_pct ?? 53,
    avg_ticket: body.settings?.avg_ticket ?? 57500,
    platform: body.platform || 'tiendanube',
  }

  const { data: brand, error } = await sb
    .from('brands')
    .insert({ name, slug: slugify(name), settings, active: true })
    .select('id, name, slug')
    .single()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  const { error: linkErr } = await sb.from('user_brands').insert({ user_id: user.id, brand_id: brand.id, role: 'owner' })
  if (linkErr) return NextResponse.json({ error: linkErr.message }, { status: 500 })

  return NextResponse.json({ ok: true, brand })
}
