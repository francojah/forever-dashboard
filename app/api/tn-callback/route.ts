import { NextRequest, NextResponse } from 'next/server'
import { cookies } from 'next/headers'
import { createClient } from '@supabase/supabase-js'
import { apiContext } from '@/lib/faro/context'
import { svc } from '@/lib/faro/db'
import { fetchStoreInfo } from '@/lib/faro/tiendanube'

const APP_ID       = process.env.TIENDANUBE_APP_ID || ''
const APP_SECRET   = process.env.TIENDANUBE_CLIENT_SECRET || ''
const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL!
const SUPABASE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY!

/**
 * Vuelta de la instalación de la app de Tiendanube (OAuth).
 * - Guarda la tienda como conexión del espacio activo (Faro v2).
 * - Mantiene app_config.tiendanube_credentials para el módulo de Cambios, pero solo
 *   si es la misma tienda que ya estaba (o no había ninguna): conectar otra tienda
 *   no pisa la de Forever.
 */
export async function GET(req: NextRequest) {
  const code = new URL(req.url).searchParams.get('code')
  const back = (q: string) => NextResponse.redirect(new URL(`/ajustes?tab=conexiones&${q}`, req.url))
  if (!code) return back('error=tn-codigo')

  try {
    const tokenRes = await fetch('https://www.tiendanube.com/apps/authorize/token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ client_id: APP_ID, client_secret: APP_SECRET, grant_type: 'authorization_code', code }),
    })
    const tokenData = await tokenRes.json()
    if (!tokenData.access_token) throw new Error(tokenData.error_description || tokenData.error || 'Tiendanube no devolvió token')
    const accessToken = String(tokenData.access_token)
    const userId = String(tokenData.user_id)

    // Compatibilidad con el módulo de Cambios
    const legacy = createClient(SUPABASE_URL, SUPABASE_KEY)
    const { data: current } = await legacy.from('app_config').select('value').eq('key', 'tiendanube_credentials').maybeSingle()
    const currentUser = (current?.value as { user_id?: string | number } | null)?.user_id
    if (!currentUser || String(currentUser) === userId) {
      await legacy.from('app_config').upsert({
        key: 'tiendanube_credentials',
        value: { access_token: accessToken, user_id: userId, connected_at: new Date().toISOString() },
      }, { onConflict: 'key' })
    }

    // Faro v2: sumar la tienda al espacio
    const wsCookie = cookies().get('faro_tn_ws')?.value
    const ctx = await apiContext(wsCookie)
    if (ctx instanceof Response) return NextResponse.redirect(new URL('/login', req.url))
    const info = await fetchStoreInfo(userId, accessToken).catch(() => ({ name: `Tienda ${userId}`, currency: 'ARS', url: null }))
    const sb = svc()
    // Una tienda pertenece a un solo negocio. Si ya está en otro, casi siempre es porque
    // Tiendanube tenía abierta la sesión de otra tienda al autorizar.
    const { data: elsewhere } = await sb.from('stores').select('workspace_id, workspaces(name)')
      .eq('platform', 'tiendanube').eq('external_id', userId).neq('workspace_id', ctx.workspace.id).limit(1).maybeSingle()
    if (elsewhere) {
      const other = (elsewhere as unknown as { workspaces?: { name?: string } | null }).workspaces?.name || 'otro negocio'
      cookies().delete('faro_tn_ws')
      return back(`error=${encodeURIComponent(`La tienda ${info.name} ya está conectada en ${other}. Cerrá sesión en Tiendanube, entrá con la cuenta de la tienda que querés sumar y volvé a conectar.`)}`)
    }
    const { data: conn, error } = await sb.from('connections').upsert({
      workspace_id: ctx.workspace.id, provider: 'tiendanube', external_id: userId, label: info.name,
      access_token: accessToken, status: 'ok', last_error: null, updated_at: new Date().toISOString(),
    }, { onConflict: 'workspace_id,provider,external_id' }).select('id').single()
    if (error || !conn) throw new Error(error?.message || 'No se pudo guardar la conexión')
    await sb.from('stores').upsert({
      workspace_id: ctx.workspace.id, connection_id: conn.id, platform: 'tiendanube', external_id: userId,
      name: info.name, url: info.url, currency: info.currency, active: true,
    }, { onConflict: 'workspace_id,platform,external_id' })
    cookies().delete('faro_tn_ws')
    return back('store=ok')
  } catch (err) {
    return back(`error=${encodeURIComponent(err instanceof Error ? err.message : 'tn')}`)
  }
}
