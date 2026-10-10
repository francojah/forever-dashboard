import { apiContext, canEdit } from '@/lib/faro/context'
import { svc } from '@/lib/faro/db'
import { graphGet, graphPost, getMetaToken } from '@/lib/faro/meta'

export const dynamic = 'force-dynamic'
export const maxDuration = 60

interface Body {
  accountId: string
  adsetId?: string
  adsetIds?: string[]        // crear el mismo anuncio en varios ad sets
  messages?: string[]        // varios textos: Meta elige la mejor combinación
  headlines?: string[]
  path: string               // en el bucket faro-creatives
  type: 'image' | 'video'
  name: string
  message?: string
  headline?: string
  link: string
  cta?: string
  urlTags?: string
  pageId: string
  igUserId?: string | null
  videoId?: string           // reintento de un video que todavía se procesaba
  status?: 'PAUSED' | 'ACTIVE'
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms))

/**
 * Sube un creativo a Meta y crea el anuncio (en pausa por defecto).
 * Videos: si Meta no terminó de procesarlo en ~40 s, devuelve { pending, videoId } para reintentar.
 */
export async function POST(req: Request) {
  const t0 = Date.now()
  const ctx = await apiContext()
  if (ctx instanceof Response) return ctx
  if (!canEdit(ctx)) return Response.json({ error: 'Tu rol es de solo lectura' }, { status: 403 })
  const b = await req.json().catch(() => ({})) as Body
  const acc = ctx.adAccounts.find((a) => a.id === b.accountId)
  if (!acc) return Response.json({ error: 'Cuenta inválida' }, { status: 400 })
  const adsetIds = Array.from(new Set((b.adsetIds?.length ? b.adsetIds : b.adsetId ? [b.adsetId] : []).filter(Boolean))).slice(0, 20)
  const messages = (b.messages?.length ? b.messages : [b.message || '']).map((x) => x.trim()).filter(Boolean).slice(0, 5)
  const headlines = (b.headlines?.length ? b.headlines : [b.headline || '']).map((x) => x.trim()).filter(Boolean).slice(0, 5)
  if (!adsetIds.length || !b.path || !b.pageId || !b.link || !b.name || !messages.length) return Response.json({ error: 'Faltan datos (ad set, archivo, página, link, nombre o texto)' }, { status: 400 })
  if (!b.path.startsWith(`${ctx.workspace.id}/`)) return Response.json({ error: 'Archivo inválido' }, { status: 400 })
  const { data: adsets } = await svc().from('ad_entities').select('entity_id,name,campaign_id').eq('ad_account_id', acc.id).in('entity_id', adsetIds).eq('level', 'adset')
  if (!adsets || adsets.length !== adsetIds.length) return Response.json({ error: 'Algún ad set no se encontró en la cuenta' }, { status: 400 })
  const message = messages[0]
  const headline = headlines[0]
  // Varios textos o títulos: variaciones que Meta combina sola
  const feed = messages.length > 1 || headlines.length > 1
    ? { asset_feed_spec: { bodies: messages.map((text) => ({ text })), ...(headlines.length ? { titles: headlines.map((text) => ({ text })) } : {}), optimization_type: 'DEGREES_OF_FREEDOM' } }
    : {}

  try {
    const token = await getMetaToken(acc.connection_id)
    const storage = svc().storage.from('faro-creatives')
    const cta = { type: b.cta || 'SHOP_NOW', value: { link: b.link } }
    let objectStory: Record<string, unknown>

    if (b.type === 'image') {
      const { data: file, error } = await storage.download(b.path)
      if (error || !file) throw new Error('No se pudo leer el archivo subido')
      const bytes = Buffer.from(await file.arrayBuffer()).toString('base64')
      const img = await graphPost<{ images: Record<string, { hash: string }> }>(`${acc.external_id}/adimages`, token, { bytes, name: b.name })
      const hash = Object.values(img.images || {})[0]?.hash
      if (!hash) throw new Error('Meta no devolvió la imagen')
      objectStory = { page_id: b.pageId, ...(b.igUserId ? { instagram_user_id: b.igUserId } : {}),
        link_data: { image_hash: hash, link: b.link, message, ...(headline ? { name: headline } : {}), call_to_action: cta } }
    } else {
      let videoId = b.videoId
      if (!videoId) {
        const { data: signed, error } = await storage.createSignedUrl(b.path, 3600)
        if (error || !signed) throw new Error('No se pudo preparar el video')
        const v = await graphPost<{ id: string }>(`${acc.external_id}/advideos`, token, { file_url: signed.signedUrl, name: b.name })
        videoId = v.id
      }
      let ready = false
      while (Date.now() - t0 < 40000) {
        const st = await graphGet<{ status?: { video_status?: string } }>(videoId, token, { fields: 'status' })
        if (st.status?.video_status === 'ready') { ready = true; break }
        if (st.status?.video_status === 'error') throw new Error('Meta no pudo procesar el video')
        await sleep(4000)
      }
      if (!ready) return Response.json({ ok: false, pending: true, videoId })
      const th = await graphGet<{ data?: { uri: string; is_preferred: boolean }[] }>(`${videoId}/thumbnails`, token)
      const thumb = (th.data || []).find((t) => t.is_preferred)?.uri || th.data?.[0]?.uri
      objectStory = { page_id: b.pageId, ...(b.igUserId ? { instagram_user_id: b.igUserId } : {}),
        video_data: { video_id: videoId, ...(thumb ? { image_url: thumb } : {}), message, ...(headline ? { title: headline } : {}), call_to_action: cta } }
    }

    const creative = await graphPost<{ id: string }>(`${acc.external_id}/adcreatives`, token, {
      name: b.name, object_story_spec: objectStory, ...feed, ...(b.urlTags ? { url_tags: b.urlTags } : {}),
    })
    const created: { adsetId: string; adId?: string; error?: string }[] = []
    for (const set of adsets as { entity_id: string; name: string; campaign_id: string }[]) {
      try {
        const ad = await graphPost<{ id: string }>(`${acc.external_id}/ads`, token, {
          name: b.name, adset_id: set.entity_id, creative: { creative_id: creative.id }, status: b.status === 'ACTIVE' ? 'ACTIVE' : 'PAUSED',
        })
        created.push({ adsetId: set.entity_id, adId: ad.id })
        await svc().from('change_log').insert({
          workspace_id: ctx.workspace.id, ad_account_id: acc.id, user_id: ctx.user.id, user_email: ctx.user.email,
          level: 'ad', entity_id: ad.id, entity_name: b.name, field: 'create_ad',
          old_value: null, new_value: { adset_id: set.entity_id, adset_name: set.name, creative_id: creative.id, status: b.status || 'PAUSED', texts: messages.length, titles: headlines.length }, status: 'ok',
        })
        await svc().from('ad_entities').upsert({
          ad_account_id: acc.id, entity_id: ad.id, level: 'ad', parent_id: set.entity_id, campaign_id: set.campaign_id,
          name: b.name, status: b.status || 'PAUSED', effective_status: b.status || 'PAUSED', creative: { id: creative.id, body: message, title: headline || null }, synced_at: new Date().toISOString(),
        }, { onConflict: 'ad_account_id,entity_id' })
      } catch (e) {
        created.push({ adsetId: set.entity_id, error: e instanceof Error ? e.message : 'Error de Meta' })
      }
    }
    await storage.remove([b.path]).catch(() => null)
    const ok = created.filter((c) => c.adId)
    if (!ok.length) throw new Error(created[0]?.error || 'Meta rechazó el anuncio')
    return Response.json({ ok: true, adId: ok[0].adId, adIds: ok.map((c) => c.adId), failed: created.filter((c) => c.error), creativeId: creative.id })
  } catch (e) {
    return Response.json({ ok: false, error: e instanceof Error ? e.message : 'Error de Meta' }, { status: 400 })
  }
}
