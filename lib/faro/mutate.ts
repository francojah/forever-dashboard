import { svc } from './db'
import { graphGet, graphPost, getMetaToken } from './meta'
import type { FaroContext } from './context'

export type Field = 'status' | 'daily_budget' | 'name' | 'end_time' | 'age_min' | 'age_max' | 'genders' | 'copy' | 'creative_id'

export interface Change {
  accountId: string
  level: 'campaign' | 'adset' | 'ad'
  id: string
  field: Field
  value: unknown
  confirmProtected?: boolean
}

export interface ChangeResult { id: string; field: Field; ok: boolean; error?: string; changeId?: string; old?: unknown; new?: unknown }

const ALLOWED: Record<Change['level'], Field[]> = {
  campaign: ['status', 'daily_budget', 'name'],
  adset: ['status', 'daily_budget', 'name', 'end_time', 'age_min', 'age_max', 'genders'],
  ad: ['status', 'name', 'copy', 'creative_id'],
}

interface CopyValue { message?: string; headline?: string; link?: string }

async function applyCopy(token: string, accountExternal: string, adId: string, v: CopyValue) {
  const ad = await graphGet<{ name: string; creative?: { id: string } }>(adId, token, { fields: 'name,creative{id}' })
  const oldCreative = ad.creative?.id
  if (!oldCreative) throw new Error('El anuncio no tiene creativo')
  const cr = await graphGet<{ object_story_spec?: Record<string, unknown>; asset_feed_spec?: unknown; url_tags?: string; name?: string; degrees_of_freedom_spec?: { creative_features_spec?: Record<string, { enroll_status?: string }> } }>(
    oldCreative, token, { fields: 'object_story_spec,asset_feed_spec,url_tags,name,degrees_of_freedom_spec' })
  if (!cr.object_story_spec || cr.asset_feed_spec) throw new Error('Este anuncio usa un formato dinámico o una publicación existente: editá el texto desde Ads Manager')
  const spec = JSON.parse(JSON.stringify(cr.object_story_spec)) as Record<string, Record<string, unknown>>
  if (spec.link_data) {
    if (v.message != null) spec.link_data.message = v.message
    if (v.headline != null) spec.link_data.name = v.headline
    if (v.link) {
      spec.link_data.link = v.link
      const cta = spec.link_data.call_to_action as { value?: { link?: string } } | undefined
      if (cta?.value) cta.value.link = v.link
    }
  } else if (spec.video_data) {
    if (v.message != null) spec.video_data.message = v.message
    if (v.headline != null) spec.video_data.title = v.headline
    const cta = spec.video_data.call_to_action as { value?: { link?: string } } | undefined
    if (v.link && cta?.value) cta.value.link = v.link
  } else {
    throw new Error('Formato de creativo no soportado para editar texto')
  }
  const created = await graphPost<{ id: string }>(`${accountExternal}/adcreatives`, token, {
    name: `${cr.name || ad.name} · editado ${new Date().toISOString().slice(0, 10)}`,
    object_story_spec: spec,
    ...(cr.url_tags ? { url_tags: cr.url_tags } : {}),
    // Conserva las mejoras automáticas que tenía el creativo original
    ...(cr.degrees_of_freedom_spec?.creative_features_spec ? { degrees_of_freedom_spec: { creative_features_spec: Object.fromEntries(Object.entries(cr.degrees_of_freedom_spec.creative_features_spec).filter(([k, v]) => v?.enroll_status && k !== 'standard_enhancements').map(([k, v]) => [k, { enroll_status: v.enroll_status }])) } } : {}),
  })
  await graphPost(adId, token, { creative: { creative_id: created.id } })
  return { oldCreative, newCreative: created.id }
}

/** Aplica cambios en Meta, los registra y actualiza la copia local. */
export async function applyChanges(ctx: FaroContext, changes: Change[], meta: { undoOf?: string } = {}): Promise<ChangeResult[]> {
  const sb = svc()
  const out: ChangeResult[] = []
  for (const ch of changes.slice(0, 50)) {
    const acc = ctx.adAccounts.find((a) => a.id === ch.accountId)
    if (!acc) { out.push({ id: ch.id, field: ch.field, ok: false, error: 'Cuenta inválida' }); continue }
    if (!ALLOWED[ch.level]?.includes(ch.field)) { out.push({ id: ch.id, field: ch.field, ok: false, error: 'Campo no editable' }); continue }
    const { data: ent } = await sb.from('ad_entities').select('*').eq('ad_account_id', acc.id).eq('entity_id', ch.id).maybeSingle()
    if (!ent) { out.push({ id: ch.id, field: ch.field, ok: false, error: 'No se encontró en la cuenta (sincronizá y reintentá)' }); continue }
    const isProtected = acc.protected_ids?.includes(ch.id) || (ent.campaign_id && acc.protected_ids?.includes(ent.campaign_id))
    if (isProtected && !ch.confirmProtected) { out.push({ id: ch.id, field: ch.field, ok: false, error: 'Está protegido: confirmá el cambio' }); continue }

    let oldValue: unknown = null
    let newValue: unknown = ch.value
    const localPatch: Record<string, unknown> = {}
    try {
      const token = await getMetaToken(acc.connection_id)
      switch (ch.field) {
        case 'status': {
          const v = String(ch.value)
          if (!['ACTIVE', 'PAUSED'].includes(v)) throw new Error('Estado inválido')
          oldValue = ent.status
          await graphPost(ch.id, token, { status: v })
          localPatch.status = v
          localPatch.effective_status = v === 'PAUSED' ? 'PAUSED' : ent.effective_status === 'PAUSED' ? 'ACTIVE' : ent.effective_status
          break
        }
        case 'daily_budget': {
          const v = Math.round(Number(ch.value))
          if (!isFinite(v) || v <= 0) throw new Error('Presupuesto inválido')
          if (ent.daily_budget == null) throw new Error(ch.level === 'adset' ? 'Este ad set usa el presupuesto de la campaña' : 'Esta campaña usa presupuesto por ad set')
          oldValue = Number(ent.daily_budget)
          await graphPost(ch.id, token, { daily_budget: String(Math.round(v * 100)) })
          localPatch.daily_budget = v
          newValue = v
          break
        }
        case 'name': {
          const v = String(ch.value || '').trim().slice(0, 250)
          if (!v) throw new Error('El nombre no puede quedar vacío')
          oldValue = ent.name
          await graphPost(ch.id, token, { name: v })
          localPatch.name = v
          newValue = v
          break
        }
        case 'end_time': {
          const v = ch.value ? new Date(String(ch.value)).toISOString() : null
          oldValue = null
          await graphPost(ch.id, token, { end_time: v ?? '0' })
          break
        }
        case 'age_min': case 'age_max': case 'genders': {
          const cur = await graphGet<{ targeting: Record<string, unknown> }>(ch.id, token, { fields: 'targeting' })
          const t = { ...(cur.targeting || {}) }
          oldValue = t[ch.field] ?? null
          if (ch.field === 'genders') {
            const g = Array.isArray(ch.value) ? (ch.value as number[]).filter((x) => x === 1 || x === 2) : []
            if (g.length === 0 || g.length === 2) delete t.genders
            else t.genders = g
            newValue = g
          } else {
            const v = Math.round(Number(ch.value))
            if (!isFinite(v) || v < 18 || v > 65) throw new Error('Edad entre 18 y 65')
            t[ch.field] = v
            newValue = v
          }
          await graphPost(ch.id, token, { targeting: t })
          localPatch.targeting = t
          break
        }
        case 'copy': {
          const r = await applyCopy(token, acc.external_id, ch.id, (ch.value || {}) as CopyValue)
          oldValue = { creative_id: r.oldCreative }
          newValue = { ...(ch.value as object), creative_id: r.newCreative }
          localPatch.creative = { ...(ent.creative || {}), id: r.newCreative }
          break
        }
        case 'creative_id': {
          const v = String((ch.value as { creative_id?: string })?.creative_id || ch.value)
          const ad = await graphGet<{ creative?: { id: string } }>(ch.id, token, { fields: 'creative{id}' })
          oldValue = { creative_id: ad.creative?.id }
          await graphPost(ch.id, token, { creative: { creative_id: v } })
          newValue = { creative_id: v }
          break
        }
      }
      if (Object.keys(localPatch).length) await sb.from('ad_entities').update(localPatch).eq('ad_account_id', acc.id).eq('entity_id', ch.id)
      const { data: log } = await sb.from('change_log').insert({
        workspace_id: ctx.workspace.id, ad_account_id: acc.id, user_id: ctx.user.id, user_email: ctx.user.email,
        level: ch.level, entity_id: ch.id, entity_name: ent.name, field: ch.field,
        old_value: oldValue as object, new_value: newValue as object, status: 'ok',
      }).select('id').single()
      if (meta.undoOf) await sb.from('change_log').update({ undone_at: new Date().toISOString() }).eq('id', meta.undoOf)
      out.push({ id: ch.id, field: ch.field, ok: true, changeId: log?.id, old: oldValue, new: newValue })
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e)
      await sb.from('change_log').insert({
        workspace_id: ctx.workspace.id, ad_account_id: acc.id, user_id: ctx.user.id, user_email: ctx.user.email,
        level: ch.level, entity_id: ch.id, entity_name: ent.name, field: ch.field,
        old_value: oldValue as object, new_value: ch.value as object, status: 'error', error: msg.slice(0, 500),
      })
      out.push({ id: ch.id, field: ch.field, ok: false, error: msg })
    }
  }
  return out
}
