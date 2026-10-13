import { svc } from './db'
import { normalizeSettings } from './settings'
import type { FaroContext } from './context'
/** Contexto de un negocio sin usuario (tareas programadas). Solo lectura: no se usa para publicar cambios. */
export async function systemContext(workspaceId: string): Promise<FaroContext | null> {
  const sb = svc()
  const [{ data: w }, { data: stores }, { data: accounts }] = await Promise.all([
    sb.from('workspaces').select('id,name,slug,currency,timezone,modules,settings').eq('id', workspaceId).maybeSingle(),
    sb.from('stores').select('*').eq('workspace_id', workspaceId).order('created_at'),
    sb.from('ad_accounts').select('*').eq('workspace_id', workspaceId).order('created_at'),
  ])
  if (!w) return null
  return {
    user: { id: 'system', email: '' }, role: 'viewer',
    workspace: { id: w.id, name: w.name, slug: w.slug, currency: w.currency, timezone: w.timezone, modules: w.modules || [], settings: normalizeSettings(w.settings), rawSettings: w.settings || {} },
    workspaces: [{ id: w.id, name: w.name }],
    stores: (stores || []) as FaroContext['stores'], adAccounts: (accounts || []) as FaroContext['adAccounts'],
  }
}
