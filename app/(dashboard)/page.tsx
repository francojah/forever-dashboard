import Link from 'next/link'
import { redirect } from 'next/navigation'
import { getRequestContext, canEdit } from '@/lib/faro/context'
import { parsePeriodKey, resolvePeriod } from '@/lib/faro/dates'
import { loadHome } from '@/lib/faro/home'
import { PageHeader, PeriodPicker, Panel, Empty } from '@/components/faro/ui'
import KpiStrip from '@/components/faro/KpiStrip'
import DailyChart from '@/components/faro/DailyChart'
import ActionList from '@/components/faro/ActionList'
import SetupNotice from '@/components/faro/SetupNotice'
import { money, int, ratio, pct } from '@/lib/faro/format'

export const dynamic = 'force-dynamic'

export default async function InicioPage({ searchParams }: { searchParams: { p?: string; from?: string; to?: string } }) {
  const ctx = await getRequestContext()
  if (!ctx) redirect('/login')
  if (!ctx.stores.length && !ctx.adAccounts.length) redirect('/ajustes?tab=conexiones&bienvenida=1')

  const period = resolvePeriod(parsePeriodKey(searchParams.p), ctx.workspace.timezone, new Date(), { from: searchParams.from, to: searchParams.to })
  const d = await loadHome(ctx, period)
  const cur = ctx.workspace.currency

  return (
    <>
      <PageHeader title="Inicio" description={`${period.label} comparado con ${d.prev.label}.`}>
        <PeriodPicker value={period.key} from={period.from} to={period.to} />
      </PageHeader>

      <div className="flex flex-col gap-5">
        <SetupNotice settings={ctx.workspace.settings} sales={d.cur.sales} />
        <KpiStrip cur={d.cur} before={d.before} prevLabel={d.prev.label} currency={cur} />

        <Panel title="Ventas, inversión y ganancia por día" description={d.seriesLabel}>
          <DailyChart data={d.series} />
        </Panel>

        <ActionList actions={d.actions} canEdit={canEdit(ctx)} />

        <div className="grid lg:grid-cols-2 gap-5">
          <Panel title="Campañas" description={period.label} actions={<Link href={`/anuncios?p=${period.key}`} className="text-[13px] text-mute hover:text-ink underline-offset-2 hover:underline">Ver todas</Link>} padded={false}>
            {d.campaigns.length === 0 ? <div className="px-5"><Empty title="Sin inversión en este período" /></div> : (
              <table className="w-full text-[13.5px]">
                <thead><tr className="text-mute text-left border-y border-line bg-sunken/60">
                  <th className="font-medium px-5 py-2">Campaña</th><th className="font-medium px-2 py-2 text-right">Gasto</th>
                  <th className="font-medium px-2 py-2 text-right">Compras</th><th className="font-medium px-2 py-2 text-right">Costo/compra</th><th className="font-medium px-5 py-2 text-right">ROAS Meta</th>
                </tr></thead>
                <tbody className="divide-y divide-line">
                  {d.campaigns.slice(0, 6).map((c) => {
                    const cpa = c.m.purchases > 0 ? c.m.spend / c.m.purchases : null
                    return (
                      <tr key={c.id}>
                        <td className="px-5 py-2.5 max-w-[220px] truncate text-ink" title={c.name}>{c.name}</td>
                        <td className="px-2 py-2.5 text-right num">{money(c.m.spend)}</td>
                        <td className="px-2 py-2.5 text-right num">{int(c.m.purchases)}</td>
                        <td className={`px-2 py-2.5 text-right num ${cpa != null && d.maxCpaRef != null ? (cpa <= d.maxCpaRef ? 'text-good' : 'text-bad') : 'text-mute'}`}>{cpa != null ? money(cpa) : '—'}</td>
                        <td className="px-5 py-2.5 text-right num">{c.m.spend > 0 ? ratio(c.m.purchaseValue / c.m.spend) : '—'}</td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            )}
          </Panel>

          <Panel title="Productos" description={period.label} actions={<Link href={`/ventas?tab=productos&p=${period.key}`} className="text-[13px] text-mute hover:text-ink underline-offset-2 hover:underline">Ver todos</Link>} padded={false}>
            {d.products.length === 0 ? <div className="px-5"><Empty title="Sin ventas en este período" /></div> : (
              <table className="w-full text-[13.5px]">
                <thead><tr className="text-mute text-left border-y border-line bg-sunken/60">
                  <th className="font-medium px-5 py-2">Producto</th><th className="font-medium px-2 py-2 text-right">Unidades</th>
                  <th className="font-medium px-2 py-2 text-right">Ventas netas</th><th className="font-medium px-5 py-2 text-right">Margen bruto</th>
                </tr></thead>
                <tbody className="divide-y divide-line">
                  {d.products.slice(0, 6).map((p) => (
                    <tr key={p.id}>
                      <td className="px-5 py-2.5 max-w-[240px] truncate text-ink" title={p.name}>{p.name}</td>
                      <td className="px-2 py-2.5 text-right num">{int(p.units)}</td>
                      <td className="px-2 py-2.5 text-right num">{money(p.netSales)}</td>
                      <td className="px-5 py-2.5 text-right num">{pct(p.margin)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </Panel>
        </div>
      </div>
    </>
  )
}
