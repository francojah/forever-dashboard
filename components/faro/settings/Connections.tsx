'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { Panel, Badge, Empty } from '../ui'
import { ago } from '@/lib/faro/format'

interface Conn { id: string; provider: string; label: string | null; status: string; last_error: string | null; token_expires_at: string | null; source: string | null }
interface Store { id: string; name: string; url: string | null; active: boolean; last_synced_at: string | null; last_sync_error: string | null; backfill_done: boolean }
interface Account { id: string; name: string; external_id: string; active: boolean; last_synced_at: string | null; last_sync_error: string | null; connection_id: string | null }
interface Accessible { id: string; name: string; status: number; currency: string; timezone: string | null; business: string | null; added: boolean }

const ERRORS: Record<string, string> = {
  'meta-app': 'Falta configurar la app de Meta (META_APP_ID y META_APP_SECRET en Vercel). Mientras tanto podés pegar un token.',
  'meta-estado': 'El login de Facebook expiró o se abrió en otra pestaña. Probá de nuevo.',
  'meta-espacio': 'Cambiaste de negocio en medio del login. Probá de nuevo.',
  'tn-app': 'Falta configurar la app de Tiendanube (TIENDANUBE_APP_ID).',
  'solo-lectura': 'Tu rol es de solo lectura.',
}

export default function Connections(p: {
  canEdit: boolean; isOwner: boolean; welcome: boolean; openConnection: string | null; error: string | null; storeAdded: boolean
  metaLogin: boolean; tnInstall: boolean; connections: Conn[]; stores: Store[]; accounts: Account[]; timezone: string
}) {
  const router = useRouter()
  const [token, setToken] = useState('')
  const [tokenMsg, setTokenMsg] = useState<string | null>(null)
  const [picker, setPicker] = useState<string | null>(p.openConnection)
  const [accessible, setAccessible] = useState<Accessible[] | null>(null)
  const [chosen, setChosen] = useState<Set<string>>(new Set())
  const [pickerError, setPickerError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const metaConns = p.connections.filter((c) => c.provider === 'meta')

  useEffect(() => {
    if (!picker) return
    setAccessible(null); setPickerError(null); setChosen(new Set())
    fetch(`/api/v2/meta/accounts?connection=${picker}`).then((r) => r.json()).then((j) => {
      if (j.error) setPickerError(j.error)
      else setAccessible(j.accounts)
    }).catch(() => setPickerError('No se pudo consultar Meta'))
  }, [picker])

  async function addToken(e: React.FormEvent) {
    e.preventDefault()
    setBusy(true); setTokenMsg(null)
    const r = await fetch('/api/v2/meta/connect', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ token }) })
    const j = await r.json().catch(() => ({}))
    setBusy(false)
    if (!r.ok) { setTokenMsg(j.error || 'Token inválido'); return }
    setToken('')
    setPicker(j.connection.id)
    router.refresh()
  }

  async function addAccounts() {
    if (!picker || !accessible) return
    setBusy(true)
    const accounts = accessible.filter((a) => chosen.has(a.id)).map((a) => ({ id: a.id, name: a.name, currency: a.currency, timezone: a.timezone }))
    const r = await fetch('/api/v2/meta/accounts', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ connection_id: picker, accounts }) })
    setBusy(false)
    if (r.ok) { setPicker(null); router.refresh(); fetch('/api/v2/sync', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: '{}' }).then(() => router.refresh()) }
    else setPickerError((await r.json().catch(() => ({}))).error || 'No se pudieron agregar')
  }

  async function patch(body: Record<string, unknown>) {
    await fetch('/api/v2/ad-accounts', { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) })
    router.refresh()
  }
  async function remove(q: string, what: string) {
    if (!window.confirm(`¿Quitar ${what}? Se borran sus datos sincronizados en Faro (no toca nada en Meta ni en Tiendanube).`)) return
    await fetch(`/api/v2/ad-accounts?${q}`, { method: 'DELETE' })
    router.refresh()
  }
  async function removeConn(id: string) {
    if (!window.confirm('¿Quitar esta conexión? Las cuentas que dependen de ella dejan de actualizarse.')) return
    await fetch(`/api/v2/meta/connect?id=${id}`, { method: 'DELETE' })
    router.refresh()
  }

  const errorText = p.error ? (ERRORS[p.error] || decodeURIComponent(p.error)) : null

  return (
    <div className="flex flex-col gap-5">
      {p.welcome && (
        <div className="rounded-panel border border-beacon/50 bg-beacon/10 px-5 py-4">
          <p className="font-semibold text-ink">Empecemos por conectar tus datos</p>
          <p className="text-[13.5px] text-mute mt-1">1. Tu tienda · 2. Tus cuentas de Meta · 3. Costos y comisiones. Con eso Faro calcula tu ganancia real y el costo por compra máximo.</p>
        </div>
      )}
      {errorText && <p className="rounded-lg border border-bad/40 bg-bad/10 px-4 py-2.5 text-[13.5px] text-ink">{errorText}</p>}
      {p.storeAdded && <p className="rounded-lg border border-good/40 bg-good/10 px-4 py-2.5 text-[13.5px] text-ink">Tienda conectada. Faro está importando el historial de órdenes.</p>}

      <Panel title="Tiendas" description="Las órdenes se actualizan solas con cada venta y cada 30 minutos."
        actions={p.canEdit && p.tnInstall ? <a href="/api/v2/tiendanube/install" className="rounded-lg border border-line px-3 py-1.5 text-[13px] font-medium hover:bg-sunken">Conectar Tiendanube</a> : undefined} padded={false}>
        {p.stores.length === 0 ? <div className="px-5"><Empty title="Sin tiendas conectadas" /></div> : (
          <ul className="divide-y divide-line border-t border-line">
            {p.stores.map((s) => (
              <li key={s.id} className="px-5 py-3 flex flex-wrap items-center gap-3 text-[13.5px]">
                <div className="min-w-0 flex-1">
                  <p className="font-medium text-ink">{s.name} {!s.backfill_done && <Badge tone="beacon">importando historial</Badge>}</p>
                  <p className="text-mute text-[12.5px]">{s.url} · actualizada {ago(s.last_synced_at)}{s.last_sync_error && <span className="text-bad"> · {s.last_sync_error}</span>}</p>
                </div>
                {p.canEdit && <label className="flex items-center gap-2 text-mute"><input type="checkbox" checked={s.active} onChange={(e) => patch({ store_id: s.id, active: e.target.checked })} /> Incluir</label>}
                {p.isOwner && <button onClick={() => remove(`store=${s.id}`, s.name)} className="text-mute hover:text-bad text-[12.5px]">Quitar</button>}
              </li>
            ))}
          </ul>
        )}
      </Panel>

      <Panel title="Cuentas publicitarias de Meta" description="Elegí qué cuentas suman en este negocio. Cada negocio puede tener varias." padded={false}>
        {p.accounts.length === 0 ? <div className="px-5"><Empty title="Sin cuentas agregadas" /></div> : (
          <ul className="divide-y divide-line border-t border-line">
            {p.accounts.map((a) => (
              <li key={a.id} className="px-5 py-3 flex flex-wrap items-center gap-3 text-[13.5px]">
                <div className="min-w-0 flex-1">
                  <p className="font-medium text-ink">{a.name} <span className="text-faint font-normal num">{a.external_id}</span></p>
                  <p className="text-mute text-[12.5px]">actualizada {ago(a.last_synced_at)}{a.last_sync_error && <span className="text-bad"> · {a.last_sync_error}</span>}</p>
                </div>
                {p.canEdit && <label className="flex items-center gap-2 text-mute"><input type="checkbox" checked={a.active} onChange={(e) => patch({ id: a.id, active: e.target.checked })} /> Incluir</label>}
                {p.isOwner && <button onClick={() => remove(`id=${a.id}`, a.name)} className="text-mute hover:text-bad text-[12.5px]">Quitar</button>}
              </li>
            ))}
          </ul>
        )}
      </Panel>

      <Panel title="Accesos a Meta" description="Cada acceso puede ver varias cuentas. Con tu usuario de Facebook ves todas las cuentas donde tenés permiso.">
        <ul className="divide-y divide-line mb-4">
          {metaConns.map((c) => (
            <li key={c.id} className="py-2.5 flex flex-wrap items-center gap-3 text-[13.5px]">
              <div className="flex-1 min-w-0">
                <p className="text-ink font-medium">{c.label} <Badge>{c.source === 'oauth' ? 'login de Facebook' : c.source === 'legacy' ? 'token anterior' : 'token'}</Badge></p>
                <p className="text-[12.5px] text-mute">{c.token_expires_at ? `vence ${new Date(c.token_expires_at).toLocaleDateString('es-AR')}` : 'sin vencimiento informado'}{c.last_error && <span className="text-bad"> · {c.last_error}</span>}</p>
              </div>
              {p.canEdit && <button onClick={() => setPicker(c.id)} className="rounded-lg border border-line px-3 py-1.5 text-[13px] font-medium hover:bg-sunken">Elegir cuentas</button>}
              {p.isOwner && <button onClick={() => removeConn(c.id)} className="text-mute hover:text-bad text-[12.5px]">Quitar</button>}
            </li>
          ))}
        </ul>
        {p.canEdit && (
          <div className="flex flex-col gap-3">
            {p.metaLogin ? (
              <a href="/api/v2/meta/oauth/start" className="self-start rounded-lg bg-ink text-surface px-4 py-2 text-[13.5px] font-semibold">Conectar con Facebook</a>
            ) : (
              <p className="text-[13px] text-mute">El login con Facebook se activa cargando <code>META_APP_ID</code> y <code>META_APP_SECRET</code> en Vercel. Mientras tanto, pegá un token de acceso.</p>
            )}
            <form onSubmit={addToken} className="flex flex-wrap gap-2 items-center">
              <input value={token} onChange={(e) => setToken(e.target.value)} placeholder="Pegar token de acceso (usuario del sistema o de Facebook)" className="flex-1 min-w-[260px] rounded-lg border border-line bg-surface px-3 py-2 text-[13.5px]" />
              <button disabled={busy || token.length < 20} className="rounded-lg border border-line px-3 py-2 text-[13.5px] font-medium hover:bg-sunken disabled:opacity-50">Validar y agregar</button>
            </form>
            {tokenMsg && <p className="text-bad text-[13px]">{tokenMsg}</p>}
          </div>
        )}
      </Panel>

      {picker && (
        <div className="fixed inset-0 z-40 bg-ink/40 grid place-items-center p-4" role="dialog" aria-modal="true" onClick={() => setPicker(null)}>
          <div className="w-full max-w-lg max-h-[80vh] flex flex-col rounded-panel border border-line bg-surface" onClick={(e) => e.stopPropagation()}>
            <div className="px-5 pt-4 pb-2">
              <h3 className="text-[16px] font-semibold">Elegí las cuentas de este negocio</h3>
              <p className="text-[13px] text-mute">Las cuentas de otros negocios conviene agregarlas en su propio espacio (menú Negocio → Agregar otro negocio).</p>
            </div>
            <div className="flex-1 overflow-y-auto px-5">
              {pickerError && <p className="text-bad text-[13.5px] py-3">{pickerError}</p>}
              {!accessible && !pickerError && <p className="text-mute text-[13.5px] py-6">Consultando Meta…</p>}
              {accessible && accessible.length === 0 && <p className="text-mute text-[13.5px] py-6">Este acceso no ve ninguna cuenta publicitaria.</p>}
              <ul className="divide-y divide-line">
                {accessible?.map((a) => (
                  <li key={a.id}>
                    <label className={`flex items-center gap-3 py-2.5 text-[13.5px] ${a.added ? 'opacity-60' : ''}`}>
                      <input type="checkbox" disabled={a.added} checked={a.added || chosen.has(a.id)} onChange={(e) => { const s = new Set(chosen); if (e.target.checked) s.add(a.id); else s.delete(a.id); setChosen(s) }} />
                      <span className="flex-1 min-w-0">
                        <span className="block text-ink truncate">{a.name}</span>
                        <span className="block text-[12px] text-mute">{a.business || 'Sin Business'} · {a.currency} · <span className="num">{a.id}</span></span>
                      </span>
                      {a.added ? <Badge>ya agregada</Badge> : a.status !== 1 ? <Badge tone="warn">{a.status === 2 ? 'desactivada' : 'con problemas'}</Badge> : null}
                    </label>
                  </li>
                ))}
              </ul>
            </div>
            <div className="px-5 py-3 border-t border-line flex justify-end gap-2">
              <button onClick={() => setPicker(null)} className="rounded-lg px-3 py-2 text-[13.5px] text-mute hover:text-ink">Cancelar</button>
              <button onClick={addAccounts} disabled={busy || chosen.size === 0} className="rounded-lg bg-ink text-surface px-4 py-2 text-[13.5px] font-semibold disabled:opacity-50">Agregar {chosen.size || ''}</button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
