import { cookies } from 'next/headers'
import { cache } from 'react'
import { createClientServer } from '@/lib/supabase'
import { svc } from './db'
import { normalizeSettings, WorkspaceSettings } from './settings'
import type { StoreRow } from './tiendanube'
import type { AdAccountRow } from './meta'
import { fetchStoreInfo } from './tiendanube'
import { fetchAccountInfo, graphGet } from './meta'

export const WS_COOKIE = 'faro_ws'

export interface Workspace {
  id: string
  name: string
  slug: string
  currency: string
  timezone: string
  modules: string[]
  settings: WorkspaceSettings
  rawSettings: Record<string, unknown>
}

export interface FaroContext {
  user: { id: string; email: string }
  role: 'owner' | 'editor' | 'viewer'
  workspace: Workspace
  workspaces: { id: string; name: string }[]
  stores: (StoreRow & { last_synced_at: string | null; last_sync_error: string | null; url: string | null; currency: string; active: boolean })[]
  adAccounts: (AdAccountRow & { active: boolean; currency: string; last_sync_error: string | null })[]
}

export class NeedsMigrationError extends Error {}

/** Usuario logueado o null. */
export async function currentUser(): Promise<{ id: string; email: string } | null> {
  const sb = createClientServer()
  const { data: { user } } = await sb.auth.getUser()
  return user ? { id: user.id, email: user.email || '' } : null
}

function slugify(name: string) {
  const base = name.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') || 'negocio'
  return `${base}-${Math.random().toString(36).slice(2, 6)}`
}

export async function createWorkspace(userId: string, name: string): Promise<string> {
  const sb = svc()
  const { data, error } = await sb.from('workspaces').insert({ name, slug: slugify(name), settings: {} }).select('id').single()
  if (error || !data) throw new Error(error?.message || 'No se pudo crear el espacio')
  await sb.from('workspace_members').insert({ workspace_id: data.id, user_id: userId, role: 'owner' })
  return data.id as string
}

/**
 * Contexto de la request: usuario, espacio activo (cookie), tiendas y cuentas.
 * Si el usuario no tiene espacio, se crea uno vacío para que haga el onboarding.
 */
export async function getContext(opts: { workspaceId?: string } = {}): Promise<FaroContext | null> {
  const user = await currentUser()
  if (!user) return null
  const sb = svc()

  const { data: mem, error } = await sb
    .from('workspace_members')
    .select('role, workspace:workspaces(id,name,slug,currency,timezone,modules,settings)')
    .eq('user_id', user.id)
  if (error) {
    if (/relation .* does not exist|Could not find the table/i.test(error.message)) throw new NeedsMigrationError(error.message)
    throw new Error(error.message)
  }
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let memberships = (mem || []).filter((m: any) => m.workspace) as any[]
  if (!memberships.length) {
    await createWorkspace(user.id, 'Mi negocio')
    return getContext(opts)
  }
  memberships = memberships.sort((a, b) => String(a.workspace.name).localeCompare(String(b.workspace.name)))

  let wanted = opts.workspaceId
  if (!wanted) {
    try { wanted = cookies().get(WS_COOKIE)?.value } catch { /* fuera de request */ }
  }
  const current = memberships.find((m) => m.workspace.id === wanted) || memberships[0]
  const w = current.workspace
  let workspace: Workspace = {
    id: w.id, name: w.name, slug: w.slug, currency: w.currency, timezone: w.timezone, modules: w.modules || [],
    settings: normalizeSettings(w.settings), rawSettings: w.settings || {},
  }

  let [{ data: stores }, { data: accounts }] = await Promise.all([
    sb.from('stores').select('*').eq('workspace_id', w.id).order('created_at'),
    sb.from('ad_accounts').select('*').eq('workspace_id', w.id).order('created_at'),
  ])

  // Primer ingreso al espacio original: importar las credenciales que ya usaba la app
  if (!workspace.rawSettings.bootstrapped && (!stores?.length && !accounts?.length)) {
    await bootstrapLegacy(workspace).catch((e) => console.warn('bootstrap', e))
    const [{ data: s2 }, { data: a2 }, { data: w2 }] = await Promise.all([
      sb.from('stores').select('*').eq('workspace_id', w.id).order('created_at'),
      sb.from('ad_accounts').select('*').eq('workspace_id', w.id).order('created_at'),
      sb.from('workspaces').select('settings').eq('id', w.id).single(),
    ])
    stores = s2; accounts = a2
    workspace = { ...workspace, settings: normalizeSettings(w2?.settings), rawSettings: w2?.settings || {} }
  }

  return {
    user,
    role: current.role,
    workspace,
    workspaces: memberships.map((m) => ({ id: m.workspace.id, name: m.workspace.name })),
    stores: (stores || []) as FaroContext['stores'],
    adAccounts: (accounts || []) as FaroContext['adAccounts'],
  }
}

/**
 * Importa al espacio las credenciales que la app vieja guardaba en app_config / variables
 * de entorno (una tienda y una cuenta de Meta) y los parámetros de costos.
 * Solo corre una vez por espacio y solo si el espacio es el creado por la migración.
 */
export async function bootstrapLegacy(ws: Workspace) {
  const sb = svc()
  if (ws.slug !== 'forever-basics') {
    await sb.from('workspaces').update({ settings: { ...ws.rawSettings, bootstrapped: true } }).eq('id', ws.id)
    return
  }
  const cfg = async (key: string) => {
    const { data } = await sb.from('app_config').select('value').eq('key', key).maybeSingle()
    return (data?.value || null) as Record<string, string> | null
  }

  // Tiendanube
  const tn = await cfg('tiendanube_credentials')
  const tnToken = tn?.access_token || process.env.TIENDANUBE_ACCESS_TOKEN
  const tnUser = tn?.user_id || process.env.TIENDANUBE_USER_ID
  if (tnToken && tnUser) {
    const info = await fetchStoreInfo(String(tnUser), tnToken).catch(() => ({ name: ws.name, currency: 'ARS', url: null }))
    const { data: conn } = await sb.from('connections').upsert({
      workspace_id: ws.id, provider: 'tiendanube', external_id: String(tnUser), label: info.name, access_token: tnToken,
    }, { onConflict: 'workspace_id,provider,external_id' }).select('id').single()
    await sb.from('stores').upsert({
      workspace_id: ws.id, connection_id: conn?.id, platform: 'tiendanube', external_id: String(tnUser),
      name: info.name, url: info.url, currency: info.currency,
    }, { onConflict: 'workspace_id,platform,external_id' })
  }

  // Meta
  const mt = await cfg('meta_access_token')
  const metaToken = mt?.access_token || process.env.META_ACCESS_TOKEN
  const active = await cfg('meta_active_account')
  let accountId = active?.account_id || process.env.META_ACCOUNT_ID || ''
  if (accountId && !accountId.startsWith('act_')) accountId = `act_${accountId}`
  if (metaToken && accountId) {
    const me = await graphGet<{ id: string; name?: string }>('me', metaToken, { fields: 'id,name' }).catch(() => ({ id: 'legacy', name: 'Token anterior' }))
    const { data: conn } = await sb.from('connections').upsert({
      workspace_id: ws.id, provider: 'meta', external_id: String(me.id), label: me.name || 'Meta', access_token: metaToken,
      meta: { source: 'legacy' },
    }, { onConflict: 'workspace_id,provider,external_id' }).select('id').single()
    const info = await fetchAccountInfo(accountId, metaToken).catch(() => ({ name: accountId, currency: 'ARS', timezone: null }))
    await sb.from('ad_accounts').upsert({
      workspace_id: ws.id, connection_id: conn?.id, external_id: accountId, name: info.name, currency: info.currency, timezone: info.timezone,
    }, { onConflict: 'workspace_id,external_id' })
  }

  // Parámetros de costos de la configuración vieja
  const { data: legacy } = await sb.from('app_settings').select('key, value')
  const get = (k: string) => {
    const row = (legacy || []).find((r: { key: string }) => r.key === k)
    const v = row ? Number(row.value) : NaN
    return isFinite(v) ? v : undefined
  }
  const settings = {
    ...ws.rawSettings,
    bootstrapped: true,
    platform_fee_pct: get('tn_commission_pct') ?? 0,
    packaging_per_order: get('packaging_per_order') ?? 0,
    iibb_pct: get('iibb_rate_pct') ?? 0,
  }
  await sb.from('workspaces').update({ settings }).eq('id', ws.id)

  // Costos por producto cargados en la app vieja → cost_items (nivel producto)
  const { data: store } = await sb.from('stores').select('id').eq('workspace_id', ws.id).limit(1).maybeSingle()
  if (store?.id) {
    const { data: pc } = await sb.from('product_costs').select('product_id, product_name, unit_cost')
    const rows = (pc || []).filter((r: { unit_cost: number }) => Number(r.unit_cost) > 0).map((r: { product_id: string; product_name: string; unit_cost: number }) => ({
      store_id: store.id, product_id: String(r.product_id), variant_id: '', name: r.product_name || '', unit_cost: Number(r.unit_cost), valid_from: '2000-01-01',
    }))
    if (rows.length) await sb.from('cost_items').upsert(rows, { onConflict: 'store_id,product_id,variant_id,valid_from' })
  }
}

/** Para rutas de API: contexto o respuesta 401/409. */
export async function apiContext(workspaceId?: string): Promise<FaroContext | Response> {
  try {
    const ctx = await getContext({ workspaceId })
    if (!ctx) return Response.json({ error: 'No autorizado' }, { status: 401 })
    return ctx
  } catch (e) {
    if (e instanceof NeedsMigrationError) return Response.json({ error: 'Falta correr la migración de Faro v2 en Supabase' }, { status: 409 })
    return Response.json({ error: e instanceof Error ? e.message : 'Error' }, { status: 500 })
  }
}

export function canEdit(ctx: FaroContext) {
  return ctx.role === 'owner' || ctx.role === 'editor'
}

/** Contexto memoizado por request (layout + página comparten las mismas consultas). */
export const getRequestContext = cache(async () => getContext())
