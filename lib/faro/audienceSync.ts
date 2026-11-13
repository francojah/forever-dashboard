import { createHash, randomInt } from 'crypto'
import { svc } from './db'
import { getMetaToken, graphPost } from './meta'
import { getConnectionToken, tnGet, type StoreRow } from './tiendanube'

/**
 * Públicos de clientes sincronizados con Meta (tabla audience_syncs).
 * Cada corrida rearma las listas desde Tiendanube (clientes) + Faro (pedidos) y REEMPLAZA el público
 * (usersreplace: mismo ID, no reinicia el aprendizaje de los conjuntos que lo usan).
 * Solo clientes que aceptan marketing. Todo viaja cifrado con SHA-256.
 */
export type Segment = 'compradores' | 'una_vez_60' | 'ultimos_30' | 'sin_compra'
type Row = string[]
const SCHEMA = ['EMAIL', 'PHONE', 'FN', 'LN', 'CT', 'ST', 'ZIP', 'COUNTRY']
const sha = (v: string) => (v ? createHash('sha256').update(v).digest('hex') : '')
const plain = (v: unknown) => String(v ?? '').normalize('NFKD').replace(/[̀-ͯ]/g, '').toLowerCase()
const alnum = (v: unknown) => plain(v).replace(/[^a-z0-9]/g, '')
const phone = (v: unknown) => {
  let d = String(v ?? '').replace(/\D/g, '').replace(/^0+/, '')
  if (!d) return ''
  if (!d.startsWith('54')) d = '54' + d
  return d.length >= 11 && d.length <= 13 ? d : ''
}
const emailOk = (e: string) => /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(e)

async function loadCustomers(store: StoreRow) {
  const token = await getConnectionToken(store.connection_id)
  const all: any[] = []
  for (let page = 1; page <= 100; page++) {
    let data: any[] = []
    try { data = (await tnGet<any[]>(store.external_id, token, 'customers', { per_page: '200', page: String(page) })).data }
    catch (e) { if (page === 1) throw e; break } // Tiendanube responde 404 pasada la última página
    if (!Array.isArray(data) || !data.length) break
    all.push(...data)
    if (data.length < 200) break
  }
  return all
}

/** Pedidos pagos de Faro por email: cantidad y fecha del último (Faro guarda los pedidos con historia suficiente para 30/60 días). */
async function loadOrderStats(storeId: string) {
  const out = new Map<string, { n: number; last: number }>()
  for (let from = 0; ; from += 1000) {
    const { data, error } = await svc().from('orders').select('customer_email,paid_at').eq('store_id', storeId)
      .not('paid_at', 'is', null).is('cancelled_at', null).range(from, from + 999)
    if (error) throw new Error(error.message)
    for (const o of data || []) {
      const e = String(o.customer_email || '').trim().toLowerCase(); if (!e) continue
      const t = new Date(o.paid_at as string).getTime(); const s = out.get(e)
      out.set(e, { n: (s?.n || 0) + 1, last: Math.max(s?.last || 0, t) })
    }
    if (!data || data.length < 1000) break
  }
  return out
}

export function buildSegments(customers: any[], orders: Map<string, { n: number; last: number }>, now = Date.now()) {
  const day = 86400000
  const seg: Record<Segment, Row[]> = { compradores: [], una_vez_60: [], ultimos_30: [], sin_compra: [] }
  const seen = new Set<string>()
  for (const c of customers) {
    if (c.accepts_marketing === false) continue
    const email = String(c.email || '').trim().toLowerCase()
    if (!emailOk(email) || seen.has(email)) continue
    seen.add(email)
    const a = c.default_address || (Array.isArray(c.addresses) ? c.addresses[0] : null) || {}
    const parts = plain(c.name).split(/\s+/).filter(Boolean)
    const row = [email, phone(c.phone || a.phone), alnum(parts[0]), alnum(parts.slice(1).join('')), alnum(a.city || a.locality), alnum(a.province), String(a.zipcode || '').replace(/\D/g, '').slice(0, 4), 'ar'].map(sha)
    const o = orders.get(email)
    const bought = !!o || parseFloat(c.total_spent || '0') > 0 || !!c.last_order_id
    if (!bought) { seg.sin_compra.push(row); continue }
    seg.compradores.push(row)
    if (o && now - o.last <= 30 * day) seg.ultimos_30.push(row)
    if ((!o || o.n <= 1) && (!o || now - o.last > 60 * day)) seg.una_vez_60.push(row)
  }
  return seg
}

/** Reemplaza todo el contenido del público en Meta (mismo público, sin reiniciar aprendizaje). */
async function replaceAudience(audienceId: string, token: string, rows: Row[]) {
  const session_id = randomInt(1, 2 ** 31 - 1)
  const size = 5000
  const batches = Math.max(1, Math.ceil(rows.length / size))
  for (let i = 0; i < batches; i++) {
    await graphPost(`${audienceId}/usersreplace`, token, {
      payload: JSON.stringify({ schema: SCHEMA, data: rows.slice(i * size, (i + 1) * size) }),
      session: JSON.stringify({ session_id, batch_seq: i + 1, last_batch_flag: i === batches - 1, estimated_num_total: rows.length }),
    })
  }
}

/** Corre todas las sincronizaciones activas (o las de un espacio). Devuelve cantidades por segmento, sin datos personales. */
export async function runAudienceSyncs(workspaceId?: string) {
  let q = svc().from('audience_syncs').select('*').eq('active', true)
  if (workspaceId) q = q.eq('workspace_id', workspaceId)
  const { data: syncs, error } = await q
  if (error) throw new Error(error.message)
  const results: { segment: string; audience: string; count?: number; error?: string }[] = []
  const byStore = new Map<string, any[]>()
  for (const s of syncs || []) byStore.set(s.store_id, [...(byStore.get(s.store_id) || []), s])
  for (const [storeId, list] of byStore) {
    const { data: store } = await svc().from('stores').select('*').eq('id', storeId).single()
    if (!store) continue
    let seg: Record<Segment, Row[]>
    try { seg = buildSegments(await loadCustomers(store as StoreRow), await loadOrderStats(storeId)) }
    catch (e) {
      const msg = e instanceof Error ? e.message : 'No se pudieron leer los clientes'
      for (const s of list) { results.push({ segment: s.segment, audience: s.meta_audience_id, error: msg }); await svc().from('audience_syncs').update({ last_run_at: new Date().toISOString(), last_error: msg }).eq('id', s.id) }
      continue
    }
    for (const s of list) {
      const rows = seg[s.segment as Segment] || []
      try {
        const { data: acc } = await svc().from('ad_accounts').select('connection_id').eq('id', s.ad_account_id).single()
        const token = await getMetaToken(acc?.connection_id ?? null)
        if (rows.length) await replaceAudience(s.meta_audience_id, token, rows)
        await svc().from('audience_syncs').update({ last_run_at: new Date().toISOString(), last_count: rows.length, last_error: null }).eq('id', s.id)
        results.push({ segment: s.segment, audience: s.meta_audience_id, count: rows.length })
      } catch (e) {
        const msg = e instanceof Error ? e.message : 'Meta rechazó la actualización'
        await svc().from('audience_syncs').update({ last_run_at: new Date().toISOString(), last_error: msg }).eq('id', s.id)
        results.push({ segment: s.segment, audience: s.meta_audience_id, error: msg })
      }
    }
  }
  return results
}
