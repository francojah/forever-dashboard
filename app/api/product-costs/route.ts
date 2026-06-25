/**
 * GET  /api/product-costs          — devuelve todos los costos guardados
 * POST /api/product-costs          — upsert { product_id, product_name, unit_cost }
 */

import { NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

function sb() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  )
}

export async function GET() {
  try {
    const { data, error } = await sb()
      .from('product_costs')
      .select('*')
      .order('product_name', { ascending: true })

    if (error) return NextResponse.json({ error: error.message }, { status: 500 })
    return NextResponse.json(data ?? [])
  } catch (e) {
    return NextResponse.json({ error: String(e) }, { status: 500 })
  }
}

// POST: upsert a single product cost
export async function POST(request: Request) {
  try {
    const body = await request.json()
    const { product_id, product_name, unit_cost } = body

    if (!product_id || unit_cost == null) {
      return NextResponse.json({ error: 'product_id y unit_cost son requeridos' }, { status: 400 })
    }

    const { data, error } = await sb()
      .from('product_costs')
      .upsert(
        {
          product_id: String(product_id),
          product_name: product_name ?? '',
          unit_cost: Number(unit_cost),
          updated_at: new Date().toISOString(),
        },
        { onConflict: 'product_id' }
      )
      .select()
      .single()

    if (error) return NextResponse.json({ error: error.message }, { status: 500 })
    return NextResponse.json(data)
  } catch (e) {
    return NextResponse.json({ error: String(e) }, { status: 500 })
  }
}
