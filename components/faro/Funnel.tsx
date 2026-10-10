import { FunnelStep, FunnelData, weakest } from '@/lib/faro/funnel'
import { Panel, Badge, Explain } from './ui'
import { int, pct, money } from '@/lib/faro/format'

function status(s: FunnelStep): { tone: 'good' | 'warn' | 'bad' | undefined; label: string } | null {
  if (s.rate == null || !s.ref) return null
  if (s.rate < s.ref[0]) return { tone: 'bad', label: 'bajo' }
  if (s.rate >= s.ref[1]) return { tone: 'good', label: 'bueno' }
  return { tone: undefined, label: 'normal' }
}

function Steps({ steps, prevLabel }: { steps: FunnelStep[]; prevLabel: string }) {
  const top = Math.max(1, steps[0]?.value || 1)
  return (
    <ol className="flex flex-col gap-3">
      {steps.map((s, i) => {
        const st = status(s)
        const delta = s.rate != null && s.prevRate != null && s.prevRate > 0 ? s.rate / s.prevRate - 1 : null
        const width = i === 0 ? 100 : Math.max(1.5, Math.sqrt(s.value / top) * 100)
        return (
          <li key={s.key} className="text-[13.5px]">
            <div className="flex items-baseline justify-between gap-3">
              <span className="text-ink">{s.label}</span>
              <span className="num text-ink font-medium">{int(s.value)}</span>
            </div>
            <div className="mt-1 h-2 rounded-full bg-sunken"><div className={`h-full rounded-full ${st?.tone === 'bad' ? 'bg-bad/70' : 'bg-ink/40'}`} style={{ width: `${width}%` }} /></div>
            {s.rate != null && (
              <div className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-1 text-[12.5px] text-mute">
                <span><span className="num text-ink">{pct(s.rate, 1)}</span> del paso anterior</span>
                {st && <Badge tone={st.tone}>{st.label}</Badge>}
                {s.ref && <span className="text-faint">referencia {pct(s.ref[0], 1)}–{pct(s.ref[1], 1)}</span>}
                {delta != null && Math.abs(delta) >= 0.05 && <span className={delta > 0 ? 'text-good' : 'text-bad'}>{delta > 0 ? '▲' : '▼'} {pct(Math.abs(delta), 0)} vs {prevLabel.toLowerCase()}</span>}
              </div>
            )}
          </li>
        )
      })}
    </ol>
  )
}

export default function Funnel({ steps, cur, prevLabel, adminUrl }: { steps: { ads: FunnelStep[]; store: FunnelStep[] }; cur: FunnelData; prevLabel: string; adminUrl: string | null }) {
  const w = weakest([...steps.ads, ...steps.store])
  const S = cur.store
  const metaShare = S.ordersPaid > 0 ? cur.ads.purchases / S.ordersPaid : null
  return (
    <div className="flex flex-col gap-5">
      <div className={`rounded-panel border px-5 py-4 ${w ? 'border-bad/30 bg-bad/5' : 'border-good/30 bg-good/5'}`}>
        <p className="text-[13px] text-mute">Dónde se traba la compra</p>
        {w ? (
          <>
            <p className="mt-1 text-[16px] font-semibold text-ink">{w.label}: {pct(w.rate, 1)} <span className="font-normal text-mute text-[14px]">(referencia desde {pct(w.ref![0], 1)})</span></p>
            <p className="mt-1 text-[13.5px] text-ink">{w.hint}</p>
          </>
        ) : <p className="mt-1 text-[15px] text-ink">Ningún paso está por debajo de la referencia en este período.</p>}
      </div>

      <div className="grid lg:grid-cols-2 gap-5 items-start">
        <Panel title={<>Desde los anuncios <Explain>Lo que mide el píxel de Meta para la gente que llegó desde anuncios. Visitas = landing page views (la página llegó a cargar).</Explain></>} description="Cada porcentaje es sobre el paso anterior.">
          <Steps steps={steps.ads} prevLabel={prevLabel} />
        </Panel>
        <div className="flex flex-col gap-5">
          <Panel title={<>En la tienda <Explain>Todo el tráfico, no solo el de anuncios. Checkouts iniciados = órdenes creadas + checkouts abandonados que registra Tiendanube.</Explain></>} description="Datos de Tiendanube.">
            <Steps steps={steps.store} prevLabel={prevLabel} />
          </Panel>
          <Panel title="Plata que quedó en el camino">
            <dl className="grid grid-cols-2 gap-4 text-[13.5px]">
              <div>
                <dt className="text-mute">Checkouts abandonados</dt>
                <dd className="num text-[20px] font-semibold text-ink mt-1">{money(S.abandonedValue)}</dd>
                <dd className="text-[12.5px] text-mute">{int(S.abandoned)} carritos · {pct(S.abandoned ? S.abandonedWithEmail / S.abandoned : null)} dejó su mail</dd>
              </div>
              <div>
                <dt className="text-mute">Órdenes sin pagar</dt>
                <dd className="num text-[20px] font-semibold text-ink mt-1">{money(S.unpaidValue)}</dd>
                <dd className="text-[12.5px] text-mute">{int(S.unpaid)} órdenes pendientes · {int(S.cancelled)} canceladas</dd>
              </div>
            </dl>
            {adminUrl && <a href={adminUrl} target="_blank" rel="noreferrer" className="mt-3 inline-block text-[13px] text-mute hover:text-ink underline">Ver carritos abandonados en Tiendanube</a>}
            {S.partial && <p className="mt-2 text-[12px] text-warn">No se pudieron leer todos los carritos abandonados: el monto puede ser mayor.</p>}
          </Panel>
          {metaShare != null && (
            <p className="text-[12.5px] text-mute px-1">Meta se atribuye {int(cur.ads.purchases)} de las {int(S.ordersPaid)} órdenes pagadas ({pct(metaShare)}). La diferencia son ventas orgánicas, de otros canales o que Meta no pudo medir.</p>
          )}
        </div>
      </div>
    </div>
  )
}
