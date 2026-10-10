import { redirect } from 'next/navigation'
import { getRequestContext, canEdit } from '@/lib/faro/context'
import { svc, fetchAll } from '@/lib/faro/db'
import { metaLoginConfigured, tiendanubeInstallUrl } from '@/lib/faro/connections'
import { PageHeader, Tabs } from '@/components/faro/ui'
import Connections from '@/components/faro/settings/Connections'
import CostSettings from '@/components/faro/settings/CostSettings'
import ProductCosts from '@/components/faro/settings/ProductCosts'
import Team from '@/components/faro/settings/Team'
import SyncLog from '@/components/faro/settings/SyncLog'
import BreakEven from '@/components/faro/settings/BreakEven'
import MetaEnhancements from '@/components/faro/settings/MetaEnhancements'
import { loadUnitEconomics } from '@/lib/faro/economics'
import { addDays, localDate, startOfLocalDayUTC } from '@/lib/faro/dates'

export const dynamic = 'force-dynamic'

export default async function AjustesPage({ searchParams }: { searchParams: { tab?: string; connection?: string; error?: string; store?: string; bienvenida?: string } }) {
  const ctx = await getRequestContext()
  if (!ctx) redirect('/login')
  const tab = ['conexiones', 'costos', 'equilibrio', 'meta', 'productos', 'equipo', 'estado'].includes(searchParams.tab || '') ? searchParams.tab! : 'conexiones'
  const sb = svc()
  let body: React.ReactNode = null

  if (tab === 'conexiones') {
    const { data: conns } = await sb.from('connections').select('id,provider,external_id,label,status,last_error,token_expires_at,meta,created_at').eq('workspace_id', ctx.workspace.id).order('created_at')
    body = (
      <Connections
        canEdit={canEdit(ctx)}
        isOwner={ctx.role === 'owner'}
        welcome={!!searchParams.bienvenida}
        openConnection={searchParams.connection || null}
        error={searchParams.error || null}
        storeAdded={searchParams.store === 'ok'}
        metaLogin={metaLoginConfigured()}
        tnInstall={!!tiendanubeInstallUrl()}
        connections={(conns || []).map((c) => ({ id: c.id, provider: c.provider, label: c.label, status: c.status, last_error: c.last_error, token_expires_at: c.token_expires_at, source: (c.meta as { source?: string })?.source || null }))}
        stores={ctx.stores.map((s) => ({ id: s.id, name: s.name, url: s.url, active: s.active, last_synced_at: s.last_synced_at, last_sync_error: s.last_sync_error, backfill_done: s.backfill_done }))}
        accounts={ctx.adAccounts.map((a) => ({ id: a.id, name: a.name, external_id: a.external_id, active: a.active, last_synced_at: a.last_synced_at, last_sync_error: a.last_sync_error, connection_id: a.connection_id }))}
        timezone={ctx.workspace.timezone}
      />
    )
  } else if (tab === 'costos') {
    const storeIds = ctx.stores.map((s) => s.id)
    const today = localDate(new Date(), ctx.workspace.timezone)
    const since = startOfLocalDayUTC(addDays(today, -89), ctx.workspace.timezone)
    const rows = storeIds.length ? await fetchAll<{ payment_method: string | null; total: number }>((a, b) =>
      sb.from('orders').select('payment_method,total').in('store_id', storeIds).eq('payment_status', 'paid').gte('created_at', since).range(a, b)) : []
    const methods = new Map<string, number>()
    let total = 0
    for (const r of rows) { const k = r.payment_method || 'other'; methods.set(k, (methods.get(k) || 0) + Number(r.total)); total += Number(r.total) }
    body = (
      <CostSettings
        canEdit={canEdit(ctx)}
        settings={ctx.workspace.settings}
        detected={Array.from(methods.entries()).map(([method, amount]) => ({ method, share: total ? amount / total : 0 })).sort((a, b) => b.share - a.share)}
      />
    )
  } else if (tab === 'equilibrio') {
    const e = await loadUnitEconomics(ctx, 30)
    body = <BreakEven base={{ fixedMonthly: e.fixedMonthly, fixedItems: e.fixedItems, aov: e.aov, contributionPct: e.contributionPct, adSpend: e.adSpend, netSales30: e.netSales, orders30: e.orders, adTaxPct: e.adTaxPct }} />
  } else if (tab === 'meta') {
    body = <MetaEnhancements initial={ctx.workspace.settings.meta_enhancements} canEdit={canEdit(ctx)} />
  } else if (tab === 'productos') {
    body = <ProductCosts canEdit={canEdit(ctx)} stores={ctx.stores.map((s) => ({ id: s.id, name: s.name }))} fallbackPct={ctx.workspace.settings.cost_fallback_pct} usePlatform={ctx.workspace.settings.use_platform_cost} />
  } else if (tab === 'equipo') {
    const { data: members } = await sb.from('workspace_members').select('user_id,role,created_at').eq('workspace_id', ctx.workspace.id)
    const withEmail = await Promise.all((members || []).map(async (m) => {
      const { data } = await sb.auth.admin.getUserById(m.user_id)
      return { user_id: m.user_id, role: m.role, email: data.user?.email || m.user_id, you: m.user_id === ctx.user.id }
    }))
    body = <Team members={withEmail} isOwner={ctx.role === 'owner'} workspaceName={ctx.workspace.name} />
  } else {
    const { data: log } = await sb.from('sync_log').select('source,status,rows,ms,error,created_at').eq('workspace_id', ctx.workspace.id).order('created_at', { ascending: false }).limit(60)
    body = <SyncLog rows={log || []} timezone={ctx.workspace.timezone} />
  }

  return (
    <>
      <PageHeader title="Ajustes" description={`${ctx.workspace.name}: conexiones, costos y equipo.`} />
      <Tabs value={tab} tabs={[
        { key: 'conexiones', label: 'Conexiones' },
        { key: 'costos', label: 'Costos y comisiones', badge: !ctx.workspace.settings.configured ? <span className="w-2 h-2 rounded-full bg-beacon" /> : undefined },
        { key: 'equilibrio', label: 'Punto de equilibrio' },
        { key: 'meta', label: 'Anuncios en Meta' },
        { key: 'productos', label: 'Costo de productos' },
        { key: 'equipo', label: 'Equipo' },
        { key: 'estado', label: 'Estado' },
      ]} />
      {body}
    </>
  )
}
