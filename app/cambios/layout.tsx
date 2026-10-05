import type { Metadata, Viewport } from 'next'

const STORE_URL = (process.env.CAMBIOS_STORE_URL || 'https://www.foreverbasics.com.ar').replace(/\/$/, '')
const FONTS_HREF =
  'https://fonts.googleapis.com/css2?family=Montserrat:wght@500;600;700;800&family=Open+Sans:wght@400;500;600&display=swap'

export const metadata: Metadata = {
  title: 'Cambios — Forever Basics',
  description: 'Cambiá talle, color o producto de tu compra en Forever Basics.',
  robots: { index: false, follow: false },
}

export const viewport: Viewport = { themeColor: '#000000' }

export default function CambiosLayout({ children }: { children: React.ReactNode }) {
  return (
    <div
      className={`fb min-h-screen bg-[#F4F4F3] text-black antialiased`}
      style={{ colorScheme: 'light', fontFamily: 'var(--fb-text), system-ui, sans-serif' }}
    >
      {/* El dashboard arranca en modo oscuro; el portal de cambios siempre es claro */}
      <script dangerouslySetInnerHTML={{ __html: "document.documentElement.classList.remove('dark')" }} />
      <link rel="preconnect" href="https://fonts.googleapis.com" />
      <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="" />
      <link rel="stylesheet" href={FONTS_HREF} />
      <style>{`
        .fb{--fb-display:'Montserrat';--fb-text:'Open Sans'}
        .fb .font-display{font-family:var(--fb-display),system-ui,sans-serif}
        .fb :focus-visible{outline:2px solid #B8892B;outline-offset:2px}
        @media (prefers-reduced-motion: reduce){.fb *{transition:none!important;animation:none!important}}
      `}</style>
      <header className="bg-black text-white">
        <div className="mx-auto max-w-xl px-4 h-14 grid grid-cols-[1fr_auto_1fr] items-center">
          <a href={STORE_URL} className="justify-self-start text-[12.5px] text-neutral-300 flex items-center gap-1.5 py-2">
            <svg viewBox="0 0 24 24" className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden><path d="M15 18l-6-6 6-6" /></svg>
            Tienda
          </a>
          <a href="/" className="text-center leading-none" aria-label="Forever Basics — Cambios">
            <span className="font-display block text-[15px] font-semibold tracking-[0.42em] pl-[0.42em]">FOREVER</span>
            <span className="block text-[9px] tracking-[0.5em] pl-[0.5em] text-[#D4A94A] mt-0.5">basics</span>
          </a>
          <span />
        </div>
      </header>
      {children}
      <footer className="mx-auto max-w-xl px-4 pb-10 pt-2 text-center text-xs text-neutral-500">
        <a href={STORE_URL} className="font-semibold text-[#8B6914]">Volver a foreverbasics.com.ar</a>
      </footer>
    </div>
  )
}
