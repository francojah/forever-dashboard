import { NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

function sb() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  )
}

// GET /api/expenses?year=2026
export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url)
    const year = searchParams.get('year')

    let query = sb()
      .from('variable_expenses')
      .select('*')
      .order('created_at', { ascending: false })

    if (year) query = query.like('month', `${year}-%`)

    const { data, error } = await query
    if (error) return NextResponse.json({ error: error.message }, { status: 500 })
    return NextResponse.json(data ?? [])
  } catch (e) {
    return NextResponse.json({ error: String(e) }, { status: 500 })
  }
}

// POST /api/expenses  { month, category, description, amount_ars }
export async function POST(request: Request) {
  try {
    const { month, category, description, amount_ars } = await request.json()
    if (!month || !category || !description || !amount_ars) {
      return NextResponse.json({ error: 'Campos incompletos' }, { status: 400 })
    }

    const { data, error } = await sb()
      .from('variable_expenses')
      .insert({ month, category, description, amount_ars: Number(amount_ars) })
      .select()
      .single()

    if (error) return NextResponse.json({ error: error.message }, { status: 500 })
    return NextResponse.json(data)
  } catch (e) {
    return NextResponse.json({ error: String(e) }, { status: 500 })
  }
}

// DELETE /api/expenses?id=uuid
export async function DELETE(request: Request) {
  try {
    const { searchParams } = new URL(request.url)
    const id = searchParams.get('id')
    if (!id) return NextResponse.json({ error: 'Falta id' }, { status: 400 })

    const { error } = await sb().from('variable_expenses').delete().eq('id', id)
    if (error) return NextResponse.json({ error: error.message }, { status: 500 })
    return NextResponse.json({ ok: true })
  } catch (e) {
    return NextResponse.json({ error: String(e) }, { status: 500 })
  }
}
