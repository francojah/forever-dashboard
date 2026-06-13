import { NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

const APP_ID       = process.env.TIENDANUBE_APP_ID || '30221'
const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL!
const SUPABASE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY!
const TN_API       = 'https://api.tiendanube.com/v1'

export const dynamic = 'force-dynamic'

interface TNCredentials {
  token:  string
  userId: string
  source: 'supabase' | 'env'
  connectedAt?: string
}

async function resolveCredentials(): Promise<TNCredentials | null> {
  // 1. Try Supabase app_config (set via OAuth reconnect)
  if (SUPABASE_URL && SUPABASE_KEY) {
    try {
      const supabase = createClient(SUPABASE_URL, SUPABASE_KEY)
      const { data } = await supabase
        .from('app_config')
        .select('value, updated_at')
        .eq('key', 'tiendanube_credentials')
        .single()
      if (data?.value?.access_token && data?.value?.user_id) {
        return {
          token:       data.value.access_token,
          userId:      data.value.user_id,
          source:      'supabase',
          connectedAt: data.value.connected_at || data.updated_at,
        }
      }
    } catch { /* table may not exist yet */ }
  }

  // 2. Fallback to env vars
  const token  = process.env.TIENDANUBE_ACCESS_TOKEN
  const userId = process.env.TIENDANUBE_USER_ID
  if (token && userId) {
    return { token, userId, source: 'env' }
  }

  return null
}

export async function GET() {
  const reconnect_url = `https://www.tiendanube.com/apps/${APP_ID}/authorize`

  const creds = await resolveCredentials()

  if (!creds) {
    return NextResponse.json({
      configured:    false,
      valid:         false,
      source:        'none',
      error:         'Variables TIENDANUBE_ACCESS_TOKEN o TIENDANUBE_USER_ID no están configuradas en Vercel.',
      reconnect_url,
    })
  }

  // Validate token with a lightweight store info call
  try {
    const res = await fetch(`${TN_API}/${creds.userId}/store`, {
      headers: {
        'Authentication': `bearer ${creds.token}`,
        'User-Agent': 'ForeverDashboard/1.0 (francojah@gmail.com)',
      },
      cache: 'no-store',
    })

    const data = await res.json()

    if (data.error || data.code) {
      return NextResponse.json({
        configured:    true,
        valid:         false,
        source:        creds.source,
        user_id:       creds.userId,
        error:         data.description || data.error || 'Token inválido',
        reconnect_url,
      })
    }

    return NextResponse.json({
      configured:    true,
      valid:         true,
      source:        creds.source,
      user_id:       creds.userId,
      store_name:    data.name?.es || data.name?.en || data.original_domain || 'Mi Tienda',
      store_url:     data.original_domain ? `https://${data.original_domain}` : null,
      connected_at:  creds.connectedAt || null,
    })
  } catch (e) {
    return NextResponse.json({
      configured:    true,
      valid:         false,
      source:        creds.source,
      user_id:       creds.userId,
      error:         e instanceof Error ? e.message : 'Error de conexión con Tiendanube',
      reconnect_url,
    })
  }
}
