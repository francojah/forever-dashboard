import { svc, upsertChunks, logSync } from './db'
import { addDays, localDate } from './dates'

export const META_VERSION = process.env.META_API_VERSION || 'v24.0'
const GRAPH = `https://graph.facebook.com/${META_VERSION}`

export interface AdAccountRow {
  id: string
  workspace_id: string
  connection_id: string | null
  external_id: string
  name: string
  timezone: string | null
  insights_from: string | null
  last_synced_at: string | null
  last_entities_at: string | null
  protected_ids: string[]
}

export class MetaError extends Error {
  code?: number
  subcode?: number
  constructor(msg: string, code?: number, subcode?: number) {
    super(msg)
    this.code = code
    this.subcode = subcode
  }
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms))

function withToken(url: string, token: string) {
  const u = new URL(url)
  if (!u.searchParams.has('access_token')) u.searchParams.set('access_token', token)
  return u.toString()
}

export const HISTORY_DAYS = 400

/** ¿Ya se trajo todo el historial de métricas de la cuenta? */
export function metaHistoryDone(acc: { insights_from: string | null; timezone?: string | null }) {
  if (!acc.insights_from) return false
  return acc.insights_from <= addDays(localDate(new Date(), acc.timezone || 'America/Argentina/Buenos_Aires'), -HISTORY_DAYS)
}

export const RATE_LIMIT_PREFIX = 'Límite de Meta:'
export const COOLDOWN_MIN = 15

/** Límite de uso de la cuenta o del usuario: no tiene sentido reintentar enseguida. */
export const isRateLimit = (e: unknown) =>
  e instanceof MetaError && ([17, 80000, 80001, 80002, 80003, 80004, 80005, 80006, 80008, 80014].includes(e.code ?? -1) || /demasiadas llamadas|too many calls|rate limit/i.test(e.message))

/** Meta no puede devolver tanto en una sola respuesta. */
export const isTooMuchData = (e: unknown) =>
  e instanceof MetaError && (/reduce the amount of data|reducir la cantidad de datos/i.test(e.message) || (e.code === 1 && e.subcode === 99))

/** GET a la Graph API. Reintenta solo errores transitorios; los límites de la cuenta se cortan enseguida. */
export async function graphGet<T = unknown>(path: string, token: string, params: Record<string, string> = {}): Promise<T> {
  const url = path.startsWith('http') ? path : `${GRAPH}/${path}?${new URLSearchParams(params)}`
  for (let attempt = 0; attempt < 3; attempt++) {
    const res = await fetch(withToken(url, token), { cache: 'no-store' })
    const json = await res.json().catch(() => ({}))
    if (json?.error) {
      const e = json.error
      const err = new MetaError(e.error_user_msg || e.message || 'Error de Meta', e.code, e.error_subcode)
      // 2 = temporal, 4/32/613 = picos de la app → esperar un poco y reintentar
      if (!isRateLimit(err) && !isTooMuchData(err) && [2, 4, 32, 613].includes(e.code) && attempt < 2) { await sleep(2000 * (attempt + 1)); continue }
      throw err
    }
    return json as T
  }
  throw new MetaError('Meta: límite de uso alcanzado, reintentá en unos minutos')
}

export async function graphPost<T = unknown>(path: string, token: string, body: Record<string, unknown>): Promise<T> {
  const form = new URLSearchParams()
  for (const [k, v] of Object.entries(body)) {
    if (v === undefined) continue
    form.set(k, typeof v === 'string' ? v : JSON.stringify(v))
  }
  form.set('access_token', token)
  const res = await fetch(`${GRAPH}/${path}`, { method: 'POST', body: form, headers: { 'Content-Type': 'application/x-www-form-urlencoded' } })
  const json = await res.json().catch(() => ({}))
  if (json?.error) {
    const e = json.error
    throw new MetaError(e.error_user_msg || e.error_user_title || e.message || 'Error de Meta', e.code, e.error_subcode)
  }
  return json as T
}

/** Recorre todas las páginas de un edge. Si Meta pide menos datos, achica el tamaño de página y sigue. */
export async function graphAll<T = unknown>(path: string, token: string, params: Record<string, string>, maxPages = 50): Promise<T[]> {
  const out: T[] = []
  let next: string | null = `${GRAPH}/${path}?${new URLSearchParams(params)}`
  for (let i = 0; next && i < maxPages; i++) {
    let page: { data?: T[]; paging?: { next?: string } }
    try {
      page = await graphGet(next, token)
    } catch (e) {
      const u: URL = new URL(next as string)
      const limit = Number(u.searchParams.get('limit') || '25')
      if (!isTooMuchData(e) || limit <= 10) throw e
      u.searchParams.set('limit', String(Math.max(10, Math.floor(limit / 2))))
      next = u.toString()
      i--
      continue
    }
    out.push(...(page.data || []))
    next = page.paging?.next || null
  }
  return out
}

export async function getMetaToken(connectionId: string | null): Promise<string> {
  if (!connectionId) throw new Error('La cuenta publicitaria no tiene conexión')
  const { data } = await svc().from('connections').select('access_token').eq('id', connectionId).single()
  if (!data?.access_token) throw new Error('No se encontró el token de Meta')
  return data.access_token as string
}

type Action = { action_type: string; value: string }
const pick = (arr: Action[] | undefined, types: string[]): number => {
  if (!arr) return 0
  for (const t of types) {
    const f = arr.find((a) => a.action_type === t)
    if (f) return parseFloat(f.value) || 0
  }
  return 0
}
export const PURCHASE = ['omni_purchase', 'purchase', 'offsite_conversion.fb_pixel_purchase']
export const LPV = ['omni_landing_page_view', 'landing_page_view']
export const ATC = ['omni_add_to_cart', 'add_to_cart', 'offsite_conversion.fb_pixel_add_to_cart']
export const IC = ['omni_initiated_checkout', 'initiate_checkout', 'offsite_conversion.fb_pixel_initiate_checkout']

const LIVE_STATUSES = ['ACTIVE', 'PAUSED', 'CAMPAIGN_PAUSED', 'ADSET_PAUSED', 'PENDING_REVIEW', 'DISAPPROVED', 'PREAPPROVED', 'PENDING_BILLING_INFO', 'IN_PROCESS', 'WITH_ISSUES']

const cents = (v: unknown) => (v == null || v === '' ? null : (parseFloat(String(v)) || 0) / 100)

/** Campañas, ad sets y anuncios (sin archivados ni borrados). */
export async function syncEntities(acc: AdAccountRow, token: string): Promise<number> {
  const eff = JSON.stringify(LIVE_STATUSES)
  const [campaigns, adsets, ads] = await Promise.all([
    graphAll<Record<string, unknown>>(`${acc.external_id}/campaigns`, token, {
      fields: 'id,name,status,effective_status,objective,daily_budget,lifetime_budget,bid_strategy,created_time,updated_time',
      effective_status: eff, limit: '200',
    }),
    graphAll<Record<string, unknown>>(`${acc.external_id}/adsets`, token, {
      fields: 'id,name,status,effective_status,campaign_id,optimization_goal,daily_budget,lifetime_budget,bid_strategy,targeting,created_time,updated_time',
      effective_status: eff, limit: '200',
    }),
    graphAll<Record<string, unknown>>(`${acc.external_id}/ads`, token, {
      fields: 'id,name,status,effective_status,adset_id,campaign_id,created_time,updated_time,creative{id,thumbnail_url,image_url,object_type,body,title,video_id,effective_object_story_id,object_story_spec{page_id,instagram_user_id}}',
      effective_status: eff, limit: '100',
    }),
  ])
  const now = new Date().toISOString()
  const rows = [
    ...campaigns.map((c) => ({
      ad_account_id: acc.id, entity_id: String(c.id), level: 'campaign', parent_id: null, campaign_id: String(c.id),
      name: c.name || '', status: c.status, effective_status: c.effective_status, objective: c.objective || null,
      optimization_goal: null, daily_budget: cents(c.daily_budget), lifetime_budget: cents(c.lifetime_budget),
      bid_strategy: c.bid_strategy || null, targeting: null, creative: null,
      created_time: c.created_time || null, updated_time: c.updated_time || null, synced_at: now,
    })),
    ...adsets.map((s) => ({
      ad_account_id: acc.id, entity_id: String(s.id), level: 'adset', parent_id: String(s.campaign_id), campaign_id: String(s.campaign_id),
      name: s.name || '', status: s.status, effective_status: s.effective_status, objective: null,
      optimization_goal: s.optimization_goal || null, daily_budget: cents(s.daily_budget), lifetime_budget: cents(s.lifetime_budget),
      bid_strategy: s.bid_strategy || null, targeting: s.targeting || null, creative: null,
      created_time: s.created_time || null, updated_time: s.updated_time || null, synced_at: now,
    })),
    ...ads.map((a) => ({
      ad_account_id: acc.id, entity_id: String(a.id), level: 'ad', parent_id: String(a.adset_id), campaign_id: String(a.campaign_id),
      name: a.name || '', status: a.status, effective_status: a.effective_status, objective: null,
      optimization_goal: null, daily_budget: null, lifetime_budget: null, bid_strategy: null, targeting: null,
      creative: a.creative || null, created_time: a.created_time || null, updated_time: a.updated_time || null, synced_at: now,
    })),
  ]
  const n = await upsertChunks('ad_entities', rows, 'ad_account_id,entity_id')
  // Lo que ya no viene (archivado/borrado) se elimina de la tabla local
  const ids = new Set(rows.map((r) => r.entity_id))
  const { data: existing } = await svc().from('ad_entities').select('entity_id').eq('ad_account_id', acc.id)
  const gone = (existing || []).map((e: { entity_id: string }) => e.entity_id).filter((id: string) => !ids.has(id))
  for (let i = 0; i < gone.length; i += 200) {
    await svc().from('ad_entities').delete().eq('ad_account_id', acc.id).in('entity_id', gone.slice(i, i + 200))
  }
  await svc().from('ad_accounts').update({ last_entities_at: now }).eq('id', acc.id)
  return n
}

/** Métricas por anuncio y día para un rango (fechas en la zona de la cuenta). */
export async function syncInsightsRange(acc: AdAccountRow, token: string, from: string, to: string): Promise<number> {
  let rows: Record<string, unknown>[]
  try {
    rows = await graphAll<Record<string, unknown>>(`${acc.external_id}/insights`, token, {
      level: 'ad',
      time_increment: '1',
      time_range: JSON.stringify({ since: from, until: to }),
      fields: 'ad_id,adset_id,campaign_id,spend,impressions,reach,inline_link_clicks,actions,action_values,video_p50_watched_actions',
      limit: '250',
    }, 200)
  } catch (e) {
    // Cuentas grandes: si el rango es demasiado, partirlo a la mitad
    if (!isTooMuchData(e) || from >= to) throw e
    const days = Math.round((Date.parse(to) - Date.parse(from)) / 86400000)
    const mid = addDays(from, Math.floor(days / 2))
    return (await syncInsightsRange(acc, token, from, mid)) + (await syncInsightsRange(acc, token, addDays(mid, 1), to))
  }
  const now = new Date().toISOString()
  const mapped = rows.map((r) => {
    const actions = r.actions as Action[] | undefined
    const values = r.action_values as Action[] | undefined
    return {
      ad_account_id: acc.id,
      date: r.date_start as string,
      ad_id: String(r.ad_id),
      adset_id: r.adset_id ? String(r.adset_id) : null,
      campaign_id: r.campaign_id ? String(r.campaign_id) : null,
      spend: parseFloat(String(r.spend || '0')) || 0,
      impressions: parseInt(String(r.impressions || '0'), 10) || 0,
      reach: parseInt(String(r.reach || '0'), 10) || 0,
      link_clicks: parseInt(String(r.inline_link_clicks || '0'), 10) || 0,
      lpv: pick(actions, LPV),
      atc: pick(actions, ATC),
      ic: pick(actions, IC),
      purchases: pick(actions, PURCHASE),
      purchase_value: pick(values, PURCHASE),
      video_3s: pick(actions, ['video_view']),
      video_p50: pick(r.video_p50_watched_actions as Action[] | undefined, ['video_view']),
      synced_at: now,
    }
  })
  return upsertChunks('ad_insights_daily', mapped, 'ad_account_id,date,ad_id')
}

/**
 * Sincroniza una cuenta:
 *  - entidades cada 10 min (o forzado)
 *  - métricas: últimos 3 días siempre; 7 días en la primera corrida del día
 *  - backfill de 13 meses en tramos de 14 días, reanudable
 */
export async function syncAdAccount(acc: AdAccountRow, opts: { budgetMs?: number; forceEntities?: boolean } = {}): Promise<{ rows: number; done: boolean }> {
  const t0 = Date.now()
  const budget = opts.budgetMs ?? 40000
  const tz = acc.timezone || 'America/Argentina/Buenos_Aires'
  const today = localDate(new Date(), tz)
  let rows = 0
  const sb = svc()
  try {
    const token = await getMetaToken(acc.connection_id)
    const entitiesAge = acc.last_entities_at ? Date.now() - new Date(acc.last_entities_at).getTime() : Infinity
    if (opts.forceEntities || entitiesAge > 10 * 60000) rows += await syncEntities(acc, token)

    const lastDay = acc.last_synced_at ? localDate(new Date(acc.last_synced_at), tz) : null
    const recentFrom = addDays(today, lastDay === today ? -2 : -6)
    rows += await syncInsightsRange(acc, token, recentFrom, today)
    await sb.from('ad_accounts').update({ last_synced_at: new Date().toISOString(), last_sync_error: null }).eq('id', acc.id)

    // Backfill hacia atrás (13 meses, igual que las órdenes)
    const target = addDays(today, -HISTORY_DAYS)
    let from = acc.insights_from || addDays(today, -6)
    if (!acc.insights_from) await sb.from('ad_accounts').update({ insights_from: from }).eq('id', acc.id)
    while (from > target && Date.now() - t0 < budget) {
      const chunkTo = addDays(from, -1)
      const chunkFrom = addDays(chunkTo, -13) < target ? target : addDays(chunkTo, -13)
      rows += await syncInsightsRange(acc, token, chunkFrom, chunkTo)
      from = chunkFrom
      await sb.from('ad_accounts').update({ insights_from: from }).eq('id', acc.id)
    }
    await logSync({ workspace_id: acc.workspace_id, source: 'meta', target_id: acc.id, status: 'ok', rows, ms: Date.now() - t0 })
    return { rows, done: from <= target }
  } catch (e) {
    const msg = isRateLimit(e)
      ? `${RATE_LIMIT_PREFIX} Meta limitó las consultas de esta cuenta; Faro reintenta solo en ${COOLDOWN_MIN} minutos.`
      : isTooMuchData(e) ? 'Meta no pudo devolver tantos datos juntos; se reintenta con tandas más chicas.'
      : e instanceof Error ? e.message : String(e)
    await sb.from('ad_accounts').update({ last_sync_error: msg.slice(0, 300) }).eq('id', acc.id)
    await logSync({ workspace_id: acc.workspace_id, source: 'meta', target_id: acc.id, status: 'error', rows, ms: Date.now() - t0, error: msg })
    throw new MetaError(msg, (e as MetaError)?.code, (e as MetaError)?.subcode)
  }
}

/** Info básica de una cuenta publicitaria. */
export async function fetchAccountInfo(externalId: string, token: string) {
  const d = await graphGet<{ name?: string; currency?: string; timezone_name?: string; account_status?: number }>(
    externalId, token, { fields: 'name,currency,timezone_name,account_status' },
  )
  return { name: d.name || externalId, currency: d.currency || 'ARS', timezone: d.timezone_name || null, status: d.account_status ?? null }
}

/** Todas las cuentas publicitarias que ve un token (propias + de Business Managers). */
export async function listAccessibleAccounts(token: string) {
  const fields = 'id,name,account_status,currency,timezone_name,business{id,name}'
  const seen = new Map<string, { id: string; name: string; status: number; currency: string; timezone: string | null; business: string | null }>()
  const add = (a: Record<string, unknown>) => {
    const id = String(a.id)
    if (seen.has(id)) return
    seen.set(id, {
      id, name: String(a.name || id), status: Number(a.account_status ?? 0), currency: String(a.currency || ''),
      timezone: (a.timezone_name as string) || null, business: ((a.business as { name?: string } | undefined)?.name) || null,
    })
  }
  ;(await graphAll<Record<string, unknown>>('me/adaccounts', token, { fields, limit: '100' }, 10)).forEach(add)
  try {
    const biz = await graphAll<{ id: string; name: string }>('me/businesses', token, { fields: 'id,name', limit: '50' }, 5)
    for (const b of biz) {
      for (const edge of ['owned_ad_accounts', 'client_ad_accounts']) {
        try { (await graphAll<Record<string, unknown>>(`${b.id}/${edge}`, token, { fields, limit: '100' }, 5)).forEach(add) } catch { /* sin permiso */ }
      }
    }
  } catch { /* token sin business_management */ }
  return Array.from(seen.values())
}

/** Identidad (página e Instagram) usada por los anuncios existentes de la cuenta. */
export async function recentIdentities(accountUuid: string) {
  const { data } = await svc().from('ad_entities').select('creative').eq('ad_account_id', accountUuid).eq('level', 'ad').limit(300)
  const map = new Map<string, { page_id: string; instagram_user_id: string | null; count: number }>()
  for (const r of data || []) {
    const spec = (r.creative as { object_story_spec?: { page_id?: string; instagram_user_id?: string } } | null)?.object_story_spec
    if (!spec?.page_id) continue
    const k = `${spec.page_id}|${spec.instagram_user_id || ''}`
    const cur = map.get(k)
    if (cur) cur.count++
    else map.set(k, { page_id: spec.page_id, instagram_user_id: spec.instagram_user_id || null, count: 1 })
  }
  return Array.from(map.values()).sort((a, b) => b.count - a.count)
}
