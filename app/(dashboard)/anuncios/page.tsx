import Link from 'next/link'
import { redirect } from 'next/navigation'
import { getRequestContext, canEdit } from '@/lib/faro/context'
import { parsePeriodKey, resolvePeriod, addDays, localDate } from '@/lib/faro/dates'
import { loadAdsTree, loadFrequency, flatten } from '@/lib/faro/adsTree'
import { loadOrders, loadCostIndex, summarizeSales } from '@/lib/faro/metrics'
import { PageHeader, PeriodPicker, Panel, Tabs, Empty } from '@/components/faro/ui'
import AdsManager from '@/components/faro/ads/AdsManager'
import CreativeUploader from '@/components/faro/ads/CreativeUploader'
import ChangeHistory from '@/components/faro/ads/ChangeHistory'
import { svc } from '@/lib/faro/db'

export const dynamic = 'force-dynamic'
export const maxDuration = 60

export default async function AnunciosPage({ searchParams }: { searchParams: { p?: string; from?: string; to?: string; tab?: string; focus?: string } }) {
  const ctx = await getRequestContext()
  if (!ctx) redirect('/login')
  const accounts = ctx.adAccounts.filter((a) => a.active)
  if (!accounts.length) {
    return (<><PageHeader title="Anuncios" /><Panel><Empty title="Todavía no conectaste una cuenta de Meta"><Link href="/ajustes?tab=conexiones" className="underline">Conectar Meta</Link></Empty></Panel></>)
  }
  const tab = ['campanias', 'publicar', 'historial'].includes(searchParams.tab || '') ? searchParams.tab! : 'campanias'
  const tz = ctx.workspace.timezone
  const period = resolvePeriod(parsePeriodKey(searchParams.p), tz, new Date(), { from: searchParams.from, to: searchParams.to })
  const today = localDate(new Date(), tz)

  let content: React.ReactNode = null
  if (tab === 'campanias') {
    const storeIds = ctx.stores.filter((s) => s.active).map((s) => s.id)
    const [tree, freq, orders14, idx] = await Promise.all([
      loadAdsTree(accounts, period.from, period.to, { includeInactive: true }),
      loadFrequency(accounts, period.from, period.to),
      loadOrders(storeIds, addDays(today, -13), today, tz),
      loadCostIndex(storeIds),
    ])
    for (const n of flatten(tree)) if (n.level === 'adset') n.frequency = freq.get(n.id) ?? null
    const ref = summarizeSales(orders14, tz, idx, ctx.workspace.settings)
    const maxCpa = ref.orders > 0 ? ref.contribution / ref.orders / (1 + ctx.workspace.settings.ad_tax_pct / 100) : null
    content = (
      <AdsManager
        tree={tree}
        accounts={accounts.map((a) => ({ id: a.id, name: a.name, external_id: a.external_id, protected_ids: a.protected_ids || [] }))}
        maxCpa={maxCpa}
        canEdit={canEdit(ctx)}
        focus={searchParams.focus || null}
      />
    )
  } else if (tab === 'publicar') {
    const { data: adsets } = await svc().from('ad_entities')
      .select('ad_account_id,entity_id,name,effective_status,optimization_goal,campaign_id')
      .in('ad_account_id', accounts.map((a) => a.id)).eq('level', 'adset').in('effective_status', ['ACTIVE', 'PAUSED', 'CAMPAIGN_PAUSED'])
    const { data: camps } = await svc().from('ad_entities').select('entity_id,name').in('ad_account_id', accounts.map((a) => a.id)).eq('level', 'campaign')
    const campName = new Map((camps || []).map((c: { entity_id: string; name: string }) => [c.entity_id, c.name]))
    const store = ctx.stores.find((s) => s.active)
    content = (
      <CreativeUploader
        canEdit={canEdit(ctx)}
        accounts={accounts.map((a) => ({ id: a.id, name: a.name, protected_ids: a.protected_ids || [] }))}
        adsets={(adsets || []).map((s: { ad_account_id: string; entity_id: string; name: string; effective_status: string; optimization_goal: string | null; campaign_id: string }) => ({
          accountId: s.ad_account_id, id: s.entity_id, name: s.name, status: s.effective_status, goal: s.optimization_goal,
          campaignId: s.campaign_id, campaign: campName.get(s.campaign_id) || '',
        }))}
        defaultLink={store?.url || ''}
      />
    )
  } else {
    content = <ChangeHistory canEdit={canEdit(ctx)} timezone={tz} />
  }

  return (
    <>
      <PageHeader title="Anuncios" description={tab === 'campanias' ? `${period.label}. Los cambios se revisan antes de publicarse en Meta.` : tab === 'publicar' ? 'Subí varios creativos a la vez. Se crean en pausa para revisarlos antes de activar.' : 'Todo lo que se cambió desde Faro, con quién y cuándo.'}>
        {tab === 'campanias' && <PeriodPicker value={period.key} from={period.from} to={period.to} />}
      </PageHeader>
      <Tabs value={tab} tabs={[{ key: 'campanias', label: 'Campañas' }, { key: 'publicar', label: 'Publicar creativos' }, { key: 'historial', label: 'Historial de cambios' }]} />
      {content}
    </>
  )
}
