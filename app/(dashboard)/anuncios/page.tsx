import Link from 'next/link'
import { redirect } from 'next/navigation'
import { getRequestContext, canEdit } from '@/lib/faro/context'
import { parsePeriodKey, resolvePeriod, addDays, localDate } from '@/lib/faro/dates'
import { loadAdsTree, loadFrequency, flatten } from '@/lib/faro/adsTree'
import { loadOrders, loadCostIndex, summarizeSales, loadAdsDaily } from '@/lib/faro/metrics'
import { PageHeader, PeriodPicker, Panel, Tabs, Empty } from '@/components/faro/ui'
import AdsWorkspace from '@/components/faro/ads/AdsWorkspace'
import PublishWizard from '@/components/faro/ads/PublishWizard'
import { enabledCount } from '@/lib/faro/enhancements'
import ChangeHistory from '@/components/faro/ads/ChangeHistory'
import CreativeGallery, { CreativeCard } from '@/components/faro/ads/CreativeGallery'
import { svc } from '@/lib/faro/db'

export const dynamic = 'force-dynamic'
export const maxDuration = 60

export default async function AnunciosPage({ searchParams }: { searchParams: { p?: string; from?: string; to?: string; tab?: string; focus?: string; adset?: string; dup?: string } }) {
  const ctx = await getRequestContext()
  if (!ctx) redirect('/login')
  const accounts = ctx.adAccounts.filter((a) => a.active)
  if (!accounts.length) {
    return (<><PageHeader title="Anuncios" /><Panel><Empty title="Todavía no conectaste una cuenta de Meta"><Link href="/ajustes?tab=conexiones" className="underline">Conectar Meta</Link></Empty></Panel></>)
  }
  const tab = ['campanias', 'creativos', 'publicar', 'historial'].includes(searchParams.tab || '') ? searchParams.tab! : 'campanias'
  const tz = ctx.workspace.timezone
  const period = resolvePeriod(parsePeriodKey(searchParams.p), tz, new Date(), { from: searchParams.from, to: searchParams.to })
  const today = localDate(new Date(), tz)

  let content: React.ReactNode = null
  if (tab === 'campanias') {
    const storeIds = ctx.stores.filter((s) => s.active).map((s) => s.id)
    const [tree, freq, orders14, idx, todayRes, daily] = await Promise.all([
      loadAdsTree(accounts, period.from, period.to, { includeInactive: true }),
      loadFrequency(accounts, period.from, period.to),
      loadOrders(storeIds, addDays(today, -13), today, tz),
      loadCostIndex(storeIds),
      svc().rpc('faro_ads_by_ad', { p_accounts: accounts.map((a) => a.id), p_from: today, p_to: today }),
      loadAdsDaily(accounts.map((a) => a.id), period.from, period.to),
    ])
    // Gasto de hoy por anuncio, ad set y campaña (para el ritmo contra el presupuesto diario)
    const todaySpend: Record<string, number> = {}
    for (const r of (todayRes.data || []) as { ad_id: string; adset_id: string | null; campaign_id: string | null; spend: number }[]) {
      for (const id of [r.ad_id, r.adset_id, r.campaign_id]) if (id) todaySpend[String(id)] = (todaySpend[String(id)] || 0) + (Number(r.spend) || 0)
    }
    const [hh, mm] = new Intl.DateTimeFormat('en-GB', { timeZone: tz, hour: '2-digit', minute: '2-digit', hour12: false }).format(new Date()).split(':').map(Number)
    const hourShare = ((hh % 24) * 60 + mm) / 1440
    for (const n of flatten(tree)) if (n.level === 'adset') n.frequency = freq.get(n.id) ?? null
    const ref = summarizeSales(orders14, tz, idx, ctx.workspace.settings)
    const maxCpa = ref.orders > 0 ? ref.contribution / ref.orders / (1 + ctx.workspace.settings.ad_tax_pct / 100) : null
    content = (
      <AdsWorkspace
        tree={tree}
        accounts={accounts.map((a) => ({ id: a.id, name: a.name, external_id: a.external_id, protected_ids: a.protected_ids || [] }))}
        maxCpa={maxCpa}
        canEdit={canEdit(ctx)}
        focus={searchParams.focus || null}
        todaySpend={todaySpend}
        hourShare={hourShare}
        daily={daily.map((d) => ({ date: d.date, spend: d.spend, purchases: d.purchases, value: d.purchase_value }))}
        period={{ from: period.from, to: period.to, label: period.label, key: period.key }}
      />
    )
  } else if (tab === 'creativos') {
    const storeIds = ctx.stores.filter((s) => s.active).map((s) => s.id)
    const [tree, orders14, idx] = await Promise.all([
      loadAdsTree(accounts, period.from, period.to, { includeInactive: true }),
      loadOrders(storeIds, addDays(today, -13), today, tz),
      loadCostIndex(storeIds),
    ])
    const ref = summarizeSales(orders14, tz, idx, ctx.workspace.settings)
    const maxCpa = ref.orders > 0 ? ref.contribution / ref.orders / (1 + ctx.workspace.settings.ad_tax_pct / 100) : null
    const cards: CreativeCard[] = []
    for (const c of tree) for (const s of c.children) for (const a of s.children) {
      if (a.level !== 'ad') continue
      cards.push({
        id: a.id, name: a.name, adset: s.name, adsetId: s.id, campaign: c.name, active: a.effectiveStatus === 'ACTIVE',
        image: a.image, isVideo: a.isVideo, body: a.copy?.body || null, m: a.m,
      })
    }
    content = <CreativeGallery cards={cards} maxCpa={maxCpa} periodLabel={period.label} />
  } else if (tab === 'publicar') {
    const ids = accounts.map((a) => a.id)
    const [{ data: ents }, tree30, { data: adRows }] = await Promise.all([
      svc().from('ad_entities').select('ad_account_id,entity_id,level,name,effective_status,optimization_goal,campaign_id,daily_budget,lifetime_budget')
        .in('ad_account_id', ids).in('level', ['campaign', 'adset']).in('effective_status', ['ACTIVE', 'PAUSED', 'CAMPAIGN_PAUSED']),
      loadAdsTree(accounts, addDays(today, -30), addDays(today, -1)),
      svc().from('ad_entities').select('ad_account_id,name,creative').in('ad_account_id', ids).eq('level', 'ad').eq('effective_status', 'ACTIVE').limit(200),
    ])
    type Ent = { ad_account_id: string; entity_id: string; level: string; name: string; effective_status: string; optimization_goal: string | null; campaign_id: string; daily_budget: number | null; lifetime_budget: number | null }
    const list = (ents || []) as Ent[]
    const campName = new Map(list.filter((e) => e.level === 'campaign').map((c) => [c.entity_id, c.name]))
    const seen = new Set<string>()
    const templates = ((adRows || []) as { ad_account_id: string; name: string; creative: { body?: string; title?: string } | null }[])
      .filter((r) => r.creative?.body && !seen.has(r.creative.body) && seen.add(r.creative.body))
      .map((r) => ({ accountId: r.ad_account_id, name: r.name, body: r.creative!.body!, title: r.creative!.title || '' }))
    const adOpts = tree30.flatMap((c) => c.children.flatMap((st) => st.children.filter((a) => a.m.spend > 0 || a.effectiveStatus === 'ACTIVE').map((a) => ({
      accountId: a.accountId, id: a.id, name: a.name, adset: st.name, campaign: c.name, thumbnail: a.thumbnail, spend: a.m.spend, purchases: a.m.purchases, active: a.effectiveStatus === 'ACTIVE',
    })))).sort((a, b) => b.spend - a.spend).slice(0, 200)
    const store = ctx.stores.find((s) => s.active)
    content = (
      <PublishWizard
        canEdit={canEdit(ctx)}
        accounts={accounts.map((a) => ({ id: a.id, name: a.name, protected_ids: a.protected_ids || [] }))}
        adsets={list.filter((e) => e.level === 'adset').map((s) => ({ accountId: s.ad_account_id, id: s.entity_id, name: s.name, status: s.effective_status, goal: s.optimization_goal, campaignId: s.campaign_id, campaign: campName.get(s.campaign_id) || '' }))}
        campaigns={list.filter((e) => e.level === 'campaign').map((c) => ({ accountId: c.ad_account_id, id: c.entity_id, name: c.name, status: c.effective_status, hasBudget: !!(c.daily_budget || c.lifetime_budget) }))}
        ads={adOpts}
        defaultLink={store?.url || ''}
        templates={templates}
        preAdset={searchParams.adset || null}
        preDup={searchParams.dup ? searchParams.dup.split(',').filter(Boolean).slice(0, 20) : []}
        enhancementsOn={enabledCount(ctx.workspace.settings.meta_enhancements)}
      />
    )
  } else {
    content = <ChangeHistory canEdit={canEdit(ctx)} timezone={tz} />
  }

  return (
    <>
      <PageHeader title="Anuncios" description={tab === 'campanias' ? `${period.label}. Los cambios se revisan antes de publicarse en Meta.` : tab === 'creativos' ? `${period.label}. Cada anuncio con su imagen y sus números, para ver qué escalar y qué apagar.` : tab === 'publicar' ? 'Creativos nuevos o duplicados, en uno o varios ad sets, o en un ad set nuevo. Todo se crea en pausa.' : 'Todo lo que se cambió desde Faro, con quién y cuándo.'}>
        {(tab === 'campanias' || tab === 'creativos') && <PeriodPicker value={period.key} from={period.from} to={period.to} />}
      </PageHeader>
      <Tabs value={tab} tabs={[{ key: 'campanias', label: 'Campañas' }, { key: 'creativos', label: 'Creativos' }, { key: 'publicar', label: 'Cargar anuncios' }, { key: 'historial', label: 'Historial de cambios' }]} />
      {content}
    </>
  )
}
