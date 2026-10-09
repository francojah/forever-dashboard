import { Delta, Explain } from './ui'
import { money, ratio, pct, int } from '@/lib/faro/format'
import { pctDelta, PeriodSummary } from '@/lib/faro/metrics'

/**
 * Los cuatro números del inicio, en una sola franja (no tarjetas sueltas).
 * Cada uno explica su fórmula con los valores reales usados.
 */
export default function KpiStrip({ cur, before, prevLabel, currency }: { cur: PeriodSummary; before: PeriodSummary; prevLabel: string; currency: string }) {
  const s = cur.sales
  const items = [
    {
      label: 'Ventas netas',
      value: money(s.netSales, { currency }),
      sub: `${int(s.orders)} órdenes · ticket ${money(cur.aov, { currency })}`,
      delta: pctDelta(s.netSales, before.sales.netSales), up: true,
      explain: <>Lo cobrado por productos, sin el envío: {money(s.netSales + s.shippingCustomer)} cobrados − {money(s.shippingCustomer)} de envío. Ya descuenta {money(s.discounts)} de promociones. Solo órdenes pagadas y no canceladas.</>,
    },
    {
      label: 'Ganancia después de publicidad',
      value: money(cur.profitAfterAds, { currency }),
      sub: cur.contributionMargin != null ? `${pct(cur.sales.netSales > 0 ? cur.profitAfterAds / cur.sales.netSales : null)} de las ventas` : '—',
      delta: pctDelta(cur.profitAfterAds, before.profitAfterAds), up: true,
      tone: cur.profitAfterAds < 0 ? 'text-bad' : undefined,
      explain: <>Margen de contribución {money(s.contribution)} (ventas − mercadería − envíos − comisiones − packaging − IIBB) menos inversión en anuncios {money(cur.ads.spend)} y sus impuestos no recuperables {money(cur.adTax)}. No incluye costos fijos: esos están en Finanzas.</>,
    },
    {
      label: 'MER',
      value: ratio(cur.mer),
      sub: cur.breakevenMer != null ? `equilibrio ${ratio(cur.breakevenMer)}` : 'sin equilibrio calculado',
      delta: pctDelta(cur.mer, before.mer), up: true,
      tone: cur.mer != null && cur.breakevenMer != null ? (cur.mer >= cur.breakevenMer ? 'text-good' : 'text-bad') : undefined,
      explain: <>Ventas netas ÷ inversión total en anuncios: {money(s.netSales)} ÷ {money(cur.adCost)}. Incluye ventas orgánicas. Por debajo de {ratio(cur.breakevenMer)} (1 ÷ margen de contribución) la publicidad cuesta más de lo que deja.</>,
    },
    {
      label: 'Costo por compra',
      value: money(cur.cpa, { currency }),
      sub: cur.maxCpa != null ? `máximo rentable ${money(cur.maxCpa, { currency })}` : `${int(cur.ads.purchases)} compras`,
      delta: pctDelta(cur.cpa, before.cpa), up: false,
      tone: cur.cpa != null && cur.maxCpa != null ? (cur.cpa <= cur.maxCpa ? 'text-good' : 'text-bad') : undefined,
      explain: <>Inversión en anuncios ÷ compras que atribuye Meta: {money(cur.adCost)} ÷ {int(cur.ads.purchases)}. El máximo es la ganancia promedio por orden antes de publicidad ({money(cur.maxCpa)}). ROAS que informa Meta: {ratio(cur.roasMeta)}.</>,
    },
  ]
  return (
    <div className="grid grid-cols-2 lg:grid-cols-4 rounded-panel border border-line bg-surface divide-line [&>*]:border-line">
      {items.map((it, i) => (
        <div key={it.label} className={`p-4 lg:p-5 ${i % 2 === 1 ? 'border-l' : ''} ${i >= 2 ? 'border-t lg:border-t-0' : ''} ${i === 2 ? 'lg:border-l' : ''}`}>
          <div className="flex items-center gap-1.5 text-[13px] text-mute">
            <span>{it.label}</span>
            <Explain>{it.explain}</Explain>
          </div>
          <p className={`num mt-2 text-[24px] lg:text-[28px] font-semibold leading-none tracking-tight ${it.tone || 'text-ink'}`}>{it.value}</p>
          <p className="mt-2 text-[12.5px] text-mute">{it.sub}</p>
          <div className="mt-1"><Delta value={it.delta} goodWhenUp={it.up} hint={`vs ${prevLabel}`} /></div>
        </div>
      ))}
    </div>
  )
}
