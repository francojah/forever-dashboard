import { apiContext, canEdit } from '@/lib/faro/context'
import { svc } from '@/lib/faro/db'
import { graphGet, graphPost, getMetaToken } from '@/lib/faro/meta'
import { degreesOfFreedomSpec } from '@/lib/faro/enhancements'

export const dynamic = 'force-dynamic'
export const maxDuration = 60

interface Body {
  accountId: string
  adsetId?: string
  adsetIds?: string[]        // crear el mismo anuncio en varios ad sets
  messages?: string[]        // varios textos: Meta elige la mejor combinación
  headlines?: string[]
  description?: string       // texto debajo del título (descripción del enlace)
  multiAds?: boolean         // anuncios multianunciante (por defecto, lo de Ajustes)
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
  storyPath?: string         // segunda versión 9:16 del mismo creativo (historias y reels)
  storyVideoId?: string
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
  if (b.storyPath && !b.storyPath.startsWith(`${ctx.workspace.id}/`)) return Response.json({ error: 'Archivo inválido' }, { status: 400 })
  const description = (b.description || '').trim().slice(0, 255)
  const message = messages[0]
  const headline = headlines[0]
  const prefs = ctx.workspace.settings.meta_enhancements
  const pac = !!b.storyPath                       // un anuncio con versión feed + versión historias
  const multi = messages.length > 1 || headlines.length > 1
  // Música: se pide solo si está prendida; si hay asset_feed_spec, se manda vacía para dejarla apagada
  const audios = prefs.music ? { audios: [{ type: 'random' }] } : (multi || pac) ? { audios: [] } : {}

  try {
    const token = await getMetaToken(acc.connection_id)
    const storage = svc().storage.from('faro-creatives')
    const cta = { type: b.cta || 'SHOP_NOW', value: { link: b.link } }
    const identity = { page_id: b.pageId, ...(b.igUserId ? { instagram_user_id: b.igUserId } : {}) }

    const uploadImage = async (path: string, name: string) => {
      const { data: file, error } = await storage.download(path)
      if (error || !file) throw new Error('No se pudo leer el archivo subido')
      const bytes = Buffer.from(await file.arrayBuffer()).toString('base64')
      const img = await graphPost<{ images: Record<string, { hash: string }> }>(`${acc!.external_id}/adimages`, token, { bytes, name })
      const hash = Object.values(img.images || {})[0]?.hash
      if (!hash) throw new Error('Meta no devolvió la imagen')
      return hash
    }
    const startVideo = async (path: string, existing: string | undefined, name: string) => {
      if (existing) return existing
      const { data: signed, error } = await storage.createSignedUrl(path, 3600)
      if (error || !signed) throw new Error('No se pudo preparar el video')
      return (await graphPost<{ id: string }>(`${acc!.external_id}/advideos`, token, { file_url: signed.signedUrl, name })).id
    }
    const videoReady = async (id: string) => {
      const st = await graphGet<{ status?: { video_status?: string } }>(id, token, { fields: 'status' })
      if (st.status?.video_status === 'error') throw new Error('Meta no pudo procesar el video')
      return st.status?.video_status === 'ready'
    }
    const thumbOf = async (id: string) => {
      const th = await graphGet<{ data?: { uri: string; is_preferred: boolean }[] }>(`${id}/thumbnails`, token)
      return (th.data || []).find((t) => t.is_preferred)?.uri || th.data?.[0]?.uri
    }

    let creativeBody: Record<string, unknown>
    if (pac) {
      // Personalización por ubicación: feed usa una versión, historias y reels la otra (9:16)
      const FEED = { publisher_platforms: ['facebook', 'instagram', 'audience_network', 'messenger'], facebook_positions: ['feed', 'marketplace', 'video_feeds', 'search', 'profile_feed', 'instream_video'], instagram_positions: ['stream', 'explore', 'explore_home', 'profile_feed'], audience_network_positions: ['classic'], messenger_positions: ['messenger_home'] }
      const STORY = { publisher_platforms: ['facebook', 'instagram', 'messenger'], facebook_positions: ['story', 'facebook_reels'], instagram_positions: ['story', 'reels'], messenger_positions: ['story'] }
      const base = {
        bodies: messages.map((text) => ({ text })), ...(headlines.length ? { titles: headlines.map((text) => ({ text })) } : {}),
        link_urls: [{ website_url: b.link }], call_to_action_types: [b.cta || 'SHOP_NOW'], optimization_type: 'PLACEMENT', ...audios,
        ...(description ? { descriptions: [{ text: description }] } : {}),
      }
      let media: Record<string, unknown>
      if (b.type === 'image') {
        const [feedHash, storyHash] = await Promise.all([uploadImage(b.path, `${b.name} · feed`), uploadImage(b.storyPath!, `${b.name} · historias`)])
        media = {
          ad_formats: ['SINGLE_IMAGE'],
          images: [{ hash: feedHash, adlabels: [{ name: 'faro_feed' }] }, { hash: storyHash, adlabels: [{ name: 'faro_story' }] }],
          asset_customization_rules: [{ customization_spec: FEED, image_label: { name: 'faro_feed' }, priority: 1 }, { customization_spec: STORY, image_label: { name: 'faro_story' }, priority: 2 }],
        }
      } else {
        const [feedId, storyId] = await Promise.all([startVideo(b.path, b.videoId, `${b.name} · feed`), startVideo(b.storyPath!, b.storyVideoId, `${b.name} · historias`)])
        let ready = false
        while (Date.now() - t0 < 40000) {
          const [a, c] = await Promise.all([videoReady(feedId), videoReady(storyId)])
          if (a && c) { ready = true; break }
          await sleep(4000)
        }
        if (!ready) return Response.json({ ok: false, pending: true, videoId: feedId, storyVideoId: storyId })
        const [t1, t2] = await Promise.all([thumbOf(feedId), thumbOf(storyId)])
        media = {
          ad_formats: ['SINGLE_VIDEO'],
          videos: [{ video_id: feedId, ...(t1 ? { thumbnail_url: t1 } : {}), adlabels: [{ name: 'faro_feed' }] }, { video_id: storyId, ...(t2 ? { thumbnail_url: t2 } : {}), adlabels: [{ name: 'faro_story' }] }],
          asset_customization_rules: [{ customization_spec: FEED, video_label: { name: 'faro_feed' }, priority: 1 }, { customization_spec: STORY, video_label: { name: 'faro_story' }, priority: 2 }],
        }
      }
      creativeBody = { object_story_spec: identity, asset_feed_spec: { ...base, ...media } }
    } else {
      const feedSpec: Record<string, unknown> = {
        // Varios textos o títulos: variaciones que Meta combina sola
        ...(multi ? { bodies: messages.map((text) => ({ text })), ...(headlines.length ? { titles: headlines.map((text) => ({ text })) } : {}), optimization_type: 'DEGREES_OF_FREEDOM' } : {}),
        ...audios,
      }
      let objectStory: Record<string, unknown>
      if (b.type === 'image') {
        const hash = await uploadImage(b.path, b.name)
        objectStory = { ...identity, link_data: { image_hash: hash, link: b.link, message, ...(headline ? { name: headline } : {}), ...(description ? { description } : {}), call_to_action: cta } }
      } else {
        const videoId = await startVideo(b.path, b.videoId, b.name)
        let ready = false
        while (Date.now() - t0 < 40000) { if (await videoReady(videoId)) { ready = true; break } await sleep(4000) }
        if (!ready) return Response.json({ ok: false, pending: true, videoId })
        const thumb = await thumbOf(videoId)
        objectStory = { ...identity, video_data: { video_id: videoId, ...(thumb ? { image_url: thumb } : {}), message, ...(headline ? { title: headline } : {}), ...(description ? { link_description: description } : {}), call_to_action: cta } }
      }
      creativeBody = { object_story_spec: objectStory, ...(Object.keys(feedSpec).length ? { asset_feed_spec: feedSpec } : {}) }
    }

    const creative = await graphPost<{ id: string }>(`${acc.external_id}/adcreatives`, token, {
      name: b.name, ...creativeBody, ...(b.urlTags ? { url_tags: b.urlTags } : {}),
      degrees_of_freedom_spec: degreesOfFreedomSpec(prefs, b.type),
      contextual_multi_ads: { enroll_status: (b.multiAds ?? prefs.multiAds) ? 'OPT_IN' : 'OPT_OUT' },
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
    await storage.remove([b.path, ...(b.storyPath ? [b.storyPath] : [])]).catch(() => null)
    const ok = created.filter((c) => c.adId)
    if (!ok.length) throw new Error(created[0]?.error || 'Meta rechazó el anuncio')
    return Response.json({ ok: true, adId: ok[0].adId, adIds: ok.map((c) => c.adId), failed: created.filter((c) => c.error), creativeId: creative.id })
  } catch (e) {
    const msg = e instanceof Error ? e.message : 'Error de Meta'
    const devMode = (e as { subcode?: number })?.subcode === 1885183 || /modo de desarrollo|development mode/i.test(msg)
    return Response.json({ ok: false, error: devMode
      ? 'La app de Meta que usa Faro está en modo desarrollo: pasala a modo activo (Live) en developers.facebook.com y volvé a intentar.'
      : msg }, { status: 400 })
  }
}
