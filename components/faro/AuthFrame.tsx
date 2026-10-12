import Link from 'next/link'
import { FaroMark } from './Shell'

const NIGHT = '#0c1522'
export const BEAM = '#e8a33d'

/** Marco de login, registro y recuperación: panel de marca a la izquierda, formulario a la derecha. */
export default function AuthFrame({ title, subtitle, children, footer }: { title: string; subtitle?: React.ReactNode; children: React.ReactNode; footer?: React.ReactNode }) {
  return (
    <div className="faro font-faro min-h-screen flex bg-bg text-ink">
      <aside className="hidden lg:flex lg:w-[46%] relative overflow-hidden flex-col justify-between p-12 text-white" style={{ background: NIGHT }}>
        <div aria-hidden className="pointer-events-none absolute inset-0" style={{ background: `radial-gradient(ellipse 80% 50% at 10% 0%, ${BEAM}38, transparent 70%)` }} />
        <Link href="/" className="relative flex items-center gap-2 font-semibold text-[17px] w-fit"><FaroMark className="w-7 h-7" />Faro</Link>
        <div className="relative max-w-[440px]">
          <p className="text-[34px] leading-[1.1] font-semibold tracking-tight">Sabé cuánto ganás de verdad con cada peso en Meta.</p>
          <ul className="mt-7 flex flex-col gap-3 text-[15px] text-white/75">
            {['Ganancia real con tus costos, comisiones e impuestos', 'Ventas de Tiendanube cruzadas con cada anuncio', 'Cambios en Meta solo con tu aprobación'].map((t) => (
              <li key={t} className="flex gap-2.5">
                <svg viewBox="0 0 20 20" className="w-4 h-4 mt-1 shrink-0" aria-hidden><path d="M4 10.5 8 14.5 16 6" fill="none" stroke={BEAM} strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" /></svg>{t}
              </li>
            ))}
          </ul>
        </div>
        <p className="relative text-[13px] text-white/45">Acceso anticipado gratis · <Link href="/demo" className="underline hover:text-white">Ver la demo</Link></p>
      </aside>

      <main className="flex-1 flex items-center justify-center px-5 py-10">
        <div className="w-full max-w-[380px]">
          <Link href="/" className="lg:hidden flex items-center justify-center gap-2 mb-8 font-semibold text-[17px]"><FaroMark className="w-7 h-7" />Faro</Link>
          <h1 className="text-[26px] font-semibold tracking-tight">{title}</h1>
          {subtitle && <p className="text-[14.5px] text-mute mt-1.5">{subtitle}</p>}
          <div className="mt-7">{children}</div>
          {footer && <div className="mt-6 text-center text-[14px] text-mute">{footer}</div>}
        </div>
      </main>
    </div>
  )
}

export function Field({ label, aside, ...props }: React.InputHTMLAttributes<HTMLInputElement> & { label: string; aside?: React.ReactNode }) {
  return (
    <label className="flex flex-col gap-1.5 text-[13.5px]">
      <span className="flex items-center justify-between font-medium text-ink">{label}{aside}</span>
      <input {...props} className="w-full rounded-lg border border-line bg-surface px-3.5 py-2.5 text-[15px] text-ink placeholder:text-faint focus:border-beacon focus:outline-none" />
    </label>
  )
}

export function Submit({ busy, children, busyText }: { busy: boolean; children: React.ReactNode; busyText: string }) {
  return (
    <button type="submit" disabled={busy} className="w-full rounded-lg py-3 text-[15px] font-semibold text-[#1a1206] disabled:opacity-60" style={{ background: BEAM }}>
      {busy ? busyText : children}
    </button>
  )
}

export function Notice({ tone, children }: { tone: 'bad' | 'good'; children: React.ReactNode }) {
  return <p role={tone === 'bad' ? 'alert' : 'status'} className={`rounded-lg px-3.5 py-2.5 text-[13.5px] ${tone === 'bad' ? 'bg-bad/10 text-bad' : 'bg-good/10 text-good'}`}>{children}</p>
}

/** Ingreso con Google: se muestra solo si el proveedor está activado en Supabase (NEXT_PUBLIC_GOOGLE_AUTH=1). */
export const googleEnabled = process.env.NEXT_PUBLIC_GOOGLE_AUTH === '1'

export function GoogleButton({ onClick, busy, label }: { onClick: () => void; busy: boolean; label: string }) {
  return (
    <>
      <button type="button" onClick={onClick} disabled={busy} className="w-full flex items-center justify-center gap-2.5 rounded-lg border border-line bg-surface py-2.5 text-[15px] font-medium text-ink hover:bg-sunken disabled:opacity-60">
        <svg viewBox="0 0 24 24" className="w-[18px] h-[18px]" aria-hidden>
          <path fill="#EA4335" d="M12 10.2v3.9h5.5c-.2 1.3-1.6 3.8-5.5 3.8-3.3 0-6-2.7-6-6.1s2.7-6.1 6-6.1c1.9 0 3.1.8 3.8 1.5l2.6-2.5C16.8 3.2 14.6 2.2 12 2.2 6.6 2.2 2.3 6.6 2.3 12s4.3 9.8 9.7 9.8c5.6 0 9.3-3.9 9.3-9.5 0-.6-.1-1.1-.2-1.6H12z" />
        </svg>
        {label}
      </button>
      <div className="my-5 flex items-center gap-3 text-[12.5px] text-faint"><span className="h-px flex-1 bg-line" />o con tu email<span className="h-px flex-1 bg-line" /></div>
    </>
  )
}
