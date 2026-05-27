import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL!
const SUPABASE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY!

const DEFAULTS: Record<string, number> = {
  breakeven_cpa:     17500,
  roas_min:          2.86,
  roas_scale:        6,
  tn_commission_pct: 3.5,
  shipping_pct:      8,
}

export async function GET() {
  try {
    const supabase = createClient(SUPABASE_URL, SUPABASE_KEY)
    const { data, error } = await supabase
      .from('app_settings')
      .select('key, value')

    if (error) throw error

    const settings: Record<string, number> = { ...DEFAULTS }
    ;(data || []).forEach(({ key, value }) => {
      settings[key] = typeof value === 'number' ? value : parseFloat(String(value))
    })

    return NextResponse.json(settings)
  } catch {
    return NextResponse.json(DEFAULTS)
  }
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json()
    const supabase = createClient(SUPABASE_URL, SUPABASE_KEY)

    const upserts = Object.entries(body).map(([key, value]) => ({
      key,
      value,
      updated_at: new Date().toISOString(),
    }))

    const { error } = await supabase
      .from('app_settings')
      .upsert(upserts, { onConflict: 'key' })

    if (error) throw error

    return NextResponse.json({ ok: true })
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'Error'
    return NextResponse.json({ error: msg }, { status: 500 })
  }
}
