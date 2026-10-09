import Link from 'next/link'
import { redirect } from 'next/navigation'
import { getRequestContext } from '@/lib/faro/context'
import { parsePeriodKey, resolvePeriod } from '@/lib/faro/dates'
import { loadSales, Breakdown } from '@/lib/faro/sales'
import { PageHeader, PeriodPicker, Panel, Tabs, Delta, Empty, Badge } from '@/components/faro/ui'
import { money, int, pct } from '@/lib/faro/format'
import { pctDelta } from '@/lib/faro/metrics'

export const dynamic = 'force-dynamic'

function Bars({ rows, value = 'amount', note }: { rows: Breakdown[]; value?: 'amount' | 'orders'; note?: (r: Breakdown) => React.ReactNode }) {
  const max = Math.max(1, ...rows.map((r) => r[value]))
  const total = rows.reduce((a, r) => a + r[value], 0) || 1
  if (!rows.length) return <Empty title="Sin datos en este período" />
  return (
    <ul className="flex flex-col gap-2.5">
      {rows.map((r) => (
        <li key={r.key} className="text-[13.5px]">
          <div className="flex items-baseline justify-between gap-3">
            <span className="text-ink truncate">{r.label}</span>
            <span className="num text-mute shrink-0">{value === 'amount' ? money(r.amount) : int(r.orders)} <span className="text-faint">· {pct(r[value] / total)}</span></span>
          </div>
          <div className="mt-1 h-1.5 rounded-full bg-sunken"><div className="h-full rounded-full bg-ink/35" style={{ width: `${(r[value] / max) * 100}%` }} /></div>
          {note && <p className="mt-0.5 text-[12px] text-mute">{note(r)}</p>}
        </li>
      ))}
    </ul>
  )
}

export default async function VentasPage({ searchParams }: { searchParams: { p?: string; from?: string; to?: string; tab?: string } }) {
  const ctx = await getRequestContext()
  if (!ctx) redirect('/login')
  if (!ctx.stores.length) {
    return (<><PageHeader title="Ventas" /><Panel><Empty title="Todavía no conectaste una tienda"><Link href="/ajustes?tab=conexiones" className="underline">Conectar Tiendanube</Link></Empty></Panel></>)
  }
  const tab = ['resumen', 'productos', 'clientes'].includes(searchParams.tab || '') ? searchParams.tab! : 'resumen'
  const period = resolvePeriod(parsePeriodKey(searchParams.p), ctx.workspace.timezone, new Date(), { from: searchParams.from, to: searchParams.to })
  const d = await loadSales(ctx, period, tab === 'productos')
  const s = d.sales

  const figures = [
    { label: 'Ventas netas', value: money(s.netSales), delta: pctDelta(s.netSales, d.prev.netSales) },
    { label: 'Órdenes pagadas', value: int(s.orders), delta: pctDelta(s.orders, d.prev.orders) },
    { label: 'Ticket promedio', value: money(s.orders ? s.netSales / s.orders : null), delta: pctDelta(s.orders ? s.netSales / s.orders : null, d.prev.orders ? d.prev.netSales / d.prev.orders : null) },
    { label: 'Unidades por orden', value: s.orders ? (s.units / s.orders).toLocaleString('es-AR', { maximumFractionDigits: 1 }) : '—', delta: pctDelta(s.orders ? s.units / s.orders : null, d.prev.orders ? d.prev.units / d.prev.orders : null) },
    { label: 'Margen de contribución', value: pct(s.netSales ? s.contribution / s.netSales : null), delta: pctDelta(s.netSales ? s.contribution / s.netSales : null, d.prev.netSales ? d.prev.contribution / d.prev.netSales : null) },
  ]

  return (
    <>
      <PageHeader title="Ventas" description={`${period.label} comparado con ${d.prevLabel}. Solo órdenes pagadas y no canceladas.`}>
        <PeriodPicker value={period.key} from={period.from} to={period.to} />
      </PageHeader>
      <Tabs value={tab} tabs={[{ key: 'resumen', label: 'Resumen' }, { key: 'productos', label: 'Productos' }, { key: 'clientes', label: 'Clientes' }]} />

      {tab === 'resumen' && (
        <div className="flex flex-col gap-5">
          <div className="grid grid-cols-2 md:grid-cols-5 rounded-panel border border-line bg-surface">
            {figures.map((f, i) => (
              <div key={f.label} className={`p-4 ${i > 0 ? 'border-l border-line' : ''} ${i >= 2 ? 'border-t md:border-t-0 border-line' : ''}`}>
                <p className="text-[13px] text-mute">{f.label}</p>
                <p className="num mt-1.5 text-[22px] font-semibold text-ink leading-none">{f.value}</p>
                <div className="mt-1.5"><Delta value={f.delta} hint={`vs ${d.prevLabel}`} /></div>
              </div>
            ))}
          </div>
          {(s.pending > 0 || s.cancelled > 0) && (
            <p className="text-[13px] text-mute">Fuera de estos números: {int(s.pending)} órdenes con pago pendiente y {int(s.cancelled)} canceladas.</p>
          )}
          <div className="grid lg:grid-cols-2 gap-5">
            <Panel title="Medios de pago" description="Ventas netas y comisión estimada de la pasarela">
              <Bars rows={d.payments} note={(r) => r.extra ? `Comisión estimada ${money(r.extra)}` : 'Sin comisión configurada'} />
            </Panel>
            <Panel title="Envíos" description="Cuánto te cuesta cada método (lo que pagás menos lo que cobrás)">
              <Bars rows={d.shipping} value="orders" note={(r) => `${(r.extra || 0) > 0 ? 'Pagás' : 'Cobrás'} ${money(Math.abs(r.extra || 0))} netos en total`} />
            </Panel>
            <Panel title="Provincias" description="Las 10 con más ventas">
              <Bars rows={d.provinces} />
            </Panel>
            <Panel title="Día de la semana" description="Ventas netas por día">
              <Bars rows={d.weekdays} />
            </Panel>
          </div>
        </div>
      )}

      {tab === 'productos' && (
        <Panel padded={false} title="Productos" description="Margen bruto = ventas netas del producto − costo de mercadería. Los días de stock usan el ritmo de las últimas 2 semanas.">
          {d.products.length === 0 ? <div className="px-5"><Empty title="Sin ventas en este período" /></div> : (
            <div className="overflow-x-auto">
              <table className="w-full text-[13.5px] min-w-[760px]">
                <thead><tr className="text-mute text-left border-y border-line bg-sunken/60">
                  <th className="font-medium px-5 py-2">Producto</th>
                  <th className="font-medium px-2 py-2 text-right">Unidades</th>
                  <th className="font-medium px-2 py-2 text-right">Ventas netas</th>
                  <th className="font-medium px-2 py-2 text-right">Costo</th>
                  <th className="font-medium px-2 py-2 text-right">Margen bruto</th>
                  <th className="font-medium px-2 py-2 text-right">Stock</th>
                  <th className="font-medium px-5 py-2 text-right">Días de stock</th>
                </tr></thead>
                <tbody className="divide-y divide-line">
                  {d.products.map((p) => (
                    <tr key={p.id}>
                      <td className="px-5 py-2.5 text-ink max-w-[320px]">
                        <span className="truncate block" title={p.name}>{p.name}</span>
                        {p.costSource === 'estimated' && <Badge tone="warn" title="Cargá el costo en Ajustes → Costos">costo estimado</Badge>}
                        {p.costSource === 'platform' && <Badge title="Tomado del costo cargado en Tiendanube">costo de Tiendanube</Badge>}
                      </td>
                      <td className="px-2 py-2.5 text-right num">{int(p.units)}</td>
                      <td className="px-2 py-2.5 text-right num">{money(p.netSales)}</td>
                      <td className="px-2 py-2.5 text-right num text-mute">{money(p.cogs)}</td>
                      <td className="px-2 py-2.5 text-right num">{pct(p.margin)}</td>
                      <td className="px-2 py-2.5 text-right num">{p.stock == null ? <span className="text-faint">—</span> : int(p.stock)}</td>
                      <td className={`px-5 py-2.5 text-right num ${p.daysLeft != null && p.daysLeft < 7 ? 'text-bad font-medium' : ''}`}>{p.daysLeft == null ? <span className="text-faint">—</span> : int(p.daysLeft)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </Panel>
      )}

      {tab === 'clientes' && (
        <div className="grid md:grid-cols-2 gap-5">
          <Panel title="En este período">
            <dl className="grid grid-cols-2 gap-4 text-[13.5px]">
              <div><dt className="text-mute">Clientes nuevos</dt><dd className="num text-[22px] font-semibold">{int(d.customers.newCustomers)}</dd></div>
              <div><dt className="text-mute">Clientes que volvieron</dt><dd className="num text-[22px] font-semibold">{int(d.customers.returning)}</dd></div>
            </dl>
            <p className="mt-3 text-[13px] text-mute">Nuevo = su primera compra pagada cae dentro del período.</p>
          </Panel>
          <Panel title="Histórico" description="Desde la primera orden importada">
            <dl className="grid grid-cols-2 gap-4 text-[13.5px]">
              <div><dt className="text-mute">Clientes</dt><dd className="num text-[22px] font-semibold">{int(d.customers.totalCustomers)}</dd></div>
              <div><dt className="text-mute">Compraron más de una vez</dt><dd className="num text-[22px] font-semibold">{pct(d.customers.repeatRateAllTime)}</dd></div>
              <div><dt className="text-mute">Ventas netas por cliente</dt><dd className="num text-[22px] font-semibold">{money(d.customers.ltv)}</dd></div>
              <div><dt className="text-mute">Órdenes por cliente</dt><dd className="num text-[22px] font-semibold">{d.customers.avgOrdersPerCustomer?.toLocaleString('es-AR', { maximumFractionDigits: 2 }) ?? '—'}</dd></div>
            </dl>
          </Panel>
        </div>
      )}
    </>
  )
}
