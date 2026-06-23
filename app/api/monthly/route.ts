import { NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

function sb() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  )
}

// GET /api/monthly?year=2026
export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url)
    const year = searchParams.get('year')

    let query = sb()
      .from('monthly_summaries')
      .select('*')
      .order('month', { ascending: false })

    if (year) query = query.like('month', `${year}-%`)

    const { data, error } = await query
    if (error) return NextResponse.json({ error: error.message }, { status: 500 })
    return NextResponse.json(data ?? [])
  } catch (e) {
    return NextResponse.json({ error: String(e) }, { status: 500 })
  }
}

// POST /api/monthly  { month, meta_spend, tn_revenue, tn_orders, tn_units, notes }
// Uses upsert — creates or updates by month key
export async function POST(request: Request) {
  try {
    const body = await request.json()
    const { month, meta_spend, tn_revenue, tn_orders, tn_units, notes } = body
    if (!month) return NextResponse.json({ error: 'Falta month' }, { status: 400 })

    const { data, error } = await sb()
      .from('monthly_summaries')
      .upsert({
        month,
        meta_spend:  meta_spend  != null ? Number(meta_spend)  : null,
        tn_revenue:  tn_revenue  != null ? Number(tn_revenue)  : null,
        tn_orders:   tn_orders   != null ? Number(tn_orders)   : null,
        tn_units:    tn_units    != null ? Number(tn_units)    : null,
        notes:       notes ?? null,
        updated_at:  new Date().toISOString(),
      }, { onConflict: 'month' })
      .select()
      .single()

    if (error) return NextResponse.json({ error: error.message }, { status: 500 })
    return NextResponse.json(data)
  } catch (e) {
    return NextResponse.json({ error: String(e) }, { status: 500 })
  }
}
