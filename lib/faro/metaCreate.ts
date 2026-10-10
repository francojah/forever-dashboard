import { svc } from './db'
import { graphGet, graphPost, getMetaToken } from './meta'
import type { FaroContext } from './context'

/** Crear estructura en Meta desde Faro. Todo se crea en pausa para revisarlo antes de activar. */

export interface NewCampaign { name: string; dailyBudget?: number | null }       // con presupuesto = presupuesto de campaña (CBO)
export interface NewAdset {
  name: string
  dailyBudget?: number | null       // solo si la campaña no tiene presupuesto propio
  pixelId: string
  event?: string                    // PURCHASE por defecto
  advantageAudience: boolean
  ageMin?: number
  ageMax?: number
  genders?: number[]                // [1] hombres, [2] mujeres, [] todos
  countries?: string[]
}

type Acc = FaroContext['adAccounts'][number]

export function accountOf(ctx: FaroContext, accountId: string): Acc | null {
  return ctx.adAccounts.find((a) => a.id === accountId) || null
}

export async function listPixels(acc: Acc) {
  const token = await getMetaToken(acc.connection_id)
  const r = await graphGet<{ data?: { id: string; name: string; last_fired_time?: string }[] }>(`${acc.external_id}/adspixels`, token, { fields: 'id,name,last_fired_time', limit: '50' })
  return (r.data || []).sort((a, b) => String(b.last_fired_time || '').localeCompare(String(a.last_fired_time || '')))
}

async function log(ctx: FaroContext, acc: Acc, level: string, id: string, name: string, field: string, value: unknown) {
  await svc().from('change_log').insert({
    workspace_id: ctx.workspace.id, ad_account_id: acc.id, user_id: ctx.user.id, user_email: ctx.user.email,
    level, entity_id: id, entity_name: name, field, old_value: null, new_value: value, status: 'ok',
  }).then(() => null, () => null)
}

const cents = (v: number) => String(Math.round(v * 100))

export async function createCampaign(ctx: FaroContext, acc: Acc, c: NewCampaign): Promise<{ id: string; cbo: boolean }> {
  const token = await getMetaToken(acc.connection_id)
  const cbo = !!c.dailyBudget && c.dailyBudget > 0
  const r = await graphPost<{ id: string }>(`${acc.external_id}/campaigns`, token, {
    name: c.name, objective: 'OUTCOME_SALES', status: 'PAUSED', special_ad_categories: [], buying_type: 'AUCTION',
    ...(cbo ? { daily_budget: cents(c.dailyBudget!), bid_strategy: 'LOWEST_COST_WITHOUT_CAP' } : { is_adset_budget_sharing_enabled: false }),
  })
  const now = new Date().toISOString()
  await svc().from('ad_entities').upsert({
    ad_account_id: acc.id, entity_id: r.id, level: 'campaign', parent_id: null, campaign_id: r.id, name: c.name,
    status: 'PAUSED', effective_status: 'PAUSED', objective: 'OUTCOME_SALES', daily_budget: cbo ? c.dailyBudget : null, synced_at: now,
  }, { onConflict: 'ad_account_id,entity_id' })
  await log(ctx, acc, 'campaign', r.id, c.name, 'create_campaign', { daily_budget: c.dailyBudget || null })
  return { id: r.id, cbo }
}

export async function createAdset(ctx: FaroContext, acc: Acc, campaignId: string, cbo: boolean, s: NewAdset): Promise<{ id: string }> {
  const token = await getMetaToken(acc.connection_id)
  const targeting: Record<string, unknown> = {
    geo_locations: { countries: s.countries?.length ? s.countries : ['AR'] },
    targeting_automation: { advantage_audience: s.advantageAudience ? 1 : 0 },
  }
  if (!s.advantageAudience) {
    targeting.age_min = s.ageMin ?? 18
    targeting.age_max = s.ageMax ?? 65
    if (s.genders?.length) targeting.genders = s.genders
  }
  const r = await graphPost<{ id: string }>(`${acc.external_id}/adsets`, token, {
    name: s.name, campaign_id: campaignId, status: 'PAUSED',
    billing_event: 'IMPRESSIONS', optimization_goal: 'OFFSITE_CONVERSIONS',
    promoted_object: { pixel_id: s.pixelId, custom_event_type: s.event || 'PURCHASE' },
    targeting,
    ...(!cbo && s.dailyBudget ? { daily_budget: cents(s.dailyBudget), bid_strategy: 'LOWEST_COST_WITHOUT_CAP' } : {}),
  })
  await svc().from('ad_entities').upsert({
    ad_account_id: acc.id, entity_id: r.id, level: 'adset', parent_id: campaignId, campaign_id: campaignId, name: s.name,
    status: 'PAUSED', effective_status: 'PAUSED', optimization_goal: 'OFFSITE_CONVERSIONS',
    daily_budget: !cbo && s.dailyBudget ? s.dailyBudget : null, targeting, synced_at: new Date().toISOString(),
  }, { onConflict: 'ad_account_id,entity_id' })
  await log(ctx, acc, 'adset', r.id, s.name, 'create_adset', { campaign_id: campaignId, daily_budget: s.dailyBudget || null, advantage_audience: s.advantageAudience })
  return { id: r.id }
}

/**
 * Copia un anuncio a otro ad set. Usa la misma publicación, así conserva comentarios y reacciones.
 */
export async function copyAd(ctx: FaroContext, acc: Acc, adId: string, adsetId: string): Promise<{ id: string }> {
  const token = await getMetaToken(acc.connection_id)
  const r = await graphPost<{ copied_ad_id?: string; ad_object_ids?: { copied_id: string }[] }>(`${adId}/copies`, token, {
    adset_id: adsetId, status_option: 'PAUSED',
  })
  const id = r.copied_ad_id || r.ad_object_ids?.[0]?.copied_id
  if (!id) throw new Error('Meta no devolvió el anuncio copiado')
  const { data: src } = await svc().from('ad_entities').select('name,creative').eq('ad_account_id', acc.id).eq('entity_id', adId).maybeSingle()
  const { data: set } = await svc().from('ad_entities').select('campaign_id').eq('ad_account_id', acc.id).eq('entity_id', adsetId).maybeSingle()
  await svc().from('ad_entities').upsert({
    ad_account_id: acc.id, entity_id: id, level: 'ad', parent_id: adsetId, campaign_id: set?.campaign_id || null,
    name: src?.name || id, status: 'PAUSED', effective_status: 'PAUSED', creative: src?.creative || null, synced_at: new Date().toISOString(),
  }, { onConflict: 'ad_account_id,entity_id' })
  await log(ctx, acc, 'ad', id, src?.name || id, 'copy_ad', { from: adId, adset_id: adsetId })
  return { id }
}

/** Duplica un ad set completo (con sus anuncios) dentro de su campaña o en otra. */
export async function copyAdset(ctx: FaroContext, acc: Acc, adsetId: string, campaignId?: string): Promise<{ id: string }> {
  const token = await getMetaToken(acc.connection_id)
  const r = await graphPost<{ copied_adset_id?: string; ad_object_ids?: { copied_id: string; ad_object_type: string }[] }>(`${adsetId}/copies`, token, {
    deep_copy: true, status_option: 'PAUSED', ...(campaignId ? { campaign_id: campaignId } : {}),
  })
  const id = r.copied_adset_id || r.ad_object_ids?.find((o) => o.ad_object_type === 'ad_set')?.copied_id
  if (!id) throw new Error('Meta no devolvió el ad set copiado')
  await svc().from('ad_accounts').update({ last_entities_at: null }).eq('id', acc.id)   // fuerza traer la copia en la próxima sincronización
  await log(ctx, acc, 'adset', id, id, 'copy_adset', { from: adsetId })
  return { id }
}
