import type { Metadata } from 'next'
import Link from 'next/link'
import { FaroMark } from '@/components/faro/Shell'

export const metadata: Metadata = {
  title: 'Faro · Cuánto ganás de verdad con tu ecommerce',
  description: 'Faro cruza tus ventas de Tiendanube con Meta Ads y tus costos: ganancia real, qué anuncio vende y qué apagar, en un solo tablero. Gratis en acceso anticipado.',
  openGraph: {
    title: 'Faro · Ventas, anuncios y ganancia en un solo lugar',
    description: 'Tiendanube + Meta Ads + tus costos. Ganancia real, anuncios que venden y reglas con tu aprobación.',
    images: ['/landing/inicio.png'],
  },
}

// Paleta fija del hero (noche de puerto + luz de faro), igual en modo claro y oscuro
const NIGHT = '#0c1522'
const BEAM = '#e8a33d'

function Check() {
  return <svg viewBox="0 0 20 20" className="w-4 h-4 shrink-0 mt-0.5" aria-hidden><path d="M4 10.5 8 14.5 16 6" fill="none" stroke={BEAM} strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" /></svg>
}

function Shot({ src, alt, className = '' }: { src: string; alt: string; className?: string }) {
  return (
    <figure className={`rounded-xl border border-white/10 bg-[#131f30] p-1.5 shadow-[0_30px_80px_-20px_rgba(0,0,0,0.6)] ${className}`}>
      <div className="flex gap-1.5 px-2 py-1.5" aria-hidden><span className="w-2.5 h-2.5 rounded-full bg-white/15" /><span className="w-2.5 h-2.5 rounded-full bg-white/15" /><span className="w-2.5 h-2.5 rounded-full bg-white/15" /></div>
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src={src} alt={alt} loading="lazy" className="w-full rounded-lg block" />
    </figure>
  )
}

function Feature({ kicker, title, children, points, shot, alt, flip }: { kicker: string; title: string; children: React.ReactNode; points: string[]; shot: React.ReactNode | string; alt?: string; flip?: boolean }) {
  return (
    <div className={`grid lg:grid-cols-[minmax(0,5fr)_minmax(0,7fr)] gap-10 lg:gap-14 items-center ${flip ? 'lg:[&>*:first-child]:order-2' : ''}`}>
      <div>
        <p className="text-[13px] font-semibold tracking-wide uppercase text-beacon-ink dark:text-beacon">{kicker}</p>
        <h3 className="mt-2 text-[28px] sm:text-[32px] leading-[1.15] font-semibold tracking-tight text-ink">{title}</h3>
        <p className="mt-4 text-[16px] leading-relaxed text-mute">{children}</p>
        <ul className="mt-5 flex flex-col gap-2.5 text-[15px] text-ink">
          {points.map((p) => <li key={p} className="flex gap-2.5"><Check />{p}</li>)}
        </ul>
      </div>
      {typeof shot === 'string' ? <Shot src={shot} alt={alt || ''} /> : shot}
    </div>
  )
}

/** Ilustración: dos tamaños, un solo anuncio. */
function PairArt() {
  return (
    <div className="rounded-xl border border-line bg-surface p-6 sm:p-8">
      <div className="flex items-end justify-center gap-4 sm:gap-6">
        <div className="flex flex-col items-center gap-2">
          <div className="w-28 sm:w-36 aspect-[4/5] rounded-lg bg-gradient-to-br from-[#2a3b55] to-[#13233a] grid place-items-center text-white/70 text-[12px]">Feed 4:5</div>
          <span className="text-[12.5px] text-mute">Feed y explorar</span>
        </div>
        <span className="pb-16 text-2xl text-faint" aria-hidden>+</span>
        <div className="flex flex-col items-center gap-2">
          <div className="w-20 sm:w-24 aspect-[9/16] rounded-lg bg-gradient-to-br from-[#e8a33d] to-[#b8741c] grid place-items-center text-[#1a1206] text-[12px] font-medium">9:16</div>
          <span className="text-[12.5px] text-mute">Historias y reels</span>
        </div>
      </div>
      <div className="mt-6 rounded-lg border border-line bg-sunken px-4 py-3 text-[14px] flex flex-wrap items-center gap-x-3 gap-y-1">
        <span className="font-semibold text-ink">= 1 anuncio</span>
        <span className="text-mute">en 3 ad sets a la vez · en pausa hasta que lo actives</span>
      </div>
      <ul className="mt-4 grid sm:grid-cols-2 gap-2 text-[13.5px] text-mute">
        <li className="flex gap-2"><Check />Multianunciante apagado</li>
        <li className="flex gap-2"><Check />Mejoras de texto de IA apagadas</li>
        <li className="flex gap-2"><Check />UTMs puestas solas</li>
        <li className="flex gap-2"><Check />Varios textos y títulos</li>
      </ul>
    </div>
  )
}

const FAQ = [
  { q: '¿Cuánto cuesta?', a: 'Nada por ahora. Faro está en acceso anticipado y es gratis. Si más adelante hay planes pagos, te avisamos antes y vas a poder decidir.' },
  { q: '¿Qué necesito para usarlo?', a: 'Una tienda en Tiendanube y, para la parte de anuncios, una cuenta publicitaria de Meta. Se conectan con un par de clics desde Ajustes, sin código.' },
  { q: '¿Faro cambia mis anuncios solo?', a: 'No. Faro propone, vos aprobás. Ningún cambio de presupuesto, pausa o anuncio nuevo se publica en Meta sin que lo confirmes, y podés marcar campañas como protegidas para que nadie las toque.' },
  { q: '¿Mis datos están seguros?', a: 'Los accesos a Tiendanube y Meta se guardan cifrados, cada negocio solo ve sus datos y podés desconectar todo cuando quieras desde Ajustes.' },
  { q: '¿Funciona con Google Ads, TikTok o Shopify?', a: 'Todavía no. Hoy Faro está hecho para Tiendanube y Meta Ads, que es donde vende la mayoría de las marcas en Argentina.' },
  { q: '¿Sirve si manejo varias marcas?', a: 'Sí. Podés tener varios negocios en la misma cuenta, cada uno con su tienda, su cuenta de Meta y su equipo.' },
]

export default function Landing() {
  return (
    <div className="faro font-faro bg-bg text-ink min-h-screen">
      {/* Nav */}
      <header className="sticky top-0 z-40 border-b border-white/10 backdrop-blur" style={{ background: `${NIGHT}e6` }}>
        <div className="mx-auto max-w-[1200px] px-4 sm:px-6 h-14 flex items-center gap-6 text-[14px]">
          <Link href="/" className="flex items-center gap-2 text-white font-semibold text-[16px]"><FaroMark className="w-6 h-6" />Faro</Link>
          <nav className="hidden md:flex gap-6 text-white/70" aria-label="Secciones">
            <a href="#producto" className="hover:text-white">Producto</a>
            <a href="#como" className="hover:text-white">Cómo funciona</a>
            <a href="#preguntas" className="hover:text-white">Preguntas</a>
            <Link href="/demo" className="hover:text-white">Demo</Link>
          </nav>
          <div className="ml-auto flex items-center gap-2">
            <Link href="/login" className="rounded-md px-3 py-1.5 text-white/80 hover:text-white">Ingresar</Link>
            <Link href="/signup" className="rounded-md px-3.5 py-1.5 font-semibold text-[#1a1206]" style={{ background: BEAM }}>Crear cuenta</Link>
          </div>
        </div>
      </header>

      {/* Hero */}
      <section className="relative overflow-hidden text-white" style={{ background: NIGHT }}>
        {/* Haz del faro */}
        <div aria-hidden className="pointer-events-none absolute inset-0" style={{ background: `radial-gradient(ellipse 70% 55% at 22% 0%, ${BEAM}33, transparent 70%), radial-gradient(ellipse 50% 40% at 85% 30%, #1f3a5f66, transparent 70%)` }} />
        <div className="relative mx-auto max-w-[1200px] px-4 sm:px-6 pt-16 sm:pt-24 pb-10">
          <div className="max-w-[780px]">
            <p className="inline-flex items-center gap-2 rounded-full border border-white/15 bg-white/5 px-3 py-1 text-[13px] text-white/80">
              <span className="w-1.5 h-1.5 rounded-full" style={{ background: BEAM }} />Acceso anticipado gratis · Para tiendas en Tiendanube
            </p>
            <h1 className="mt-5 text-[40px] sm:text-[58px] leading-[1.04] font-semibold tracking-tight">
              Sabé cuánto ganás de verdad con cada peso en Meta.
            </h1>
            <p className="mt-5 text-[18px] sm:text-[19px] leading-relaxed text-white/70 max-w-[640px]">
              Faro cruza tus ventas de Tiendanube con Meta Ads y tus costos. Te muestra la ganancia real, qué anuncio vende y qué conviene apagar, y te deja hacer los cambios desde el mismo lugar.
            </p>
            <div className="mt-8 flex flex-wrap gap-3">
              <Link href="/signup" className="rounded-lg px-5 py-3 text-[15px] font-semibold text-[#1a1206]" style={{ background: BEAM }}>Crear cuenta gratis</Link>
              <Link href="/demo" className="rounded-lg border border-white/20 px-5 py-3 text-[15px] font-medium text-white hover:bg-white/5">Ver la demo sin registrarte</Link>
            </div>
            <p className="mt-4 text-[13px] text-white/50">Sin tarjeta. Conectás tu tienda en un par de minutos.</p>
          </div>
          <div className="mt-14">
            <Shot src="/landing/inicio.png" alt="Inicio de Faro: facturación, ganancia después de publicidad, inversión y acciones sugeridas" />
          </div>
        </div>
      </section>

      {/* Verdades */}
      <section className="border-b border-line">
        <div className="mx-auto max-w-[1200px] px-4 sm:px-6 py-16 grid md:grid-cols-3 gap-8">
          {[
            ['El ROAS de Meta no es tu ganancia.', 'Meta no sabe lo que te cuesta la mercadería, el envío, las comisiones ni los impuestos de la pauta. Faro sí, y te dice cuánto podés pagar por venta sin perder plata.'],
            ['Tiendanube no sabe qué anuncio vendió.', 'Faro lee el origen de cada pedido y lo cruza con tus anuncios, para que veas las ventas reales de cada creativo además de lo que reporta Meta.'],
            ['La planilla del domingo no alcanza.', 'Los números se actualizan solos durante el día. Abrís Faro y en un minuto sabés cómo venís y qué tocar.'],
          ].map(([t, d]) => (
            <div key={t}>
              <p className="text-[19px] font-semibold text-ink leading-snug">{t}</p>
              <p className="mt-2 text-[15px] leading-relaxed text-mute">{d}</p>
            </div>
          ))}
        </div>
      </section>

      {/* Producto */}
      <section id="producto" className="mx-auto max-w-[1200px] px-4 sm:px-6 py-20 flex flex-col gap-24">
        <Feature kicker="Ganancia real" title="Facturación, costos y ganancia, sin planilla." shot="/landing/plan.png" alt="Plan sugerido por IA y tabla de productos con margen" points={[
          'Ganancia después de publicidad, por día y por período',
          'Costo máximo por compra para no perder plata',
          'Estado de resultados mensual con costos fijos y caja',
          'Aviso cuando un producto que vende se está por quedar sin stock',
        ]}>
          Faro arma el resultado desde tus órdenes reales, tus costos por producto, las comisiones de cada medio de pago y la pauta con sus impuestos. Lo que ves es lo que te queda.
        </Feature>

        <Feature flip kicker="Anuncios" title="Todas tus campañas en una tabla que se entiende." shot="/landing/anuncios.png" alt="Tabla de campañas de Faro con comparación contra el período anterior" points={[
          'Costo por compra en verde o rojo según tu margen, no según un promedio',
          'Comparación contra el período anterior en cada fila',
          'Avisos de cuenta: pagos, límite de gasto, anuncios rechazados',
          'Detecta creativos que se están cansando antes de que se note en las ventas',
        ]}>
          Campañas, ad sets y anuncios con las métricas que importan para vender. Tocás una fila y ves su evolución diaria, el desglose por edad, género, provincia y ubicación, y los cambios para hacer.
        </Feature>

        <Feature kicker="Ventas reales por anuncio" title="Qué creativo trae ventas a tu tienda." shot="/landing/creativos.png" alt="Galería de creativos con ventas reales de Tiendanube" points={[
          'Ventas de Tiendanube por anuncio, además de las que reporta Meta',
          'Etiquetas por ángulo, formato y producto para ver qué idea funciona',
          'Ganadores, perdedores y creativos que gastaron sin vender',
        ]}>
          Cada anuncio con su imagen, sus números y lo que realmente vendió. Etiquetalos y vas a ver si gana el video o la foto, el precio o el beneficio.
        </Feature>

        <Feature flip kicker="Cargar anuncios" title="Feed e historias en un solo anuncio, en varios ad sets a la vez." shot={<PairArt />} points={[
          'Subís el 4:5 y el 9:16 y Faro los junta en el mismo anuncio',
          'Publicás en varios ad sets de una vez, o en un ad set nuevo',
          'Las mejoras automáticas de Meta que empeoran la entrega vienen apagadas',
          'Todo se crea en pausa: lo revisás y lo activás vos',
        ]}>
          Lo que en el Administrador de anuncios lleva veinte clics por anuncio, en Faro es arrastrar los archivos, escribir el texto y listo.
        </Feature>

        <Feature kicker="Reglas y plan" title="Reglas que proponen. Vos aprobás." shot="/landing/reglas.png" alt="Propuestas de reglas y plan de inversión mensual" points={[
          'Pausar lo que gasta sin vender, escalar lo que vende barato',
          'Las campañas protegidas no se tocan nunca',
          'Plan de inversión mensual con proyección de cierre',
          'Plan sugerido por IA con qué escalar, qué corregir y qué publicar',
        ]}>
          Definís reglas simples y Faro revisa todos los días qué cumple cada una. Te deja la lista de cambios lista para aprobar con un clic, sin automatismos que te sorprendan.
        </Feature>
      </section>

      {/* Cómo funciona */}
      <section id="como" className="border-y border-line bg-surface">
        <div className="mx-auto max-w-[1200px] px-4 sm:px-6 py-20">
          <h2 className="text-[30px] sm:text-[36px] font-semibold tracking-tight text-ink">En marcha en tres pasos</h2>
          <ol className="mt-10 grid md:grid-cols-3 gap-8">
            {[
              ['Conectá Tiendanube', 'Autorizás tu tienda y Faro trae el historial de pedidos y productos.'],
              ['Conectá Meta Ads', 'Elegís tus cuentas publicitarias. Faro trae campañas, gasto y resultados.'],
              ['Cargá tus costos', 'El costo de cada producto, las comisiones y los impuestos. Desde ahí, la ganancia es real.'],
            ].map(([t, d], i) => (
              <li key={t} className="flex gap-4">
                <span className="w-9 h-9 shrink-0 rounded-full grid place-items-center font-semibold text-[#1a1206]" style={{ background: BEAM }}>{i + 1}</span>
                <div><p className="text-[17px] font-semibold text-ink">{t}</p><p className="mt-1 text-[15px] text-mute leading-relaxed">{d}</p></div>
              </li>
            ))}
          </ol>
          <div className="mt-12 rounded-xl border border-line bg-bg p-6 sm:p-8 flex flex-wrap gap-6 items-center">
            <FaroMark className="w-10 h-10 text-ink" />
            <p className="flex-1 min-w-[260px] text-[16px] text-ink leading-relaxed">
              Faro nació para manejar la pauta y los números de <strong className="font-semibold">Forever Basics</strong>, una marca argentina de remeras, y se usa todos los días ahí. Cada función existe porque hizo falta en una tienda real.
            </p>
          </div>
        </div>
      </section>

      {/* FAQ */}
      <section id="preguntas" className="mx-auto max-w-[860px] px-4 sm:px-6 py-20">
        <h2 className="text-[30px] sm:text-[36px] font-semibold tracking-tight text-ink">Preguntas frecuentes</h2>
        <div className="mt-8 divide-y divide-line border-y border-line">
          {FAQ.map((f) => (
            <details key={f.q} className="group py-4">
              <summary className="flex cursor-pointer list-none items-center justify-between gap-4 text-[16.5px] font-medium text-ink">
                {f.q}<span className="text-faint transition group-open:rotate-45 text-xl leading-none" aria-hidden>+</span>
              </summary>
              <p className="mt-2 text-[15px] leading-relaxed text-mute">{f.a}</p>
            </details>
          ))}
        </div>
      </section>

      {/* CTA final */}
      <section className="text-white" style={{ background: NIGHT }}>
        <div className="mx-auto max-w-[1200px] px-4 sm:px-6 py-20 flex flex-col items-start gap-6 md:flex-row md:items-center md:justify-between">
          <div>
            <h2 className="text-[30px] sm:text-[38px] font-semibold tracking-tight leading-tight">Tu próxima decisión, con tus números.</h2>
            <p className="mt-3 text-[16px] text-white/70">Gratis durante el acceso anticipado. Sin tarjeta.</p>
          </div>
          <div className="flex flex-wrap gap-3">
            <Link href="/signup" className="rounded-lg px-5 py-3 text-[15px] font-semibold text-[#1a1206]" style={{ background: BEAM }}>Crear cuenta gratis</Link>
            <Link href="/demo" className="rounded-lg border border-white/20 px-5 py-3 text-[15px] font-medium hover:bg-white/5">Ver la demo</Link>
          </div>
        </div>
        <footer className="border-t border-white/10">
          <div className="mx-auto max-w-[1200px] px-4 sm:px-6 py-6 flex flex-wrap gap-x-6 gap-y-2 text-[13px] text-white/50">
            <span className="flex items-center gap-2"><FaroMark className="w-4 h-4" />Faro · {new Date().getFullYear()}</span>
            <Link href="/privacidad" className="hover:text-white">Privacidad</Link>
            <Link href="/terminos" className="hover:text-white">Términos</Link>
            <Link href="/eliminar-datos" className="hover:text-white">Eliminar mis datos</Link>
            <Link href="/login" className="ml-auto hover:text-white">Ingresar</Link>
          </div>
        </footer>
      </section>
    </div>
  )
}
