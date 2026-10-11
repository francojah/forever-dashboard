export default function LegalLayout({ children }: { children: React.ReactNode }) {
  return (
    <main className="min-h-screen bg-white text-neutral-900">
      <div className="max-w-2xl mx-auto px-5 py-12 text-[15px] leading-relaxed [&_h1]:text-2xl [&_h1]:font-semibold [&_h1]:mb-2 [&_h2]:text-lg [&_h2]:font-semibold [&_h2]:mt-8 [&_h2]:mb-2 [&_p]:mb-3 [&_ul]:list-disc [&_ul]:pl-5 [&_ul]:mb-3 [&_a]:underline">
        {children}
        <p className="mt-10 text-sm text-neutral-500">Faro · <a href="/privacidad">Privacidad</a> · <a href="/terminos">Términos</a> · <a href="/eliminar-datos">Eliminar datos</a></p>
      </div>
    </main>
  )
}
