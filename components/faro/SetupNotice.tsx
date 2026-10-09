import Link from 'next/link'
import type { WorkspaceSettings } from '@/lib/faro/settings'
import type { SalesSummary } from '@/lib/faro/metrics'
import { pct } from '@/lib/faro/format'

/** Avisa qué parte de la ganancia se calcula con supuestos, y cómo dejar de estimar. */
export default function SetupNotice({ settings, sales }: { settings: WorkspaceSettings; sales: SalesSummary }) {
  const gaps: string[] = []
  if (sales.cogsCoverage.estimated > 0.02) gaps.push(`${pct(sales.cogsCoverage.estimated)} de las unidades no tiene costo cargado (se estima como ${settings.cost_fallback_pct}% del precio)`)
  if (sales.paymentFeesUnknownShare > 0.02) gaps.push(`${pct(sales.paymentFeesUnknownShare)} de las ventas no tiene comisión de pago configurada (se toma 0%)`)
  if (!settings.configured) gaps.push(`la inversión en anuncios suma ${settings.ad_tax_pct}% de impuestos no recuperables por régimen ${settings.tax_regime === 'responsable_inscripto' ? 'responsable inscripto' : 'monotributo'}: confirmalo`)
  if (!gaps.length) return null
  return (
    <div className="rounded-panel border border-warn/40 bg-warn/10 px-5 py-3 text-[13.5px] text-ink">
      <p className="font-medium">La ganancia todavía usa supuestos</p>
      <ul className="mt-1 list-disc pl-5 text-mute">
        {gaps.map((g) => <li key={g}>{g}</li>)}
      </ul>
      <Link href="/ajustes?tab=costos" className="inline-block mt-2 font-medium underline underline-offset-2">Completar costos y comisiones</Link>
    </div>
  )
}
