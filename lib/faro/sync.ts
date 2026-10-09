import { svc } from './db'
import { syncStoreOrders, ensureWebhooks, StoreRow } from './tiendanube'
import { syncAdAccount, AdAccountRow } from './meta'

export interface SyncResult {
  target: string
  kind: 'tiendanube' | 'meta'
  ok: boolean
  rows: number
  done: boolean
  error?: string
  skipped?: boolean
}

/**
 * Sincroniza todas las tiendas y cuentas activas de un espacio en paralelo.
 * minAgeMs: si la última sincronización es más reciente, no vuelve a pedir nada.
 */
export async function syncWorkspace(workspaceId: string, opts: { budgetMs?: number; minAgeMs?: number; forceEntities?: boolean } = {}): Promise<SyncResult[]> {
  const sb = svc()
  const budget = opts.budgetMs ?? 40000
  const minAge = opts.minAgeMs ?? 0
  const [{ data: stores }, { data: accounts }] = await Promise.all([
    sb.from('stores').select('*').eq('workspace_id', workspaceId).eq('active', true),
    sb.from('ad_accounts').select('*').eq('workspace_id', workspaceId).eq('active', true),
  ])
  const fresh = (ts: string | null) => !!ts && Date.now() - new Date(ts).getTime() < minAge

  const jobs: Promise<SyncResult>[] = []
  for (const s of (stores || []) as (StoreRow & { last_synced_at: string | null })[]) {
    jobs.push((async () => {
      if (s.backfill_done && fresh(s.last_synced_at)) return { target: s.name, kind: 'tiendanube', ok: true, rows: 0, done: true, skipped: true } as SyncResult
      try {
        const r = await syncStoreOrders(s, budget)
        if (!s.webhooks_ok) await ensureWebhooks(s).catch(() => false)
        return { target: s.name, kind: 'tiendanube', ok: true, rows: r.rows, done: r.done } as SyncResult
      } catch (e) {
        return { target: s.name, kind: 'tiendanube', ok: false, rows: 0, done: false, error: e instanceof Error ? e.message : String(e) } as SyncResult
      }
    })())
  }
  for (const a of (accounts || []) as AdAccountRow[]) {
    jobs.push((async () => {
      if (a.insights_from && fresh(a.last_synced_at) && !opts.forceEntities) return { target: a.name, kind: 'meta', ok: true, rows: 0, done: true, skipped: true } as SyncResult
      try {
        const r = await syncAdAccount(a, { budgetMs: budget, forceEntities: opts.forceEntities })
        return { target: a.name, kind: 'meta', ok: true, rows: r.rows, done: r.done } as SyncResult
      } catch (e) {
        return { target: a.name, kind: 'meta', ok: false, rows: 0, done: false, error: e instanceof Error ? e.message : String(e) } as SyncResult
      }
    })())
  }
  return Promise.all(jobs)
}

/** Todos los espacios (para el cron). */
export async function syncAll(budgetMs = 45000): Promise<Record<string, SyncResult[]>> {
  const { data } = await svc().from('workspaces').select('id,name')
  const out: Record<string, SyncResult[]> = {}
  for (const w of data || []) {
    out[w.name as string] = await syncWorkspace(w.id as string, { budgetMs: Math.max(10000, budgetMs / Math.max(1, (data || []).length)) })
  }
  return out
}
