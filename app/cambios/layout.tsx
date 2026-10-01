import type { Metadata } from 'next'

export const metadata: Metadata = {
  title: 'Cambios — Forever Basics',
  description: 'Gestioná el cambio de talle o color de tu compra.',
  robots: { index: false, follow: false },
}

export default function CambiosLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-screen bg-[#f6f5f3] text-zinc-900" style={{ colorScheme: 'light' }}>
      <header className="border-b border-zinc-200 bg-white">
        <div className="mx-auto max-w-xl px-4 h-14 flex items-center justify-between">
          <span className="font-semibold tracking-[0.2em] text-sm">FOREVER BASICS</span>
          <span className="text-xs text-zinc-500">Cambios</span>
        </div>
      </header>
      <main className="mx-auto max-w-xl px-4 py-6 pb-16">{children}</main>
    </div>
  )
}
