'use client'

import { useEffect, useMemo, useRef, useState } from 'react'
import { createClientBrowser } from '@/lib/supabase'
import { money, int } from '@/lib/faro/format'
import { Badge } from '../ui'

export interface AdsetOpt { accountId: string; id: string; name: string; status: string; goal: string | null; campaignId: string; campaign: string }
export interface CampaignOpt { accountId: string; id: string; name: string; status: string; hasBudget: boolean }
export interface AdOpt { accountId: string; id: string; name: string; adset: string; campaign: string; thumbnail: string | null; spend: number; purchases: number; active: boolean }
interface Identity { page_id: string; instagram_user_id: string | null; page_name: string; instagram_name: string | null }
interface Pixel { id: string; name: string; last_fired_time?: string }
interface FileItem {
  key: string; file: File; preview: string; type: 'image' | 'video'; name: string
  state: 'listo' | 'subiendo' | 'procesando' | 'creado' | 'error'; error?: string; adIds?: string[]; ratio?: string; ratioWarn?: string
}

const CTAS = [['SHOP_NOW', 'Comprar'], ['LEARN_MORE', 'Más información'], ['BUY_NOW', 'Comprar ahora'], ['ORDER_NOW', 'Pedir ahora'], ['GET_OFFER', 'Obtener oferta'], ['SEND_MESSAGE', 'Enviar mensaje']]
const UTM = 'utm_source=facebook&utm_medium=paid&utm_campaign={{campaign.name}}&utm_content={{ad.name}}'
const TRAFFIC = new Set(['LINK_CLICKS', 'LANDING_PAGE_VIEWS', 'REACH', 'IMPRESSIONS', 'PROFILE_VISIT', 'VISIT_INSTAGRAM_PROFILE'])
const baseName = (f: string) => f.replace(/\.[^.]+$/, '').replace(/[_-]+/g, ' ').trim().toUpperCase().slice(0, 60)
const todayLabel = () => { const d = new Date(); return `${d.getDate()}/${d.getMonth() + 1}` }

function measure(type: 'image' | 'video', url: string): Promise<{ ratio?: string; ratioWarn?: string }> {
  return new Promise((resolve) => {
    const done = (w: number, h: number) => {
      if (!w || !h) return resolve({})
      const r = w / h
      const near = ([['1:1', 1], ['4:5', 0.8], ['9:16', 0.5625], ['16:9', 1.778]] as [string, number][]).find(([, v]) => Math.abs(r - v) < 0.03)
      resolve({ ratio: near ? near[0] : `${w}×${h}`, ratioWarn: !near ? 'proporción poco común: Meta lo recorta' : near[0] === '16:9' ? 'horizontal: rinde peor en Reels e Historias' : Math.min(w, h) < 600 ? 'resolución baja' : undefined })
    }
    if (type === 'image') { const i = new Image(); i.onload = () => done(i.naturalWidth, i.naturalHeight); i.onerror = () => resolve({}); i.src = url }
    else { const v = document.createElement('video'); v.preload = 'metadata'; v.onloadedmetadata = () => done(v.videoWidth, v.videoHeight); v.onerror = () => resolve({}); v.src = url }
  })
}

function Step({ n, title, children, aside }: { n: number; title: string; children: React.ReactNode; aside?: React.ReactNode }) {
  return (
    <section className="rounded-panel border border-line bg-surface">
      <header className="flex items-center gap-3 px-5 py-3.5 border-b border-line">
        <span className="w-6 h-6 rounded-full bg-ink text-bg grid place-items-center text-[12.5px] font-semibold">{n}</span>
        <h2 className="text-[15px] font-semibold text-ink">{title}</h2>
        <div className="ml-auto">{aside}</div>
      </header>
      <div className="p-5">{children}</div>
    </section>
  )
}

function Seg<T extends string>({ value, options, onChange }: { value: T; options: [T, string][]; onChange: (v: T) => void }) {
  return (
    <div className="inline-flex rounded-lg border border-line bg-sunken/50 p-0.5 text-[13.5px]">
      {options.map(([k, l]) => <button key={k} type="button" onClick={() => onChange(k)} className={`rounded-md px-3 py-1.5 ${value === k ? 'bg-surface text-ink font-medium shadow-sm' : 'text-mute hover:text-ink'}`}>{l}</button>)}
    </div>
  )
}

const input = 'rounded-lg border border-line bg-surface px-3 py-2 text-[13.5px]'

export default function PublishWizard({ canEdit, accounts, adsets, campaigns, ads, defaultLink, templates = [], preAdset, preDup }: {
  canEdit: boolean
  accounts: { id: string; name: string; protected_ids: string[] }[]
  adsets: AdsetOpt[]; campaigns: CampaignOpt[]; ads: AdOpt[]
  defaultLink: string
  templates?: { accountId: string; name: string; body: string; title: string }[]
  preAdset?: string | null; preDup?: string[]
}) {
  const startAcc = (preAdset && adsets.find((s) => s.id === preAdset)?.accountId) || (preDup?.length && ads.find((a) => a.id === preDup[0])?.accountId) || accounts[0]?.id || ''
  const [account, setAccount] = useState(startAcc)
  const acc = accounts.find((a) => a.id === account)

  // 1. Destino
  const [dest, setDest] = useState<'existentes' | 'nuevo'>('existentes')
  const [targets, setTargets] = useState<Set<string>>(new Set(preAdset ? [preAdset] : []))
  const [setQuery, setSetQuery] = useState('')
  const [campMode, setCampMode] = useState<'existente' | 'nueva'>('nueva')
  const [campId, setCampId] = useState('')
  const [campName, setCampName] = useState(`TESTING · ${todayLabel()}`)
  const [campBudget, setCampBudget] = useState<number>(0)
  const [setName, setSetName] = useState(`TEST CREATIVOS · ${todayLabel()}`)
  const [setBudget, setSetBudget] = useState<number>(10000)
  const [pixels, setPixels] = useState<Pixel[]>([])
  const [pixel, setPixel] = useState('')
  const [advantage, setAdvantage] = useState(true)
  const [ageMin, setAgeMin] = useState(18)
  const [ageMax, setAgeMax] = useState(65)
  const [gender, setGender] = useState<'all' | '1' | '2'>('all')

  // 2. Contenido
  const [source, setSource] = useState<'archivos' | 'duplicar'>(preDup?.length ? 'duplicar' : 'archivos')
  const [files, setFiles] = useState<FileItem[]>([])
  const [dupIds, setDupIds] = useState<Set<string>>(new Set(preDup || []))
  const [adQuery, setAdQuery] = useState('')
  const [drag, setDrag] = useState(false)
  const fileInput = useRef<HTMLInputElement>(null)

  // 3. Texto
  const [identities, setIdentities] = useState<Identity[]>([])
  const [identity, setIdentity] = useState(0)
  const [texts, setTexts] = useState<string[]>([''])
  const [titles, setTitles] = useState<string[]>([''])
  const [link, setLink] = useState(defaultLink)
  const [cta, setCta] = useState('SHOP_NOW')
  const [utm, setUtm] = useState(true)

  // Ejecución
  const [running, setRunning] = useState(false)
  const [log, setLog] = useState<{ ok: boolean; text: string }[]>([])
  const [created, setCreated] = useState<{ ads: string[]; adset?: string; campaign?: string }>({ ads: [] })
  const [activated, setActivated] = useState(false)

  useEffect(() => {
    if (!account) return
    setIdentities([]); setPixels([])
    fetch(`/api/v2/meta/identities?account=${account}`).then((r) => r.json()).then((j) => { setIdentities(j.identities || []); setIdentity(0) }).catch(() => {})
  }, [account])
  useEffect(() => {
    if (dest !== 'nuevo' || !account || pixels.length) return
    fetch(`/api/v2/meta/structure?account=${account}`).then((r) => r.json()).then((j) => { setPixels(j.pixels || []); setPixel(j.pixels?.[0]?.id || '') }).catch(() => {})
  }, [dest, account, pixels.length])

  const accAdsets = useMemo(() => adsets.filter((s) => s.accountId === account), [adsets, account])
  const grouped = useMemo(() => {
    const q = setQuery.trim().toLowerCase()
    const m = new Map<string, AdsetOpt[]>()
    accAdsets
      .filter((s) => !q || s.name.toLowerCase().includes(q) || s.campaign.toLowerCase().includes(q))
      .sort((a, b) => Number(TRAFFIC.has(a.goal || '')) - Number(TRAFFIC.has(b.goal || '')) || Number(b.status === 'ACTIVE') - Number(a.status === 'ACTIVE'))
      .forEach((s) => { const l = m.get(s.campaign) || []; l.push(s); m.set(s.campaign, l) })
    return Array.from(m.entries())
  }, [accAdsets, setQuery])
  const accCampaigns = campaigns.filter((c) => c.accountId === account)
  const chosenCamp = accCampaigns.find((c) => c.id === campId)
  const needsSetBudget = campMode === 'nueva' ? !(campBudget > 0) : !chosenCamp?.hasBudget
  const prot = (id: string, campaignId?: string) => !!acc && (acc.protected_ids.includes(id) || (!!campaignId && acc.protected_ids.includes(campaignId)))
  const protectedTargets = accAdsets.filter((s) => targets.has(s.id) && prot(s.id, s.campaignId))
  const accAds = useMemo(() => {
    const q = adQuery.trim().toLowerCase()
    return ads.filter((a) => a.accountId === account && (!q || a.name.toLowerCase().includes(q) || a.adset.toLowerCase().includes(q)))
  }, [ads, account, adQuery])

  function addFiles(list: FileList | null) {
    if (!list) return
    const add: FileItem[] = []
    Array.from(list).slice(0, 30).forEach((f) => {
      const type = f.type.startsWith('video') ? 'video' : f.type.startsWith('image') ? 'image' : null
      if (!type) return
      add.push({ key: `${f.name}-${f.size}-${Math.random()}`, file: f, preview: URL.createObjectURL(f), type, name: `${type === 'video' ? 'VID' : 'IMG'} - ${baseName(f.name)} - ${todayLabel()}`, state: 'listo' })
    })
    setFiles((cur) => [...cur, ...add].slice(0, 30))
    add.forEach((it) => measure(it.type, it.preview).then((r) => setFiles((cur) => cur.map((x) => (x.key === it.key ? { ...x, ...r } : x)))))
  }
  const upd = (key: string, patch: Partial<FileItem>) => setFiles((cur) => cur.map((i) => (i.key === key ? { ...i, ...patch } : i)))
  const say = (ok: boolean, text: string) => setLog((l) => [...l, { ok, text }])

  const destCount = dest === 'nuevo' ? 1 : targets.size
  const contentCount = source === 'archivos' ? files.filter((f) => f.state === 'listo' || f.state === 'error').length : dupIds.size
  const total = destCount * contentCount
  const cleanTexts = texts.map((t) => t.trim()).filter(Boolean)
  const cleanTitles = titles.map((t) => t.trim()).filter(Boolean)
  const missing = [
    dest === 'existentes' && !targets.size && 'elegí al menos un ad set',
    dest === 'nuevo' && !pixel && 'elegí el píxel',
    dest === 'nuevo' && campMode === 'existente' && !campId && 'elegí la campaña',
    dest === 'nuevo' && needsSetBudget && !(setBudget > 0) && 'poné presupuesto al ad set',
    !contentCount && (source === 'archivos' ? 'agregá archivos' : 'elegí anuncios para duplicar'),
    source === 'archivos' && !cleanTexts.length && 'falta el texto principal',
    source === 'archivos' && !link && 'falta el link',
    source === 'archivos' && !identities.length && 'la cuenta no tiene página detectada',
  ].filter(Boolean) as string[]

  async function createStructure(): Promise<string | null> {
    say(true, dest === 'nuevo' && campMode === 'nueva' ? 'Creando campaña y ad set…' : 'Creando ad set…')
    const r = await fetch('/api/v2/meta/structure', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        accountId: account,
        ...(campMode === 'existente' ? { campaignId: campId } : { campaign: { name: campName, dailyBudget: campBudget > 0 ? campBudget : null } }),
        adset: { name: setName, dailyBudget: needsSetBudget ? setBudget : null, pixelId: pixel, advantageAudience: advantage, ageMin, ageMax, genders: gender === 'all' ? [] : [Number(gender)] },
      }),
    }).then((x) => x.json()).catch(() => ({ error: 'Sin conexión' }))
    if (!r.ok) { say(false, `No se pudo crear: ${r.error}`); return null }
    setCreated((c) => ({ ...c, adset: r.adsetId, campaign: r.createdCampaign || undefined }))
    say(true, `Ad set creado en pausa${r.createdCampaign ? ' (con campaña nueva)' : ''}.`)
    return r.adsetId as string
  }

  async function publishFile(it: FileItem, adsetIds: string[]): Promise<string[]> {
    const id = identities[identity]
    upd(it.key, { state: 'subiendo', error: undefined })
    try {
      const u = await fetch('/api/v2/meta/upload-url', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ filename: it.file.name, size: it.file.size }) }).then((r) => r.json())
      if (!u.token) throw new Error(u.error || 'No se pudo preparar la subida')
      const up = await createClientBrowser().storage.from('faro-creatives').uploadToSignedUrl(u.path, u.token, it.file, { contentType: it.file.type })
      if (up.error) throw new Error(up.error.message)
      upd(it.key, { state: 'procesando' })
      let videoId: string | undefined
      for (let attempt = 0; attempt < 8; attempt++) {
        const r = await fetch('/api/v2/meta/publish', {
          method: 'POST', headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ accountId: account, adsetIds, path: u.path, type: it.type, name: it.name, messages: cleanTexts, headlines: cleanTitles, link, cta, urlTags: utm ? UTM : undefined, pageId: id?.page_id, igUserId: id?.instagram_user_id, videoId }),
        }).then((x) => x.json())
        if (r.ok) {
          upd(it.key, { state: 'creado', adIds: r.adIds || [r.adId], error: r.failed?.length ? `${r.failed.length} ad set(s) fallaron: ${r.failed[0].error}` : undefined })
          return r.adIds || [r.adId]
        }
        if (r.pending) { videoId = r.videoId; continue }
        throw new Error(r.error || 'Meta rechazó el anuncio')
      }
      throw new Error('Meta sigue procesando el video: probá de nuevo en unos minutos')
    } catch (e) {
      upd(it.key, { state: 'error', error: e instanceof Error ? e.message : 'Error' })
      return []
    }
  }

  async function run() {
    setRunning(true); setLog([]); setActivated(false)
    let adsetIds = Array.from(targets)
    if (dest === 'nuevo') {
      const id = created.adset || await createStructure()
      if (!id) { setRunning(false); return }
      adsetIds = [id]
    }
    const newAds: string[] = []
    if (source === 'archivos') {
      const queue = files.filter((f) => f.state === 'listo' || f.state === 'error')
      const worker = async () => { for (let it = queue.shift(); it; it = queue.shift()) newAds.push(...await publishFile(it, adsetIds)) }
      await Promise.all([worker(), worker()])
      say(newAds.length > 0, `${newAds.length} anuncios creados en pausa.`)
    } else {
      const r = await fetch('/api/v2/meta/duplicate', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ accountId: account, kind: 'ad', ids: Array.from(dupIds), adsetIds }) }).then((x) => x.json()).catch(() => ({ results: [] }))
      for (const x of r.results || []) if (x.ok) newAds.push(x.to)
      const bad = (r.results || []).filter((x: { ok: boolean }) => !x.ok)
      say(newAds.length > 0, `${newAds.length} anuncios duplicados en pausa${bad.length ? `; ${bad.length} fallaron: ${bad[0].error}` : ''}.`)
    }
    setCreated((c) => ({ ...c, ads: [...c.ads, ...newAds] }))
    setRunning(false)
  }

  async function activateAll() {
    const changes = [
      ...(created.campaign ? [{ accountId: account, level: 'campaign', id: created.campaign, field: 'status', value: 'ACTIVE' }] : []),
      ...(created.adset ? [{ accountId: account, level: 'adset', id: created.adset, field: 'status', value: 'ACTIVE' }] : []),
      ...created.ads.map((id) => ({ accountId: account, level: 'ad', id, field: 'status', value: 'ACTIVE', confirmProtected: true })),
    ]
    const r = await fetch('/api/v2/meta/mutate', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ changes }) }).then((x) => x.json()).catch(() => ({}))
    const okN = (r.results || []).filter((x: { ok: boolean }) => x.ok).length
    say(okN === changes.length, okN === changes.length ? 'Todo activado. Meta lo revisa antes de empezar a entregar.' : `Se activaron ${okN} de ${changes.length}.`)
    setActivated(okN > 0)
  }

  if (!canEdit) return <div className="rounded-panel border border-line bg-surface p-5 text-mute">Tu rol es de solo lectura.</div>

  return (
    <div className="grid xl:grid-cols-[1fr_340px] gap-5 items-start pb-10">
      <div className="flex flex-col gap-5">
        <Step n={1} title="¿Dónde van?" aside={accounts.length > 1 ? (
          <select value={account} onChange={(e) => { setAccount(e.target.value); setTargets(new Set()); setDupIds(new Set()); setCampId('') }} className={input} aria-label="Cuenta">{accounts.map((a) => <option key={a.id} value={a.id}>{a.name}</option>)}</select>
        ) : undefined}>
          <Seg value={dest} onChange={setDest} options={[['existentes', 'Ad sets que ya existen'], ['nuevo', 'Ad set nuevo']]} />
          {dest === 'existentes' ? (
            <div className="mt-4">
              <div className="flex items-center gap-3 mb-2">
                <input value={setQuery} onChange={(e) => setSetQuery(e.target.value)} placeholder="Buscar ad set o campaña" className={`${input} flex-1`} />
                <span className="text-[13px] text-mute whitespace-nowrap">{targets.size} elegidos</span>
              </div>
              <div className="max-h-[320px] overflow-y-auto rounded-lg border border-line divide-y divide-line">
                {grouped.length === 0 && <p className="p-4 text-[13.5px] text-mute">No hay ad sets.</p>}
                {grouped.map(([camp, list]) => (
                  <div key={camp}>
                    <p className="px-3 py-1.5 bg-sunken/60 text-[12px] font-medium text-mute sticky top-0">{camp}</p>
                    {list.map((s) => (
                      <label key={s.id} className="flex items-center gap-3 px-3 py-2 text-[13.5px] hover:bg-sunken/50 cursor-pointer">
                        <input type="checkbox" checked={targets.has(s.id)} onChange={(e) => { const t = new Set(targets); if (e.target.checked) t.add(s.id); else t.delete(s.id); setTargets(t) }} className="accent-[rgb(var(--f-ink))]" />
                        <span className={`w-1.5 h-1.5 rounded-full ${s.status === 'ACTIVE' ? 'bg-good' : 'bg-line'}`} />
                        <span className="flex-1 truncate text-ink">{s.name}</span>
                        {prot(s.id, s.campaignId) && <Badge tone="warn">protegido</Badge>}
                        {TRAFFIC.has(s.goal || '') && <Badge>tráfico</Badge>}
                      </label>
                    ))}
                  </div>
                ))}
              </div>
              {protectedTargets.length > 0 && <p className="mt-2 text-[12.5px] text-warn">Elegiste ad sets protegidos: sumar anuncios puede reiniciar su aprendizaje. Para testear conviene un ad set nuevo.</p>}
            </div>
          ) : (
            <div className="mt-4 grid md:grid-cols-2 gap-5">
              <div className="flex flex-col gap-3">
                <p className="text-[13px] font-medium text-ink">Campaña</p>
                <Seg value={campMode} onChange={setCampMode} options={[['nueva', 'Nueva'], ['existente', 'Existente']]} />
                {campMode === 'nueva' ? (
                  <>
                    <label className="flex flex-col gap-1 text-[13px] text-mute">Nombre<input value={campName} onChange={(e) => setCampName(e.target.value)} className={input} /></label>
                    <label className="flex flex-col gap-1 text-[13px] text-mute">Presupuesto de campaña por día (opcional)
                      <input type="number" min={0} step={1000} value={campBudget || ''} onChange={(e) => setCampBudget(Number(e.target.value) || 0)} placeholder="Vacío = presupuesto en el ad set" className={`${input} num`} />
                    </label>
                    <p className="text-[12px] text-faint">Objetivo: ventas. Se crea en pausa.</p>
                  </>
                ) : (
                  <select value={campId} onChange={(e) => setCampId(e.target.value)} className={input}>
                    <option value="">Elegí la campaña</option>
                    {accCampaigns.map((c) => <option key={c.id} value={c.id}>{c.name}{c.status !== 'ACTIVE' ? ' (pausada)' : ''}{prot(c.id) ? ' · protegida' : ''}</option>)}
                  </select>
                )}
              </div>
              <div className="flex flex-col gap-3">
                <p className="text-[13px] font-medium text-ink">Ad set</p>
                <label className="flex flex-col gap-1 text-[13px] text-mute">Nombre<input value={setName} onChange={(e) => setSetName(e.target.value)} className={input} /></label>
                {needsSetBudget && <label className="flex flex-col gap-1 text-[13px] text-mute">Presupuesto por día<input type="number" min={0} step={1000} value={setBudget || ''} onChange={(e) => setSetBudget(Number(e.target.value) || 0)} className={`${input} num`} /></label>}
                <label className="flex flex-col gap-1 text-[13px] text-mute">Píxel (optimiza a compras)
                  <select value={pixel} onChange={(e) => setPixel(e.target.value)} className={input}>{pixels.length ? pixels.map((p) => <option key={p.id} value={p.id}>{p.name}</option>) : <option value="">Buscando píxeles…</option>}</select>
                </label>
                <Seg value={advantage ? 'adv' : 'man'} onChange={(v) => setAdvantage(v === 'adv')} options={[['adv', 'Público Advantage+'], ['man', 'Manual']]} />
                {!advantage && (
                  <div className="grid grid-cols-3 gap-2">
                    <label className="flex flex-col gap-1 text-[12.5px] text-mute">Edad desde<input type="number" min={18} max={65} value={ageMin} onChange={(e) => setAgeMin(Number(e.target.value))} className={`${input} num`} /></label>
                    <label className="flex flex-col gap-1 text-[12.5px] text-mute">hasta<input type="number" min={18} max={65} value={ageMax} onChange={(e) => setAgeMax(Number(e.target.value))} className={`${input} num`} /></label>
                    <label className="flex flex-col gap-1 text-[12.5px] text-mute">Género<select value={gender} onChange={(e) => setGender(e.target.value as 'all' | '1' | '2')} className={input}><option value="all">Todos</option><option value="1">Hombres</option><option value="2">Mujeres</option></select></label>
                  </div>
                )}
                <p className="text-[12px] text-faint">Argentina, ubicaciones automáticas.</p>
              </div>
            </div>
          )}
        </Step>

        <Step n={2} title="¿Qué publicás?">
          <Seg value={source} onChange={setSource} options={[['archivos', 'Creativos nuevos'], ['duplicar', 'Duplicar anuncios']]} />
          {source === 'archivos' ? (
            <div className="mt-4">
              <div
                onDragOver={(e) => { e.preventDefault(); setDrag(true) }} onDragLeave={() => setDrag(false)}
                onDrop={(e) => { e.preventDefault(); setDrag(false); addFiles(e.dataTransfer.files) }}
                onClick={() => fileInput.current?.click()}
                className={`cursor-pointer rounded-lg border-2 border-dashed ${drag ? 'border-beacon bg-beacon/10' : 'border-line'} px-4 py-7 text-center text-[14px] text-mute`}
              >
                Arrastrá imágenes o videos (hasta 30) o <span className="text-ink underline">elegilos</span>
                <p className="text-[12px] text-faint mt-1">Ideal 4:5 para feed y 9:16 para Reels e Historias</p>
                <input ref={fileInput} type="file" multiple accept="image/*,video/*" className="hidden" onChange={(e) => { addFiles(e.target.files); e.target.value = '' }} />
              </div>
              {files.length > 0 && (
                <ul className="mt-4 grid sm:grid-cols-2 gap-3">
                  {files.map((it) => (
                    <li key={it.key} className="flex gap-3 rounded-lg border border-line p-2.5">
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      {it.type === 'image' ? <img src={it.preview} alt="" className="w-16 h-16 rounded object-cover" /> : <video src={it.preview} className="w-16 h-16 rounded object-cover" muted />}
                      <div className="flex-1 min-w-0">
                        <input value={it.name} disabled={it.state !== 'listo' && it.state !== 'error'} onChange={(e) => upd(it.key, { name: e.target.value })} className="w-full rounded border border-transparent hover:border-line focus:border-line bg-transparent px-1 py-0.5 text-[13px] text-ink" aria-label="Nombre del anuncio" />
                        <p className="px-1 text-[12px] text-mute">{it.type === 'video' ? 'Video' : 'Imagen'} · {(it.file.size / 1048576).toLocaleString('es-AR', { maximumFractionDigits: 1 })} MB{it.ratio && ` · ${it.ratio}`}{it.ratioWarn && <span className="text-warn"> · {it.ratioWarn}</span>}</p>
                        <div className="px-1 mt-1 flex items-center gap-2">
                          {it.state === 'listo' && <button onClick={() => setFiles((c) => c.filter((x) => x.key !== it.key))} className="text-[12px] text-mute hover:text-ink">Quitar</button>}
                          {it.state === 'subiendo' && <Badge>subiendo</Badge>}
                          {it.state === 'procesando' && <Badge tone="beacon">Meta lo procesa</Badge>}
                          {it.state === 'creado' && <Badge tone="good">{it.adIds?.length || 1} creado{(it.adIds?.length || 1) > 1 ? 's' : ''}</Badge>}
                          {it.state === 'error' && <Badge tone="bad">error</Badge>}
                          {it.error && <span className="text-[12px] text-bad truncate" title={it.error}>{it.error}</span>}
                        </div>
                      </div>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          ) : (
            <div className="mt-4">
              <p className="text-[12.5px] text-mute mb-2">Se copia el anuncio con su misma publicación: conserva comentarios, reacciones y compartidos.</p>
              <input value={adQuery} onChange={(e) => setAdQuery(e.target.value)} placeholder="Buscar anuncio" className={`${input} w-full mb-2`} />
              <div className="max-h-[360px] overflow-y-auto rounded-lg border border-line divide-y divide-line">
                {accAds.length === 0 && <p className="p-4 text-[13.5px] text-mute">No hay anuncios.</p>}
                {accAds.map((a) => (
                  <label key={a.id} className="flex items-center gap-3 px-3 py-2 text-[13.5px] hover:bg-sunken/50 cursor-pointer">
                    <input type="checkbox" checked={dupIds.has(a.id)} onChange={(e) => { const t = new Set(dupIds); if (e.target.checked) t.add(a.id); else t.delete(a.id); setDupIds(t) }} className="accent-[rgb(var(--f-ink))]" />
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    {a.thumbnail ? <img src={a.thumbnail} alt="" className="w-10 h-10 rounded object-cover border border-line" /> : <span className="w-10 h-10 rounded bg-sunken" />}
                    <span className="flex-1 min-w-0"><span className="block truncate text-ink">{a.name}</span><span className="block truncate text-[12px] text-mute">{a.adset} · {a.campaign}</span></span>
                    <span className="text-right text-[12px] num"><span className="block text-ink">{money(a.spend)}</span><span className="block text-mute">{int(a.purchases)} compras · 30 días</span></span>
                  </label>
                ))}
              </div>
            </div>
          )}
        </Step>

        {source === 'archivos' && (
          <Step n={3} title="Texto" aside={templates.some((t) => t.accountId === account) ? (
            <select value="" onChange={(e) => { const t = templates.filter((x) => x.accountId === account)[Number(e.target.value)]; if (t) { setTexts([t.body]); setTitles([t.title || '']) } }} className={input} aria-label="Copiar texto de un anuncio">
              <option value="">Copiar de un anuncio…</option>
              {templates.filter((t) => t.accountId === account).map((t, i) => <option key={i} value={i}>{t.name}</option>)}
            </select>
          ) : undefined}>
            <div className="grid md:grid-cols-2 gap-5 text-[13.5px]">
              <div className="flex flex-col gap-2">
                <p className="text-[13px] text-mute">Texto principal {texts.length > 1 && <span className="text-faint">· Meta prueba las {texts.length} versiones</span>}</p>
                {texts.map((t, i) => (
                  <div key={i} className="relative">
                    <textarea rows={4} value={t} onChange={(e) => setTexts(texts.map((x, k) => (k === i ? e.target.value : x)))} placeholder={i === 0 ? 'El texto que va arriba de la imagen' : `Versión ${i + 1}`} className={`${input} w-full`} />
                    {i > 0 && <button onClick={() => setTexts(texts.filter((_, k) => k !== i))} className="absolute top-1.5 right-2 text-[12px] text-mute hover:text-ink">Quitar</button>}
                  </div>
                ))}
                {texts.length < 5 && <button onClick={() => setTexts([...texts, ''])} className="self-start text-[13px] text-mute hover:text-ink">+ Otra versión del texto</button>}
              </div>
              <div className="flex flex-col gap-2">
                <p className="text-[13px] text-mute">Título</p>
                {titles.map((t, i) => (
                  <div key={i} className="flex gap-2">
                    <input value={t} onChange={(e) => setTitles(titles.map((x, k) => (k === i ? e.target.value : x)))} placeholder={i === 0 ? 'Debajo de la imagen' : `Versión ${i + 1}`} className={`${input} flex-1`} />
                    {i > 0 && <button onClick={() => setTitles(titles.filter((_, k) => k !== i))} className="text-[12px] text-mute hover:text-ink">Quitar</button>}
                  </div>
                ))}
                {titles.length < 5 && <button onClick={() => setTitles([...titles, ''])} className="self-start text-[13px] text-mute hover:text-ink">+ Otro título</button>}
                <label className="flex flex-col gap-1 mt-2 text-[13px] text-mute">Link de destino<input value={link} onChange={(e) => setLink(e.target.value)} className={input} /></label>
                <div className="grid grid-cols-2 gap-2">
                  <label className="flex flex-col gap-1 text-[13px] text-mute">Botón<select value={cta} onChange={(e) => setCta(e.target.value)} className={input}>{CTAS.map(([v, l]) => <option key={v} value={v}>{l}</option>)}</select></label>
                  <label className="flex flex-col gap-1 text-[13px] text-mute">Identidad
                    <select value={identity} onChange={(e) => setIdentity(Number(e.target.value))} className={input} disabled={!identities.length}>
                      {identities.length ? identities.map((i, k) => <option key={k} value={k}>{i.instagram_name || i.page_name}</option>) : <option>Buscando…</option>}
                    </select>
                  </label>
                </div>
                <label className="flex items-center gap-2 text-mute"><input type="checkbox" checked={utm} onChange={(e) => setUtm(e.target.checked)} /> UTMs de campaña y anuncio</label>
              </div>
            </div>
          </Step>
        )}
      </div>

      <aside className="xl:sticky xl:top-4 flex flex-col gap-4">
        <div className="rounded-panel border border-line bg-surface p-5">
          <p className="text-[13px] text-mute">Se van a crear</p>
          <p className="num text-[30px] font-semibold text-ink leading-tight">{total} anuncios</p>
          <p className="text-[13px] text-mute">{contentCount} {source === 'archivos' ? 'creativos' : 'anuncios a duplicar'} × {destCount} ad set{destCount === 1 ? '' : 's'}{dest === 'nuevo' ? ' nuevo' : ''}</p>
          {source === 'archivos' && (cleanTexts.length > 1 || cleanTitles.length > 1) && <p className="text-[12.5px] text-mute mt-1">{cleanTexts.length} textos y {cleanTitles.length || 1} títulos por anuncio</p>}
          <p className="text-[12.5px] text-faint mt-2">Todo se crea en pausa. Lo revisás y lo activás cuando quieras.</p>
          <button onClick={run} disabled={running || missing.length > 0 || total === 0} className="mt-4 w-full rounded-lg bg-ink text-bg px-4 py-3 text-[14px] font-semibold disabled:opacity-50">
            {running ? 'Creando…' : `Crear ${total || ''} en pausa`}
          </button>
          {missing.length > 0 && <p className="mt-2 text-[12.5px] text-mute">Falta: {missing.join(', ')}.</p>}
        </div>
        {log.length > 0 && (
          <div className="rounded-panel border border-line bg-surface p-4 text-[13px]">
            <ul className="flex flex-col gap-1">{log.map((l, i) => <li key={i} className={l.ok ? 'text-ink' : 'text-bad'}>{l.text}</li>)}</ul>
            {created.ads.length > 0 && !activated && (
              <button onClick={activateAll} className="mt-3 w-full rounded-lg border border-good/40 bg-good/10 px-3 py-2 font-medium text-ink">
                Activar {created.adset ? 'ad set y ' : ''}{created.ads.length} anuncios
              </button>
            )}
          </div>
        )}
      </aside>
    </div>
  )
}
