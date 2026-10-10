'use client'

import { useEffect, useMemo, useRef, useState } from 'react'
import { createClientBrowser } from '@/lib/supabase'
import { Panel, Badge } from '../ui'

interface AdsetOpt { accountId: string; id: string; name: string; status: string; goal: string | null; campaignId: string; campaign: string }
interface Identity { page_id: string; instagram_user_id: string | null; page_name: string; instagram_name: string | null }
interface Item {
  key: string
  file: File
  preview: string
  type: 'image' | 'video'
  name: string
  state: 'listo' | 'subiendo' | 'procesando' | 'creado' | 'error'
  error?: string
  adId?: string
  activated?: boolean
  ratio?: string
  ratioWarn?: string
  message?: string
  headline?: string
  open?: boolean
}

/** Proporción del archivo y si sirve para los formatos de Meta (1:1, 4:5, 9:16). */
function measure(file: File, type: 'image' | 'video', url: string): Promise<{ ratio?: string; ratioWarn?: string }> {
  return new Promise((resolve) => {
    const done = (w: number, h: number) => {
      if (!w || !h) return resolve({})
      const r = w / h
      const known: [string, number][] = [['1:1', 1], ['4:5', 0.8], ['9:16', 0.5625], ['16:9', 1.778]]
      const near = known.find(([, v]) => Math.abs(r - v) < 0.03)
      const label = near ? near[0] : `${w}×${h}`
      const warn = !near ? 'Proporción poco común: Meta lo recorta' : near[0] === '16:9' ? 'Horizontal: rinde peor en Reels e Historias' : (Math.min(w, h) < 600 ? 'Resolución baja' : undefined)
      resolve({ ratio: label, ratioWarn: warn })
    }
    if (type === 'image') { const i = new Image(); i.onload = () => done(i.naturalWidth, i.naturalHeight); i.onerror = () => resolve({}); i.src = url }
    else { const v = document.createElement('video'); v.preload = 'metadata'; v.onloadedmetadata = () => done(v.videoWidth, v.videoHeight); v.onerror = () => resolve({}); v.src = url }
    void file
  })
}

const CTAS = [
  ['SHOP_NOW', 'Comprar'], ['LEARN_MORE', 'Más información'], ['BUY_NOW', 'Comprar ahora'], ['ORDER_NOW', 'Pedir ahora'],
  ['GET_OFFER', 'Obtener oferta'], ['SEND_MESSAGE', 'Enviar mensaje'], ['SIGN_UP', 'Registrarte'],
]
const UTM = 'utm_source=facebook&utm_medium=paid&utm_campaign={{campaign.name}}&utm_content={{ad.name}}'
const TRAFFIC = new Set(['LINK_CLICKS', 'LANDING_PAGE_VIEWS', 'REACH', 'IMPRESSIONS', 'PROFILE_VISIT', 'VISIT_INSTAGRAM_PROFILE'])

function baseName(f: string) {
  return f.replace(/\.[^.]+$/, '').replace(/[_-]+/g, ' ').trim().toUpperCase().slice(0, 60)
}
const today = () => { const d = new Date(); return `${d.getDate()}/${d.getMonth() + 1}` }

export default function CreativeUploader({ canEdit, accounts, adsets, defaultLink, templates = [] }: { canEdit: boolean; accounts: { id: string; name: string; protected_ids: string[] }[]; adsets: AdsetOpt[]; defaultLink: string; templates?: { accountId: string; name: string; body: string; title: string }[] }) {
  const [account, setAccount] = useState(accounts[0]?.id || '')
  const [adset, setAdset] = useState('')
  const [identities, setIdentities] = useState<Identity[]>([])
  const [identity, setIdentity] = useState(0)
  const [items, setItems] = useState<Item[]>([])
  const [message, setMessage] = useState('')
  const [headline, setHeadline] = useState('')
  const [link, setLink] = useState(defaultLink)
  const [cta, setCta] = useState('SHOP_NOW')
  const [utm, setUtm] = useState(true)
  const [running, setRunning] = useState(false)
  const [drag, setDrag] = useState(false)
  const input = useRef<HTMLInputElement>(null)

  const options = useMemo(() => adsets
    .filter((s) => s.accountId === account)
    .sort((a, b) => Number(TRAFFIC.has(a.goal || '')) - Number(TRAFFIC.has(b.goal || '')) || Number(b.status === 'ACTIVE') - Number(a.status === 'ACTIVE') || a.campaign.localeCompare(b.campaign)), [adsets, account])
  const chosen = options.find((s) => s.id === adset)
  const acc = accounts.find((a) => a.id === account)
  const isProtected = !!chosen && !!acc && (acc.protected_ids.includes(chosen.id) || acc.protected_ids.includes(chosen.campaignId))

  useEffect(() => {
    if (!account) return
    setIdentities([])
    fetch(`/api/v2/meta/identities?account=${account}`).then((r) => r.json()).then((j) => { setIdentities(j.identities || []); setIdentity(0) }).catch(() => {})
  }, [account])

  function addFiles(list: FileList | null) {
    if (!list) return
    const add: Item[] = []
    Array.from(list).slice(0, 30).forEach((f) => {
      const type = f.type.startsWith('video') ? 'video' : f.type.startsWith('image') ? 'image' : null
      if (!type) return
      add.push({ key: `${f.name}-${f.size}-${Math.random()}`, file: f, preview: URL.createObjectURL(f), type, name: `${type === 'video' ? 'VID' : 'IMG'} - ${baseName(f.name)} - ${today()}`, state: 'listo' })
    })
    setItems((cur) => [...cur, ...add].slice(0, 30))
    add.forEach((it) => measure(it.file, it.type, it.preview).then((r) => update(it.key, r)))
  }

  const update = (key: string, patch: Partial<Item>) => setItems((cur) => cur.map((i) => (i.key === key ? { ...i, ...patch } : i)))

  async function publishOne(it: Item) {
    const id = identities[identity]
    update(it.key, { state: 'subiendo', error: undefined })
    try {
      const u = await fetch('/api/v2/meta/upload-url', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ filename: it.file.name, size: it.file.size }) }).then((r) => r.json())
      if (!u.token) throw new Error(u.error || 'No se pudo preparar la subida')
      const up = await createClientBrowser().storage.from('faro-creatives').uploadToSignedUrl(u.path, u.token, it.file, { contentType: it.file.type })
      if (up.error) throw new Error(up.error.message)
      update(it.key, { state: 'procesando' })
      let videoId: string | undefined
      for (let attempt = 0; attempt < 8; attempt++) {
        const r = await fetch('/api/v2/meta/publish', {
          method: 'POST', headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            accountId: account, adsetId: adset, path: u.path, type: it.type, name: it.name,
            message: it.message?.trim() || message, headline: it.headline?.trim() || headline, link, cta,
            urlTags: utm ? UTM : undefined, pageId: id?.page_id, igUserId: id?.instagram_user_id, videoId,
          }),
        }).then((x) => x.json())
        if (r.ok) { update(it.key, { state: 'creado', adId: r.adId }); return }
        if (r.pending) { videoId = r.videoId; continue }
        throw new Error(r.error || 'Meta rechazó el anuncio')
      }
      throw new Error('Meta sigue procesando el video: probá de nuevo en unos minutos')
    } catch (e) {
      update(it.key, { state: 'error', error: e instanceof Error ? e.message : 'Error' })
    }
  }

  async function publishAll() {
    setRunning(true)
    // De a dos a la vez: más rápido sin saturar el límite de Meta
    const queue = items.filter((i) => i.state === 'listo' || i.state === 'error')
    const worker = async () => { for (let it = queue.shift(); it; it = queue.shift()) await publishOne(it) }
    await Promise.all([worker(), worker()])
    setRunning(false)
  }

  async function activate(ids: string[]) {
    const r = await fetch('/api/v2/meta/mutate', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ changes: ids.map((id) => ({ accountId: account, level: 'ad', id, field: 'status', value: 'ACTIVE', confirmProtected: true })) }),
    }).then((x) => x.json())
    const okIds = new Set((r.results || []).filter((x: { ok: boolean }) => x.ok).map((x: { id: string }) => x.id))
    setItems((cur) => cur.map((i) => (i.adId && okIds.has(i.adId) ? { ...i, activated: true } : i)))
  }

  if (!canEdit) return <Panel><p className="text-mute">Tu rol es de solo lectura.</p></Panel>
  const ready = items.filter((i) => i.state === 'listo' || i.state === 'error').length
  const created = items.filter((i) => i.state === 'creado' && !i.activated && i.adId)
  const missing = [!adset && 'elegí un ad set', !identities.length && 'la cuenta no tiene página detectada', !link && 'falta el link', !message.trim() && !items.every((i) => i.message?.trim()) && 'falta el texto principal', !items.length && 'agregá archivos'].filter(Boolean)

  return (
    <div className="grid lg:grid-cols-[1fr_380px] gap-5">
      <div className="flex flex-col gap-5">
        <Panel title="Archivos" description="Imágenes o videos, hasta 30 por tanda. Cada archivo crea un anuncio.">
          <div
            onDragOver={(e) => { e.preventDefault(); setDrag(true) }}
            onDragLeave={() => setDrag(false)}
            onDrop={(e) => { e.preventDefault(); setDrag(false); addFiles(e.dataTransfer.files) }}
            onClick={() => input.current?.click()}
            className={`cursor-pointer rounded-lg border-2 border-dashed ${drag ? 'border-beacon bg-beacon/10' : 'border-line'} px-4 py-8 text-center text-[14px] text-mute`}
          >
            Arrastrá los archivos acá o <span className="text-ink underline">elegilos</span>
            <input ref={input} type="file" multiple accept="image/*,video/*" className="hidden" onChange={(e) => { addFiles(e.target.files); e.target.value = '' }} />
          </div>
          {items.length > 0 && (
            <ul className="mt-4 divide-y divide-line">
              {items.map((it) => (
                <li key={it.key} className="py-2.5 flex items-center gap-3">
                  {it.type === 'image'
                    // eslint-disable-next-line @next/next/no-img-element
                    ? <img src={it.preview} alt="" className="w-14 h-14 rounded object-cover border border-line" />
                    : <video src={it.preview} className="w-14 h-14 rounded object-cover border border-line" muted />}
                  <div className="flex-1 min-w-0">
                    <input value={it.name} disabled={it.state !== 'listo' && it.state !== 'error'} onChange={(e) => update(it.key, { name: e.target.value })} className="w-full rounded border border-transparent hover:border-line focus:border-line bg-transparent px-1.5 py-1 text-[13.5px] text-ink" aria-label="Nombre del anuncio" />
                    <p className="px-1.5 text-[12px] text-mute">
                      {it.type === 'video' ? 'Video' : 'Imagen'} · {(it.file.size / 1024 / 1024).toLocaleString('es-AR', { maximumFractionDigits: 1 })} MB
                      {it.ratio && <> · {it.ratio}</>}{it.ratioWarn && <span className="text-warn"> · {it.ratioWarn}</span>}
                      {(it.state === 'listo' || it.state === 'error') && <> · <button type="button" onClick={() => update(it.key, { open: !it.open })} className="underline hover:text-ink">{it.message || it.headline ? 'texto propio' : 'texto propio (opcional)'}</button></>}
                      {it.error && <span className="text-bad"> · {it.error}</span>}
                    </p>
                    {it.open && (
                      <div className="mt-1.5 px-1.5 flex flex-col gap-1.5">
                        <textarea rows={3} value={it.message || ''} onChange={(e) => update(it.key, { message: e.target.value })} placeholder="Texto principal solo para este anuncio (si lo dejás vacío usa el general)" className="rounded border border-line bg-surface px-2 py-1 text-[13px]" />
                        <input value={it.headline || ''} onChange={(e) => update(it.key, { headline: e.target.value })} placeholder="Título solo para este anuncio" className="rounded border border-line bg-surface px-2 py-1 text-[13px]" />
                      </div>
                    )}
                  </div>
                  <div className="shrink-0">
                    {it.state === 'listo' && <button onClick={() => setItems((c) => c.filter((x) => x.key !== it.key))} className="text-[12.5px] text-mute hover:text-ink">Quitar</button>}
                    {it.state === 'subiendo' && <Badge>subiendo</Badge>}
                    {it.state === 'procesando' && <Badge tone="beacon">Meta lo procesa</Badge>}
                    {it.state === 'creado' && <Badge tone="good">{it.activated ? 'activo' : 'creado en pausa'}</Badge>}
                    {it.state === 'error' && <Badge tone="bad">error</Badge>}
                  </div>
                </li>
              ))}
            </ul>
          )}
        </Panel>
        {created.length > 0 && (
          <div className="rounded-panel border border-good/40 bg-good/10 px-5 py-3 text-[13.5px] flex flex-wrap items-center gap-3">
            <span className="text-ink">{created.length} anuncios creados en pausa. Revisalos en Ads Manager o activalos desde acá.</span>
            <button onClick={() => activate(created.map((c) => c.adId!))} className="ml-auto rounded-lg bg-ink text-surface px-3 py-1.5 font-medium">Activar {created.length}</button>
          </div>
        )}
      </div>

      <div className="flex flex-col gap-5">
        <Panel title="Destino">
          <div className="flex flex-col gap-3 text-[13.5px]">
            {accounts.length > 1 && (
              <label className="flex flex-col gap-1">Cuenta
                <select value={account} onChange={(e) => { setAccount(e.target.value); setAdset('') }} className="rounded-lg border border-line bg-surface px-3 py-2">
                  {accounts.map((a) => <option key={a.id} value={a.id}>{a.name}</option>)}
                </select>
              </label>
            )}
            <label className="flex flex-col gap-1">Ad set
              <select value={adset} onChange={(e) => setAdset(e.target.value)} className="rounded-lg border border-line bg-surface px-3 py-2">
                <option value="">Elegí dónde van</option>
                {options.map((s) => <option key={s.id} value={s.id}>{s.campaign} › {s.name}{s.status !== 'ACTIVE' ? ' (pausado)' : ''}</option>)}
              </select>
            </label>
            {isProtected && <p className="text-warn text-[12.5px]">Este ad set está protegido. Sumar anuncios puede reiniciar su aprendizaje: conviene un ad set de testeo aislado.</p>}
            {chosen && !isProtected && chosen.status === 'ACTIVE' && <p className="text-mute text-[12.5px]">Sumar anuncios a un ad set activo puede reiniciar su aprendizaje.</p>}
            <label className="flex flex-col gap-1">Identidad
              <select value={identity} onChange={(e) => setIdentity(Number(e.target.value))} className="rounded-lg border border-line bg-surface px-3 py-2" disabled={!identities.length}>
                {identities.length ? identities.map((i, k) => <option key={k} value={k}>{i.page_name}{i.instagram_name ? ` + ${i.instagram_name}` : ''}</option>) : <option>Buscando página e Instagram…</option>}
              </select>
            </label>
          </div>
        </Panel>
        <Panel title="Texto">
          <div className="flex flex-col gap-3 text-[13.5px]">
            {templates.some((t) => t.accountId === account) && (
              <label className="flex flex-col gap-1">Copiar texto de un anuncio activo
                <select value="" onChange={(e) => { const t = templates.filter((x) => x.accountId === account)[Number(e.target.value)]; if (t) { setMessage(t.body); setHeadline(t.title) } }} className="rounded-lg border border-line bg-surface px-3 py-2">
                  <option value="">Elegí un anuncio…</option>
                  {templates.filter((t) => t.accountId === account).map((t, i) => <option key={i} value={i}>{t.name}</option>)}
                </select>
              </label>
            )}
            <label className="flex flex-col gap-1">Texto principal<textarea rows={5} value={message} onChange={(e) => setMessage(e.target.value)} className="rounded-lg border border-line bg-surface px-3 py-2" /></label>
            <label className="flex flex-col gap-1">Título<input value={headline} onChange={(e) => setHeadline(e.target.value)} className="rounded-lg border border-line bg-surface px-3 py-2" /></label>
            <label className="flex flex-col gap-1">Link de destino<input value={link} onChange={(e) => setLink(e.target.value)} className="rounded-lg border border-line bg-surface px-3 py-2" /></label>
            <label className="flex flex-col gap-1">Botón
              <select value={cta} onChange={(e) => setCta(e.target.value)} className="rounded-lg border border-line bg-surface px-3 py-2">
                {CTAS.map(([v, l]) => <option key={v} value={v}>{l}</option>)}
              </select>
            </label>
            <label className="flex items-center gap-2 text-mute"><input type="checkbox" checked={utm} onChange={(e) => setUtm(e.target.checked)} /> Agregar UTMs (campaña y anuncio)</label>
          </div>
        </Panel>
        <button
          onClick={publishAll}
          disabled={running || missing.length > 0 || ready === 0}
          className="rounded-lg bg-ink text-surface px-4 py-3 text-[14px] font-semibold disabled:opacity-50"
        >
          {running ? 'Creando anuncios' : `Crear ${ready || ''} anuncios en pausa`}
        </button>
        {missing.length > 0 && <p className="text-[12.5px] text-mute -mt-3">Para crear: {missing.join(', ')}.</p>}
      </div>
    </div>
  )
}
