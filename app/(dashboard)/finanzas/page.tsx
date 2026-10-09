import { redirect } from 'next/navigation'
import { getRequestContext, canEdit } from '@/lib/faro/context'
import { loadPnL, PnL } from '@/lib/faro/pnl'
import { localDate, monthLabel } from '@/lib/faro/dates'
import { PageHeader, Panel, Tabs, Explain, Badge } from '@/components/faro/ui'
import { money, pct } from '@/lib/faro/format'
import MonthPicker from '@/components/faro/finance/MonthPicker'
import CloseMonth from '@/components/faro/finance/CloseMonth'
import CostTable from '@/components/faro/finance/CostTable'
import ResultChart from '@/components/faro/finance/ResultChart'

export const dynamic = 'force-dynamic'
export const maxDuration = 60

function Line({ label, value, net, kind = 'cost', note, strong, tag }: { label: React.ReactNode; value: number; net: number; kind?: 'income' | 'cost' | 'total'; note?: React.ReactNode; strong?: boolean; tag?: React.ReactNode }) {
  const shown = kind === 'cost' ? -Math.abs(value) : value
  return (
    <tr className={kind === 'total' ? 'bg-sunken/70' : ''}>
      <td className={`py-2.5 pl-5 pr-2 ${kind === 'total' ? 'font-semibold text-ink' : kind === 'cost' ? 'pl-9 text-ink' : 'text-ink'}`}>
        <div className="flex items-center gap-2 flex-wrap">{label}{tag}</div>
        {note && <p className="text-[12px] text-mute mt-0.5 font-normal">{note}</p>}
      </td>
      <td className={`py-2.5 px-2 text-right num whitespace-nowrap ${strong ? 'font-semibold' : ''} ${kind === 'total' ? (value < 0 ? 'text-bad' : 'text-ink') : kind === 'cost' ? 'text-mute' : 'text-ink'}`}>{money(shown)}</td>
      <td className="py-2.5 pr-5 pl-2 text-right num text-faint w-20">{net > 0 ? pct(Math.abs(shown) / net, 1) : ''}</td>
    </tr>
  )
}

function Statement({ p }: { p: PnL }) {
  const s = p.sales
  const n = s.netSales
  const cogsTag = s.cogsCoverage.estimated > 0.02
    ? <Badge tone="warn" title="Hay productos sin costo cargado">{pct(s.cogsCoverage.estimated)} estimado</Badge>
    : s.cogsCoverage.platform > 0.02 ? <Badge title="Parte del costo viene de Tiendanube">costo de Tiendanube</Badge> : <Badge tone="good">real</Badge>
  return (
    <table className="w-full text-[14px]">
      <tbody className="divide-y divide-line">
        <Line label="Ventas de productos a precio de lista" value={s.productsGross} net={n} kind="income" note={`${s.orders} órdenes pagadas · ${s.units} unidades`} />
        <Line label="Descuentos y promociones" value={s.discounts} net={n} />
        <Line label="Ventas netas" value={n} net={n} kind="total" />
        <Line label="Envío cobrado a clientes" value={s.shippingCustomer} net={n} kind="income" />
        <Line label="Costo de mercadería" value={s.cogs} net={n} tag={cogsTag} />
        <Line label="Envío pagado" value={s.shippingOwner} net={n} tag={<Badge tone="good">real</Badge>} />
        <Line label="Comisión de la plataforma" value={s.platformFee} net={n} />
        <Line label="Comisiones de pago" value={s.paymentFees} net={n} tag={s.paymentFeesUnknownShare > 0.02 ? <Badge tone="warn">{pct(s.paymentFeesUnknownShare)} sin configurar</Badge> : undefined} />
        <Line label="Packaging" value={s.packaging} net={n} />
        <Line label="Ingresos Brutos" value={s.iibb} net={n} />
        <Line label={<>Margen de contribución <Explain>Lo que deja cada venta antes de publicidad y fijos: ventas netas + envío cobrado − mercadería − envío pagado − comisiones − packaging − IIBB.</Explain></>} value={p.contribution} net={n} kind="total" />
        <Line label="Inversión en anuncios" value={p.ads.spend} net={n} tag={<Badge tone="good">real</Badge>} />
        <Line label="Impuestos no recuperables de la pauta" value={p.adTax} net={n} />
        <Line label="Ganancia después de publicidad" value={p.profitAfterAds} net={n} kind="total" />
        {p.fixed.map((f, i) => <Line key={`f${i}`} label={f.name} value={f.amount} net={n} note="Fijo" />)}
        {p.extra.map((e, i) => <Line key={`e${i}`} label={e.description || e.category} value={e.amount} net={n} note="Costo del mes" />)}
        <Line label="Resultado operativo" value={p.operatingResult} net={n} kind="total" strong />
      </tbody>
    </table>
  )
}

export default async function FinanzasPage({ searchParams }: { searchParams: { m?: string; tab?: string } }) {
  const ctx = await getRequestContext()
  if (!ctx) redirect('/login')
  const tz = ctx.workspace.timezone
  const thisMonth = localDate(new Date(), tz).slice(0, 7)
  const month = searchParams.m && /^\d{4}-\d{2}$/.test(searchParams.m) && searchParams.m <= thisMonth ? searchParams.m : thisMonth
  const tab = ['resultado', 'fijos', 'caja'].includes(searchParams.tab || '') ? searchParams.tab! : 'resultado'
  const year = Number(month.slice(0, 4))
  const lastMonthOfYear = year === Number(thisMonth.slice(0, 4)) ? Number(thisMonth.slice(5)) : 12
  const months = Array.from({ length: lastMonthOfYear }, (_, i) => `${year}-${String(i + 1).padStart(2, '0')}`)

  let body: React.ReactNode = null
  if (tab === 'resultado') {
    const all = await loadPnL({
      workspaceId: ctx.workspace.id, tz, settings: ctx.workspace.settings,
      storeIds: ctx.stores.filter((s) => s.active).map((s) => s.id), accountIds: ctx.adAccounts.filter((a) => a.active).map((a) => a.id),
    }, months)
    const p = all.find((x) => x.month === month)!
    const s = p.sales
    const cm = s.netSales > 0 ? p.contribution / s.netSales : null
    const kpis = [
      { label: 'Resultado operativo', value: money(p.operatingResult), tone: p.operatingResult < 0 ? 'text-bad' : 'text-ink', sub: s.netSales > 0 ? `${pct(p.operatingResult / s.netSales, 1)} de las ventas netas` : '' },
      { label: 'Margen de contribución', value: pct(cm, 1), sub: `${money(p.contribution)} antes de publicidad` },
      { label: 'Costo por compra máximo', value: money(s.orders ? p.contribution / s.orders : null), sub: 'ganancia promedio por orden antes de publicidad' },
      { label: 'Ventas para cubrir fijos', value: money(p.breakEvenSales), sub: p.breakEvenSales != null ? (s.netSales >= p.breakEvenSales ? 'superado este mes' : `faltan ${money(p.breakEvenSales - s.netSales)}`) : 'la publicidad se come el margen' },
    ]
    body = (
      <div className="flex flex-col gap-5">
        <div className="grid grid-cols-2 lg:grid-cols-4 rounded-panel border border-line bg-surface">
          {kpis.map((k, i) => (
            <div key={k.label} className={`p-4 lg:p-5 ${i % 2 === 1 ? 'border-l border-line' : ''} ${i >= 2 ? 'border-t lg:border-t-0 border-line' : ''} ${i === 2 ? 'lg:border-l' : ''}`}>
              <p className="text-[13px] text-mute">{k.label}</p>
              <p className={`num mt-2 text-[24px] font-semibold leading-none ${k.tone || 'text-ink'}`}>{k.value}</p>
              <p className="mt-2 text-[12.5px] text-mute">{k.sub}</p>
            </div>
          ))}
        </div>
        <div className="grid lg:grid-cols-[1.25fr_1fr] gap-5 items-start">
          <Panel title={`Estado de resultados · ${monthLabel(month)}`} description={p.closed ? 'Mes cerrado: los números quedaron congelados.' : month === thisMonth ? 'Mes en curso, se actualiza con cada venta.' : 'Calculado desde las órdenes y la inversión reales.'} padded={false} actions={canEdit(ctx) && month < thisMonth ? <CloseMonth month={month} closed={p.closed} /> : undefined}>
            <Statement p={p} />
          </Panel>
          <Panel title={`Resultado por mes · ${year}`} description="Barras: resultado operativo. Línea: ventas netas.">
            <ResultChart data={all.map((m) => ({ month: m.month, result: m.operatingResult, net: m.sales.netSales, closed: m.closed }))} selected={month} />
            <table className="w-full mt-4 text-[13px]">
              <thead><tr className="text-mute text-left border-b border-line"><th className="font-medium py-1.5">Mes</th><th className="font-medium py-1.5 text-right">Ventas netas</th><th className="font-medium py-1.5 text-right">Publicidad</th><th className="font-medium py-1.5 text-right">Resultado</th></tr></thead>
              <tbody className="divide-y divide-line">
                {[...all].reverse().map((m) => (
                  <tr key={m.month} className={m.month === month ? 'bg-beacon/10' : ''}>
                    <td className="py-1.5"><a href={`?m=${m.month}`} className="hover:underline">{monthLabel(m.month)}</a>{m.closed && <span className="ml-1.5 text-faint text-[11.5px]">cerrado</span>}</td>
                    <td className="py-1.5 text-right num">{money(m.sales.netSales)}</td>
                    <td className="py-1.5 text-right num text-mute">{money(m.ads.spend + m.adTax)}</td>
                    <td className={`py-1.5 text-right num ${m.operatingResult < 0 ? 'text-bad' : ''}`}>{money(m.operatingResult)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </Panel>
        </div>
      </div>
    )
  } else if (tab === 'fijos') {
    body = (
      <div className="flex flex-col gap-5">
        <CostTable kind="fixed" canEdit={canEdit(ctx)} />
        <CostTable kind="extra" canEdit={canEdit(ctx)} defaultMonth={month} />
      </div>
    )
  } else {
    body = <CostTable kind="cash" canEdit={canEdit(ctx)} />
  }

  return (
    <>
      <PageHeader title="Finanzas" description="El resultado real del negocio, armado desde las órdenes, la inversión en anuncios y tus costos.">
        {tab === 'resultado' && <MonthPicker value={month} max={thisMonth} />}
      </PageHeader>
      <Tabs value={tab} tabs={[{ key: 'resultado', label: 'Resultado' }, { key: 'fijos', label: 'Costos fijos y del mes' }, { key: 'caja', label: 'Caja' }]} />
      {body}
    </>
  )
}
