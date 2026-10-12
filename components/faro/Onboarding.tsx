import Link from 'next/link'
import type { FaroContext } from '@/lib/faro/context'

export interface Step { key: string; title: string; detail: string; href: string; cta: string; done: boolean }

/** Pasos para que un negocio nuevo llegue a su primer número real. */
export function onboardingSteps(ctx: FaroContext, opts: { cogsKnownShare?: number | null } = {}): Step[] {
  const store = ctx.stores.find((s) => s.active)
  const ads = ctx.adAccounts.find((a) => a.active)
  const s = ctx.workspace.settings
  const costsOk = opts.cogsKnownShare == null ? false : opts.cogsKnownShare >= 0.8
  return [
    { key: 'tn', title: 'Conectá tu tienda de Tiendanube', detail: 'Faro trae tus pedidos y productos. El historial tarda unos minutos.', href: '/ajustes?tab=conexiones', cta: 'Conectar', done: !!store },
    { key: 'meta', title: 'Conectá tu cuenta de Meta Ads', detail: 'Para ver campañas, gasto y costo por compra, y cargar anuncios.', href: '/ajustes?tab=conexiones', cta: 'Conectar', done: !!ads },
    { key: 'fees', title: 'Confirmá comisiones e impuestos', detail: 'Comisión de cada medio de pago, IIBB e impuestos de la pauta según tu régimen.', href: '/ajustes?tab=costos', cta: 'Completar', done: s.configured && s.payment_fees.length > 0 },
    { key: 'costs', title: 'Cargá el costo de tus productos', detail: 'Con el costo real, la ganancia deja de ser un estimado. Podés usar el costo de Tiendanube.', href: '/ajustes?tab=productos', cta: 'Cargar costos', done: costsOk },
  ]
}

export default function Onboarding({ steps, compact = false }: { steps: Step[]; compact?: boolean }) {
  const done = steps.filter((s) => s.done).length
  if (done === steps.length) return null
  const next = steps.find((s) => !s.done)!
  return (
    <section className="rounded-panel border border-beacon/40 bg-surface overflow-hidden" aria-label="Primeros pasos">
      <div className="px-5 pt-4 pb-3 flex flex-wrap items-center gap-x-4 gap-y-2">
        <div className="min-w-0">
          <p className="text-[15px] font-semibold text-ink">{compact ? 'Terminá de configurar Faro' : 'Primeros pasos'}</p>
          <p className="text-[13px] text-mute">{done} de {steps.length} listos. Cuando termines, cada número de Faro es real.</p>
        </div>
        <div className="ml-auto h-2 w-40 rounded-full bg-sunken overflow-hidden" role="progressbar" aria-valuemin={0} aria-valuemax={steps.length} aria-valuenow={done}>
          <div className="h-full rounded-full bg-beacon" style={{ width: `${(done / steps.length) * 100}%` }} />
        </div>
      </div>
      <ol className="divide-y divide-line border-t border-line">
        {steps.map((s, i) => (
          <li key={s.key} className={`px-5 py-3 flex items-center gap-3 ${s === next ? 'bg-beacon/5' : ''}`}>
            <span className={`w-6 h-6 shrink-0 rounded-full grid place-items-center text-[12px] font-semibold ${s.done ? 'bg-good text-white' : s === next ? 'bg-beacon text-[#1a1206]' : 'bg-sunken text-mute'}`}>
              {s.done ? <svg viewBox="0 0 20 20" className="w-3.5 h-3.5" aria-hidden><path d="M4 10.5 8 14.5 16 6" fill="none" stroke="currentColor" strokeWidth="2.6" strokeLinecap="round" strokeLinejoin="round" /></svg> : i + 1}
            </span>
            <div className="min-w-0 flex-1">
              <p className={`text-[14px] ${s.done ? 'text-mute line-through' : 'text-ink font-medium'}`}>{s.title}</p>
              {!s.done && !compact && <p className="text-[12.5px] text-mute">{s.detail}</p>}
            </div>
            {!s.done && <Link href={s.href} className={`shrink-0 rounded-md px-3 py-1.5 text-[13px] font-medium ${s === next ? 'bg-ink text-bg' : 'border border-line text-ink hover:bg-sunken'}`}>{s.cta}</Link>}
          </li>
        ))}
      </ol>
    </section>
  )
}
