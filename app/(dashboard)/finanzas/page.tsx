import { redirect } from 'next/navigation'
import { getRequestContext, canEdit } from '@/lib/faro/context'
import { loadPnL, PnL, scalePnL } from '@/lib/faro/pnl'
import { localDate, monthLabel } from '@/lib/faro/dates'
import { PageHeader, Panel, Tabs, Explain, Badge } from '@/components/faro/ui'
import { money, pct } from '@/lib/faro/format'
import MonthPicker from '@/components/faro/finance/MonthPicker'
import CloseMonth from '@/components/faro/finance/CloseMonth'
import CostTable from '@/components/faro/finance/CostTable'
import ResultChart from '@/components/faro/finance/ResultChart'
import { costChecks, projectMonth } from '@/lib/faro/costCheck'
import { loadMacro, makeAdjuster, parseMode } from '@/lib/faro/macro'
import MoneyMode from '@/components/faro/finance/MoneyMode'

export const dynamic = 'force-dynamic'
export const maxDuration = 60

function Line({ label, value, net, kind = 'cost', note, strong, tag, noPct, cur = 'ARS' }: { cur?: string; label: React.ReactNode; value: number; net: number; kind?: 'income' | 'cost' | 'total'; note?: React.ReactNode; strong?: boolean; tag?: React.ReactNode; noPct?: boolean }) {
  const shown = kind === 'cost' ? -Math.abs(value) : value
  return (
    <tr className={kind === 'total' ? 'bg-sunken/70' : ''}>
      <td className={`py-2.5 pl-5 pr-2 ${kind === 'total' ? 'font-semibold text-ink' : kind === 'cost' ? 'pl-9 text-ink' : 'text-ink'}`}>
        <div className="flex items-center gap-2 flex-wrap">{label}{tag}</div>
        {note && <p className="text-[12px] text-mute mt-0.5 font-normal">{note}</p>}
      </td>
      <td className={`py-2.5 px-2 text-right num whitespace-nowrap ${strong ? 'font-semibold' : ''} ${kind === 'total' ? (value < 0 ? 'text-bad' : 'text-ink') : kind === 'cost' ? 'text-mute' : 'text-ink'}`}>{money(shown, { currency: cur })}</td>
      <td className="py-2.5 pr-5 pl-2 text-right num text-faint w-20">{net > 0 && !noPct ? pct(Math.abs(shown) / net, 1) : ''}</td>
    </tr>
  )
}

function Statement({ p, noAds, cur = 'ARS' }: { p: PnL; noAds?: boolean; cur?: string }) {
  const s = p.sales
  const n = s.netSales
  const cogsTag = s.cogsCoverage.estimated > 0.02
    ? <Badge tone="warn" title="Hay productos sin costo cargado">{pct(s.cogsCoverage.estimated)} estimado</Badge>
    : s.cogsCoverage.platform > 0.02 ? <Badge title="Parte del costo viene de Tiendanube">costo de Tiendanube</Badge> : <Badge tone="good">real</Badge>
  return (
    <table className="w-full text-[14px]">
      <tbody className="divide-y divide-line">
        <Line cur={cur} noPct label={<>Facturación <Explain>Lo cobrado en órdenes pagadas, envío incluido. Es el número que muestra Tiendanube. Abajo se separa en productos y envío.</Explain></>} value={n + s.shippingCustomer} net={n} kind="total" note={`${s.orders} órdenes pagadas · ${money(n, { currency: cur })} productos + ${money(s.shippingCustomer, { currency: cur })} envío`} />
        <Line cur={cur} noPct label="Ventas de productos a precio de lista" value={s.productsGross} net={n} kind="income" note={`${s.units} unidades`} />
        <Line cur={cur} noPct label="Descuentos y promociones" value={s.discounts} net={n} note={s.productsGross > 0 ? `${pct(s.discounts / s.productsGross)} del precio de lista` : undefined} />
        <Line cur={cur} label="Ventas netas de productos" value={n} net={n} kind="total" note="Base de los porcentajes de esta tabla" />
        <Line cur={cur} label="Envío cobrado a clientes" value={s.shippingCustomer} net={n} kind="income" />
        <Line cur={cur} label="Costo de mercadería" value={s.cogs} net={n} tag={cogsTag} />
        <Line cur={cur} label="Envío pagado" value={s.shippingOwner} net={n} tag={<Badge title="Costo de envío que informa Tiendanube en cada orden">según Tiendanube</Badge>} />
        <Line cur={cur} label="Comisión de la plataforma" value={s.platformFee} net={n} />
        <Line cur={cur} label="Comisiones de pago" value={s.paymentFees} net={n} tag={s.paymentFeesUnknownShare > 0.02 ? <Badge tone="warn">{pct(s.paymentFeesUnknownShare)} sin configurar</Badge> : undefined} />
        <Line cur={cur} label="Packaging" value={s.packaging} net={n} />
        <Line cur={cur} label="Ingresos Brutos" value={s.iibb} net={n} />
        <Line cur={cur} label={<>Margen de contribución <Explain>Lo que deja cada venta antes de publicidad y fijos: ventas netas + envío cobrado − mercadería − envío pagado − comisiones − packaging − IIBB.</Explain></>} value={p.contribution} net={n} kind="total" />
        <Line cur={cur} label="Inversión en anuncios" value={p.ads.spend} net={n} tag={noAds ? <Badge tone="warn">sin datos de Meta para este mes</Badge> : <Badge tone="good">real</Badge>} />
        <Line cur={cur} label="Impuestos no recuperables de la pauta" value={p.adTax} net={n} />
        <Line cur={cur} label="Ganancia después de publicidad" value={p.profitAfterAds} net={n} kind="total" />
        {p.fixed.map((f, i) => <Line cur={cur} key={`f${i}`} label={f.name} value={f.amount} net={n} note="Fijo" />)}
        {p.extra.map((e, i) => <Line cur={cur} key={`e${i}`} label={e.description || e.category} value={e.amount} net={n} note="Costo del mes" />)}
        <Line cur={cur} label="Resultado operativo" value={p.operatingResult} net={n} kind="total" strong />
      </tbody>
    </table>
  )
}

export default async function FinanzasPage({ searchParams }: { searchParams: { m?: string; tab?: string; moneda?: string } }) {
  const ctx = await getRequestContext()
  if (!ctx) redirect('/login')
  const tz = ctx.workspace.timezone
  const thisMonth = localDate(new Date(), tz).slice(0, 7)
  const month = searchParams.m && /^\d{4}-\d{2}$/.test(searchParams.m) && searchParams.m <= thisMonth ? searchParams.m : thisMonth
  const tab = ['resultado', 'fijos', 'caja'].includes(searchParams.tab || '') ? searchParams.tab! : 'resultado'
  const year = Number(month.slice(0, 4))
  const lastMonthOfYear = year === Number(thisMonth.slice(0, 4)) ? Number(thisMonth.slice(5)) : 12
  const months = Array.from({ length: lastMonthOfYear }, (_, i) => `${year}-${String(i + 1).padStart(2, '0')}`)

  const mode = parseMode(searchParams.moneda)
  let fmtCur: 'ARS' | 'USD' = 'ARS'
  const fmt = (v: number | null | undefined) => money(v, { currency: fmtCur })
  let body: React.ReactNode = null
  let modeNote: string | null = null
  if (tab === 'resultado') {
    const [allRaw, macro] = await Promise.all([loadPnL({
      workspaceId: ctx.workspace.id, tz, settings: ctx.workspace.settings,
      storeIds: ctx.stores.filter((s) => s.active).map((s) => s.id), accountIds: ctx.adAccounts.filter((a) => a.active).map((a) => a.id),
    }, months), ctx.workspace.currency === 'ARS' ? loadMacro() : Promise.resolve(null)])
    const adj = makeAdjuster(ctx.workspace.currency === 'ARS' ? mode : 'nominal', macro)
    const all = allRaw.map((x) => scalePnL(x, adj.factor(x.month)))
    fmtCur = adj.currency
    modeNote = adj.note
    const pRaw = allRaw.find((x) => x.month === month)!
    const p = all.find((x) => x.month === month)!
    const [py, pm] = month.split('-').map(Number)
    const prevMonth = pm === 1 ? `${py - 1}-12` : `${py}-${String(pm - 1).padStart(2, '0')}`
    const prevRaw = allRaw.find((x) => x.month === prevMonth) || (await loadPnL({
      workspaceId: ctx.workspace.id, tz, settings: ctx.workspace.settings,
      storeIds: ctx.stores.filter((s) => s.active).map((s) => s.id), accountIds: ctx.adAccounts.filter((a) => a.active).map((a) => a.id),
    }, [prevMonth]))[0]
    const prevP = prevRaw ? scalePnL(prevRaw, adj.factor(prevMonth)) : prevRaw
    const today = localDate(new Date(), tz)
    const proj = projectMonth(p, today)
    const checks = costChecks(pRaw, ctx.workspace.settings)
    const coverage = ctx.adAccounts.filter((a) => a.active).map((a) => a.insights_from).filter(Boolean).sort()[0] as string | undefined
    const noAdsData = (m: string) => ctx.adAccounts.some((a) => a.active) && (!coverage || `${m}-31` < coverage)
    const s = p.sales
    const cm = s.netSales > 0 ? p.contribution / s.netSales : null
    const pcm = prevP && prevP.sales.netSales > 0 ? prevP.contribution / prevP.sales.netSales : null
    const kpis = [
      { label: 'Resultado operativo', value: fmt(p.operatingResult), tone: p.operatingResult < 0 ? 'text-bad' : 'text-ink', sub: proj ? `Proyección al cierre: ${fmt(proj.result)}` : s.netSales > 0 ? `${pct(p.operatingResult / s.netSales, 1)} de las ventas netas` : '', vs: proj ? null : prevP ? { cur: p.operatingResult, prev: prevP.operatingResult } : null },
      { label: 'Margen de contribución', value: pct(cm, 1), sub: `${fmt(p.contribution)} antes de publicidad`, vs: cm != null && pcm != null ? { cur: cm, prev: pcm, pts: true } : null },
      { label: 'Costo por compra máximo', value: fmt(s.orders ? p.contribution / s.orders : null), sub: 'ganancia promedio por orden antes de publicidad', vs: null },
      { label: 'Ventas para cubrir fijos', value: fmt(p.breakEvenSales), sub: p.breakEvenSales != null ? (s.netSales >= p.breakEvenSales ? 'superado este mes' : proj ? (proj.netSales >= p.breakEvenSales ? `al ritmo actual cerrás con ${fmt(proj.netSales)}: se cubre` : `al ritmo actual cerrás con ${fmt(proj.netSales)}: no alcanza`) : `faltan ${fmt(p.breakEvenSales - s.netSales)}`) : 'la publicidad se come el margen', vs: null },
    ] as { label: string; value: string; sub: string; tone?: string; vs: { cur: number; prev: number; pts?: boolean } | null }[]
    const vsText = (v: { cur: number; prev: number; pts?: boolean }) => {
      if (v.pts) { const d = (v.cur - v.prev) * 100; return { t: `${d >= 0 ? '+' : ''}${d.toFixed(1)} pts vs ${monthLabel(prevMonth).toLowerCase()}`, good: d >= 0 } }
      const d = v.cur - v.prev
      return { t: `${d >= 0 ? '+' : '−'}${fmt(Math.abs(d))} vs ${monthLabel(prevMonth).toLowerCase()}`, good: d >= 0 }
    }
    body = (
      <div className="flex flex-col gap-5">
        <div className="grid grid-cols-2 lg:grid-cols-4 rounded-panel border border-line bg-surface">
          {kpis.map((k, i) => (
            <div key={k.label} className={`p-4 lg:p-5 ${i % 2 === 1 ? 'border-l border-line' : ''} ${i >= 2 ? 'border-t lg:border-t-0 border-line' : ''} ${i === 2 ? 'lg:border-l' : ''}`}>
              <p className="text-[13px] text-mute">{k.label}</p>
              <p className={`num mt-2 text-[24px] font-semibold leading-none ${k.tone || 'text-ink'}`}>{k.value}</p>
              <p className="mt-2 text-[12.5px] text-mute">{k.sub}</p>
              {k.vs && (() => { const v = vsText(k.vs); return <p className={`mt-1 text-[12px] num ${v.good ? 'text-good' : 'text-bad'}`}>{v.t}</p> })()}
            </div>
          ))}
        </div>
        {checks.length > 0 && (
          <Panel title="Chequeo de costos" description="Qué parte del resultado es real y qué puede estar faltando." padded={false}>
            <ul className="divide-y divide-line">
              {checks.map((c) => (
                <li key={c.key} className="px-5 py-3 flex items-start gap-3 text-[13.5px]">
                  <span className={`mt-1.5 w-2 h-2 rounded-full shrink-0 ${c.level === 'bad' ? 'bg-bad' : c.level === 'warn' ? 'bg-warn' : 'bg-good'}`} aria-hidden />
                  <div className="min-w-0 flex-1">
                    <p className="font-medium text-ink">{c.title}</p>
                    <p className="text-mute">{c.detail}{c.impact ? ` Impacto aproximado en el mes: ${fmt(c.impact)}.` : ''}</p>
                  </div>
                  {c.href && c.level !== 'ok' && <a href={c.href} className="shrink-0 rounded-md border border-line px-2.5 py-1 text-[12.5px] hover:bg-sunken">Corregir</a>}
                </li>
              ))}
            </ul>
          </Panel>
        )}
        <div className="grid lg:grid-cols-[1.25fr_1fr] gap-5 items-start">
          <Panel title={`Estado de resultados · ${monthLabel(month)}`} description={p.closed ? 'Mes cerrado: los números quedaron congelados.' : month === thisMonth ? 'Mes en curso, se actualiza con cada venta.' : 'Calculado desde las órdenes y la inversión reales.'} padded={false} actions={canEdit(ctx) && month < thisMonth ? <CloseMonth month={month} closed={p.closed} /> : undefined}>
            <Statement p={p} noAds={noAdsData(month)} cur={adj.currency} />
          </Panel>
          <Panel title={`Resultado por mes · ${year}`} description="Barras: resultado operativo. Línea: ventas netas.">
            <ResultChart data={all.map((m) => ({ month: m.month, result: m.operatingResult, net: m.sales.netSales, closed: m.closed }))} selected={month} currency={adj.currency} />
            <table className="w-full mt-4 text-[13px]">
              <thead><tr className="text-mute text-left border-b border-line"><th className="font-medium py-1.5">Mes</th><th className="font-medium py-1.5 text-right">Facturación</th><th className="font-medium py-1.5 text-right">Publicidad</th><th className="font-medium py-1.5 text-right">Resultado</th></tr></thead>
              <tbody className="divide-y divide-line">
                {[...all].reverse().map((m) => (
                  <tr key={m.month} className={m.month === month ? 'bg-beacon/10' : ''}>
                    <td className="py-1.5"><a href={`?m=${m.month}`} className="hover:underline">{monthLabel(m.month)}</a>{m.closed && <span className="ml-1.5 text-faint text-[11.5px]">cerrado</span>}</td>
                    <td className="py-1.5 text-right num">{fmt(m.sales.netSales + m.sales.shippingCustomer)}</td>
                    <td className="py-1.5 text-right num text-mute">{noAdsData(m.month) ? <span title="Meta todavía no trajo datos de este mes">sin datos</span> : fmt(m.ads.spend + m.adTax)}</td>
                    <td className={`py-1.5 text-right num ${m.operatingResult < 0 ? 'text-bad' : ''}`}>{fmt(m.operatingResult)}</td>
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
        {tab === 'resultado' && <div className="flex flex-wrap items-center gap-2">{ctx.workspace.currency === 'ARS' && <MoneyMode value={mode} />}<MonthPicker value={month} max={thisMonth} /></div>}
      </PageHeader>
      <Tabs value={tab} tabs={[{ key: 'resultado', label: 'Resultado' }, { key: 'fijos', label: 'Costos fijos y del mes' }, { key: 'caja', label: 'Caja' }]} />
      {modeNote && <p className="mb-4 -mt-2 text-[13px] text-mute">{modeNote}</p>}
      {body}
    </>
  )
}
