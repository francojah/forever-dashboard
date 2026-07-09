import { NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

// Intraday Meta spend — called from client to get today's real-time spend
// Bypasses the snapshot (which is updated every 4h) for live "Hoy" data
export const runtime = 'edge'
export const revalidate = 0

const ALLOWED_PRESETS = new Set(['today', 'yesterday', 'this_month', 'last_month', 'last_7d', 'last_30d'])

export async function GET(req: Request) {
  try {
    const presetParam = new URL(req.url).searchParams.get('preset') || 'today'
    const preset = ALLOWED_PRESETS.has(presetParam) ? presetParam : 'today'
    const supabase = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!
    )

    // Get Meta token — prefer Supabase-stored, fallback to env
    const { data: tokenData } = await supabase
      .from('app_config')
      .select('value')
      .eq('key', 'meta_access_token')
      .single()

    const token =
      (tokenData?.value as { access_token?: string } | null)?.access_token ||
      process.env.META_ACCESS_TOKEN

    const accountId = process.env.META_ACCOUNT_ID

    if (!token || !accountId) {
      return NextResponse.json({ error: 'No Meta credentials' }, { status: 500 })
    }

    // El env puede venir con o sin el prefijo "act_"; normalizamos para no duplicarlo.
    const acct = accountId.startsWith('act_') ? accountId : `act_${accountId}`
    const url = new URL(`https://graph.facebook.com/v21.0/${acct}/insights`)
    url.searchParams.set('date_preset', preset)
    url.searchParams.set('fields', 'spend,actions,impressions,clicks')
    url.searchParams.set('level', 'account')
    url.searchParams.set('access_token', token)

    const res = await fetch(url.toString(), { cache: 'no-store' })
    const data = await res.json() as {
      data?: { spend?: string; impressions?: string; clicks?: string; actions?: { action_type: string; value: string }[] }[]
      error?: { message: string }
    }

    if (data.error) {
      return NextResponse.json({ error: data.error.message }, { status: 400 })
    }

    const insight = data.data?.[0]
    const spend      = parseFloat(insight?.spend      || '0')
    const impressions = parseInt(insight?.impressions || '0')
    const clicks     = parseInt(insight?.clicks      || '0')
    const purchases  = parseInt(
      insight?.actions?.find(a => a.action_type === 'purchase')?.value || '0'
    )

    return NextResponse.json({ spend, purchases, impressions, clicks })
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'Error'
    return NextResponse.json({ error: msg }, { status: 500 })
  }
}
