'use client'

import { useState } from 'react'
import { ENHANCEMENTS, MUSIC, EnhancementPrefs, defaultPrefs } from '@/lib/faro/enhancements'
import { Panel } from '../ui'

function Toggle({ on, onChange, disabled, label }: { on: boolean; onChange: (v: boolean) => void; disabled?: boolean; label: string }) {
  return (
    <button type="button" role="switch" aria-checked={on} aria-label={label} disabled={disabled} onClick={() => onChange(!on)}
      className={`relative w-9 h-5 rounded-full shrink-0 transition-colors ${on ? 'bg-good' : 'bg-line'} disabled:opacity-50`}>
      <span className={`absolute top-[2px] w-4 h-4 rounded-full bg-surface shadow transition-all ${on ? 'left-[18px]' : 'left-[2px]'}`} />
    </button>
  )
}

const TAG: Record<string, string> = { image: 'imágenes', video: 'videos', all: 'imágenes y videos', catalog: 'catálogo' }

export default function MetaEnhancements({ initial, canEdit }: { initial: EnhancementPrefs; canEdit: boolean }) {
  const [prefs, setPrefs] = useState(initial)
  const [saved, setSaved] = useState<string | null>(null)
  const rec = defaultPrefs()
  const isRec = JSON.stringify(prefs) === JSON.stringify(rec)

  async function save(next: EnhancementPrefs) {
    setPrefs(next); setSaved('Guardando…')
    const r = await fetch('/api/v2/settings', { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ meta_enhancements: next }) }).then((x) => x.json()).catch(() => ({}))
    setSaved(r.ok ? 'Guardado' : `No se pudo guardar: ${r.error || 'error'}`)
  }
  const set = (key: string, v: boolean) => save({ ...prefs, features: { ...prefs.features, [key]: v } })

  const Row = ({ k, label, what, why, applies, on, recommended, onChange }: { k: string; label: string; what: string; why: string; applies?: string; on: boolean; recommended: boolean; onChange: (v: boolean) => void }) => (
    <li className="flex gap-4 py-3">
      <div className="pt-0.5"><Toggle on={on} onChange={onChange} disabled={!canEdit} label={label} /></div>
      <div className="min-w-0 flex-1">
        <p className="text-[14px] text-ink font-medium">{label} {applies && <span className="text-[12px] font-normal text-faint">· {TAG[applies]}</span>}{on !== recommended && <span className="ml-2 text-[12px] font-normal text-warn">distinto a lo recomendado</span>}</p>
        <p className="text-[13px] text-ink mt-0.5">{what}</p>
        <p className="text-[12.5px] text-mute mt-0.5">{why}</p>
      </div>
      <span className="sr-only">{k}</span>
    </li>
  )

  const onList = ENHANCEMENTS.filter((e) => e.on)
  const offList = ENHANCEMENTS.filter((e) => !e.on)
  return (
    <div className="flex flex-col gap-5 max-w-3xl">
      <div className="rounded-panel border border-line bg-surface px-5 py-4 text-[13.5px] flex flex-wrap items-center gap-3">
        <p className="flex-1 min-w-[240px] text-ink">Faro manda esta configuración en cada anuncio que crea, así no tenés que apagar nada a mano en Meta. Los anuncios duplicados conservan la del original.</p>
        {saved && <span className="text-mute">{saved}</span>}
        {canEdit && !isRec && <button onClick={() => save(rec)} className="rounded-lg border border-line px-3 py-1.5 hover:bg-sunken">Volver a lo recomendado</button>}
      </div>
      <Panel title="Prendidas" description="Adaptan el creativo a cada ubicación sin cambiar el mensaje: más lugares donde mostrarse, más entrega.">
        <ul className="divide-y divide-line -my-3">
          {onList.map((e) => <Row key={e.key} k={e.key} label={e.label} what={e.what} why={e.why} applies={e.applies} on={prefs.features[e.key]} recommended={e.on} onChange={(v) => set(e.key, v)} />)}
        </ul>
      </Panel>
      <Panel title="Apagadas" description="Reescriben, superponen o generan contenido que no revisaste. Los especialistas las apagan cuando el creativo es propio.">
        <ul className="divide-y divide-line -my-3">
          {offList.map((e) => <Row key={e.key} k={e.key} label={e.label} what={e.what} why={e.why} applies={e.applies} on={prefs.features[e.key]} recommended={e.on} onChange={(v) => set(e.key, v)} />)}
          <Row k={MUSIC.key} label={MUSIC.label} what={MUSIC.what} why={MUSIC.why} on={prefs.music} recommended={MUSIC.on} onChange={(v) => save({ ...prefs, music: v })} />
        </ul>
      </Panel>
      <p className="text-[12px] text-faint">Los enlaces del sitio no se pueden controlar por API: si Meta los activa, se apagan desde Ads Manager.</p>
    </div>
  )
}
