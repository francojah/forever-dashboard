import type { Metadata } from 'next'
import Link from 'next/link'
import { demoHome, demoActions, demoTree, demoCreativeImage, DEMO_ACCOUNT, DEMO_TZ } from '@/lib/faro/demo'
import { flatten } from '@/lib/faro/adsTree'
import type { Metrics } from '@/lib/faro/adsTree'
import { planPacing, monthOf } from '@/lib/faro/budgetPlan'
import { evaluateRule, mergeProposals, TEMPLATES } from '@/lib/faro/rules'
import { localDate } from '@/lib/faro/dates'
import { money, int, ratio, pct } from '@/lib/faro/format'
import { PageHeader, Panel } from '@/components/faro/ui'
import KpiStrip from '@/components/faro/KpiStrip'
import DailyChart from '@/components/faro/DailyChart'
import ActionList from '@/components/faro/ActionList'
import AiAdvisor from '@/components/faro/AiAdvisor'
import AdsWorkspace from '@/components/faro/ads/AdsWorkspace'
import CreativeGallery, { type CreativeCard } from '@/components/faro/ads/CreativeGallery'
import { FaroMark } from '@/components/faro/Shell'

export const metadata: Metadata = {
  title: 'Demo · Faro',
  description: 'Faro con datos de ejemplo: ventas reales cruzadas con Meta Ads, margen y anuncios en un solo lugar.',
}

const VIEWS = [
  { key: 'inicio', label: 'Inicio' },
  { key: 'anuncios', label: 'Anuncios' },
  { key: 'creativos', label: 'Creativos' },
] as const

const AI_SAMPLE = {
  resumen: 'El negocio deja 21% de ganancia después de publicidad, pero 1 de cada 5 pesos de pauta va a anuncios que no venden. Retargeting está barato y con margen para crecer; el test de "ángulo precio" no funcionó.',
  publicar: ['Dos videos UGC de 15 s mostrando el calce de la Oversize, con versión 9:16 para historias.', 'Un carrusel del Pack x3 con el ahorro en el primer cuadro.'],
  no_tocar: ['PROSPECTING · Advantage+: está protegida y estable, no cambiar presupuesto esta semana.'],
  acciones: [
    { tipo: 'pausar' as const, prioridad: 1 as const, titulo: 'Pausar "Imagen · 3 cuotas" y "Imagen · Oversize lifestyle"', por_que: 'Gastaron $1.425.000 en 30 días sin ninguna compra.', como: ['Pausar los dos anuncios desde Campañas', 'Dejar el ad set de test con el resto de los creativos'], impacto: 'Libera unos $47.000 por día de pauta improductiva.', riesgo: 'Bajo: no tienen ventas atribuidas.', objetivo: null },
    { tipo: 'escalar' as const, prioridad: 2 as const, titulo: 'Subir 15% el retargeting de visitantes', por_que: 'Costo por compra 68% debajo del máximo rentable, frecuencia 1,9.', como: ['Subir de $35.000 a $40.250 por día', 'Volver a mirar en 3 días'], impacto: '+8 a 10 ventas por semana estimadas.', riesgo: 'Bajo: el cambio es menor a 20% y no reinicia el aprendizaje.', objetivo: null },
  ],
}

export default function DemoPage({ searchParams }: { searchParams: { v?: string } }) {
  const view = VIEWS.some((v) => v.key === searchParams.v) ? searchParams.v! : 'inicio'
  const d = demoHome()
  const accounts = [{ id: DEMO_ACCOUNT, name: 'Bruma · Meta Ads', external_id: 'act_demo', protected_ids: ['c1'] }]
  const prev: Record<string, Metrics> = {}
  for (const n of flatten(d.prevTree)) prev[n.id] = n.m
  const today = localDate(new Date(), DEMO_TZ)
  const proposals = mergeProposals(TEMPLATES.flatMap((t, i) => evaluateRule({ ...t, id: `t${i}` }, flatten(demoTree(t.days)).map((n) => ({ ...n, protected: n.campaignId === 'c1' })), d.maxCpa)))
  const dailyNow = 90000 + 35000 + 25000 + 18000
  const mtd = d.daily.filter((x) => x.date.startsWith(monthOf(today))).reduce((a, x) => a + x.spend, 0)
  const plan = planPacing({ plan: 12_000_000, spent: mtd, today, hourShare: 0.6, dailyNow })

  return (
    <div className="faro font-faro min-h-screen bg-bg text-ink">
      <div data-demo-banner className="sticky top-0 z-30 border-b border-beacon/30 bg-beacon/15 backdrop-blur">
        <div className="mx-auto max-w-[1400px] px-4 py-2 flex flex-wrap items-center gap-x-4 gap-y-2 text-[13.5px]">
          <Link href="/" className="flex items-center gap-2 font-semibold text-ink"><FaroMark className="w-5 h-5" />Faro</Link>
          <span className="text-mute">Estás viendo una demo con datos de una tienda de ejemplo.</span>
          <span className="ml-auto flex gap-2">
            <Link href="/" className="rounded-md px-3 py-1.5 text-mute hover:text-ink">Volver</Link>
            <Link href="/signup" className="rounded-md bg-ink text-bg px-3 py-1.5 font-semibold">Crear cuenta gratis</Link>
          </span>
        </div>
      </div>

      <div className="mx-auto max-w-[1400px] px-4 py-6">
        <nav className="mb-5 inline-flex rounded-lg border border-line bg-surface p-0.5 text-[13.5px]" aria-label="Secciones de la demo">
          {VIEWS.map((v) => (
            <Link key={v.key} href={`/demo?v=${v.key}`} className={`rounded-md px-3.5 py-1.5 ${view === v.key ? 'bg-ink text-bg font-medium' : 'text-mute hover:text-ink'}`} aria-current={view === v.key ? 'page' : undefined}>{v.label}</Link>
          ))}
        </nav>

        {view === 'inicio' && (
          <>
            <PageHeader title="Inicio" description={`${d.period.label} comparado con ${d.prev.label.toLowerCase()} · Bruma (tienda de ejemplo)`} />
            <div className="flex flex-col gap-5">
              <KpiStrip cur={d.cur} before={d.before} prevLabel={d.prev.label} currency="ARS" />
              <Panel title="Ventas, inversión y ganancia por día" description={d.period.label}><DailyChart data={d.series} /></Panel>
              <ActionList actions={demoActions()} canEdit={false} />
              <AiAdvisor initial={{ report: AI_SAMPLE, createdAt: new Date().toISOString() }} configured timezone={DEMO_TZ} readOnly />
              <div className="grid lg:grid-cols-2 gap-5">
                <Panel title="Campañas" description={d.period.label} padded={false}>
                  <table className="w-full text-[13.5px]">
                    <thead><tr className="text-mute text-left border-y border-line bg-sunken/60"><th className="font-medium px-5 py-2">Campaña</th><th className="font-medium px-2 py-2 text-right">Gasto</th><th className="font-medium px-2 py-2 text-right">Compras</th><th className="font-medium px-2 py-2 text-right">Costo/compra</th><th className="font-medium px-5 py-2 text-right">ROAS Meta</th></tr></thead>
                    <tbody className="divide-y divide-line">
                      {d.tree.map((c) => { const cpa = c.m.purchases ? c.m.spend / c.m.purchases : null; return (
                        <tr key={c.id}><td className="px-5 py-2.5 text-ink truncate max-w-[220px]">{c.name}</td><td className="px-2 py-2.5 text-right num">{money(c.m.spend)}</td><td className="px-2 py-2.5 text-right num">{int(c.m.purchases)}</td>
                          <td className={`px-2 py-2.5 text-right num ${cpa != null && d.maxCpa != null ? (cpa <= d.maxCpa ? 'text-good' : 'text-bad') : ''}`}>{cpa != null ? money(cpa) : '—'}</td><td className="px-5 py-2.5 text-right num">{ratio(c.m.purchaseValue / c.m.spend)}</td></tr>
                      ) })}
                    </tbody>
                  </table>
                </Panel>
                <Panel title="Productos" description={d.period.label} padded={false}>
                  <table className="w-full text-[13.5px]">
                    <thead><tr className="text-mute text-left border-y border-line bg-sunken/60"><th className="font-medium px-5 py-2">Producto</th><th className="font-medium px-2 py-2 text-right">Unidades</th><th className="font-medium px-2 py-2 text-right">Ventas netas</th><th className="font-medium px-5 py-2 text-right">Margen bruto</th></tr></thead>
                    <tbody className="divide-y divide-line">
                      {d.products.map((p) => (<tr key={p.id}><td className="px-5 py-2.5 text-ink">{p.name}</td><td className="px-2 py-2.5 text-right num">{int(p.units)}</td><td className="px-2 py-2.5 text-right num">{money(p.netSales)}</td><td className="px-5 py-2.5 text-right num">{pct(p.margin)}</td></tr>))}
                    </tbody>
                  </table>
                </Panel>
              </div>
            </div>
          </>
        )}

        {view === 'anuncios' && (
          <>
            <PageHeader title="Anuncios" description={`${d.period.label}. Tocá cualquier fila para ver el detalle.`} />
            <AdsWorkspace
              demo tree={d.tree} hourShare={0.6}
              todaySpend={Object.fromEntries(flatten(d.tree).filter((n) => n.dailyBudget).map((n) => [n.id, Math.round(n.dailyBudget! * 0.56)]))} accounts={accounts} maxCpa={d.maxCpa} canEdit={false} focus={null}
              daily={d.daily} period={{ from: d.period.from, to: d.period.to, label: d.period.label, key: d.period.key }}
              prev={prev} prevLabel={d.prev.label.toLowerCase()} proposals={proposals} plan={plan}
              alerts={[{ id: 'demo-learning', level: 'warning', title: 'Aprendizaje limitado en "Test · ángulo precio"', detail: 'Tiene pocas compras por semana para salir de aprendizaje. Conviene juntarlo con otro ad set.', account: 'Bruma · Meta Ads', targetId: 's5' }]}
              fatigue={{ a4: 'cayendo: CTR −31%, frecuencia 3,2' }}
            />
          </>
        )}

        {view === 'creativos' && (() => {
          const cards: CreativeCard[] = []
          for (const c of d.tree) for (const s of c.children) for (const a of s.children) cards.push({ id: a.id, name: a.name, adset: s.name, adsetId: s.id, campaign: c.name, active: true, image: demoCreativeImage(a.id), isVideo: a.isVideo, body: null, m: a.m })
          const sales = Object.fromEntries(cards.map((c) => [c.id, { orders: Math.round(c.m.purchases * 0.82), revenue: Math.round(c.m.purchases * 0.82) * 52000 }]))
          return (
            <>
              <PageHeader title="Creativos" description={`${d.period.label}. Cada anuncio con sus números y las ventas reales que trajo a la tienda.`} />
              <CreativeGallery cards={cards} maxCpa={d.maxCpa} periodLabel={d.period.label} sales={sales}
                initialTags={{ a1: { angulo: 'Precio', formato: 'Video', producto: 'Remera Clásica' }, a2: { angulo: 'Beneficio', formato: 'Imagen', producto: 'Pack x3' }, a3: { angulo: 'Talles', formato: 'Video', producto: 'Remera Clásica' }, a8: { angulo: 'Calidad', formato: 'Video', producto: 'Remera Clásica' } }} />
            </>
          )
        })()}

        <div className="mt-10 rounded-panel border border-line bg-surface p-6 flex flex-wrap items-center gap-4">
          <div className="min-w-0">
            <p className="text-[17px] font-semibold text-ink">Esto, con los números de tu tienda.</p>
            <p className="text-[14px] text-mute">Conectás Tiendanube y Meta Ads en un par de minutos. Gratis mientras dure el acceso anticipado.</p>
          </div>
          <Link href="/signup" className="ml-auto rounded-lg bg-beacon text-[#1a1206] px-5 py-3 font-semibold">Crear cuenta gratis</Link>
        </div>
      </div>
    </div>
  )
}
