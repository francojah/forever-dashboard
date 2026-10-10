'use client'

import { useState } from 'react'
import Link from 'next/link'
import type { AiReport, AiAction } from '@/lib/faro/ai'
import { Panel, Badge } from './ui'

const TIPO: Record<AiAction['tipo'], string> = {
  escalar: 'Escalar', bajar: 'Bajar', pausar: 'Pausar', estructura: 'Estructura', creativos: 'Creativos', web: 'Web y checkout', oferta: 'Oferta', medicion: 'Medición',
}
const TONE: Partial<Record<AiAction['tipo'], 'good' | 'bad' | 'warn' | 'beacon'>> = { escalar: 'good', pausar: 'bad', bajar: 'warn', creativos: 'beacon' }

export default function AiAdvisor({ initial, configured, timezone }: { initial: { report: AiReport; createdAt: string } | null; configured: boolean; timezone: string }) {
  const [data, setData] = useState(initial)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [open, setOpen] = useState<number | null>(0)

  async function run() {
    setBusy(true); setError(null)
    try {
      const r = await fetch('/api/v2/ai', { method: 'POST' })
      const j = await r.json().catch(() => ({}))
      if (!r.ok) throw new Error(j.error || 'No se pudo analizar')
      setData({ report: j.report, createdAt: j.createdAt }); setOpen(0)
    } catch (e) { setError(e instanceof Error ? e.message : 'Error') } finally { setBusy(false) }
  }

  const when = data ? new Date(data.createdAt).toLocaleString('es-AR', { timeZone: timezone, day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' }) : null
  return (
    <Panel
      title="Plan sugerido por IA"
      description={data ? `Análisis del ${when}, con los últimos 7 y 30 días. Revisá cada cambio antes de aplicarlo.` : 'Lee la estructura de campañas, los creativos, el embudo y tus márgenes, y propone qué escalar, qué corregir y qué publicar.'}
      actions={configured ? <button onClick={run} disabled={busy} className="rounded-lg border border-line bg-surface px-3 py-1.5 text-[13px] font-medium hover:bg-sunken disabled:opacity-60">{busy ? 'Analizando… (hasta 1 min)' : data ? 'Volver a analizar' : 'Analizar ahora'}</button> : undefined}
    >
      {!configured && <p className="text-[13.5px] text-mute">Para activarlo, cargá <code className="text-ink">ANTHROPIC_API_KEY</code> en Vercel (Settings → Environment Variables) y hacé Redeploy. Cada análisis cuesta centavos de dólar.</p>}
      {error && <p className="text-[13.5px] text-bad mb-3">{error}</p>}
      {data && (
        <div className="flex flex-col gap-4">
          <p className="text-[14px] text-ink">{data.report.resumen}</p>
          <ol className="flex flex-col divide-y divide-line border-y border-line">
            {data.report.acciones.map((a, i) => (
              <li key={i} className="py-3">
                <button onClick={() => setOpen(open === i ? null : i)} className="w-full flex items-start gap-3 text-left" aria-expanded={open === i}>
                  <span className="num text-faint text-[13px] w-4 pt-0.5">{i + 1}</span>
                  <span className="flex-1">
                    <span className="flex flex-wrap items-center gap-2">
                      <Badge tone={TONE[a.tipo]}>{TIPO[a.tipo] || a.tipo}</Badge>
                      {a.prioridad === 1 && <Badge tone="bad">urgente</Badge>}
                      <span className="text-[14px] font-medium text-ink">{a.titulo}</span>
                    </span>
                    <span className="block mt-1 text-[13px] text-mute">{a.por_que}</span>
                  </span>
                </button>
                {open === i && (
                  <div className="mt-2 ml-7 flex flex-col gap-2 text-[13px]">
                    {a.como?.length > 0 && <ul className="list-disc pl-4 text-ink flex flex-col gap-0.5">{a.como.map((c, k) => <li key={k}>{c}</li>)}</ul>}
                    <p><span className="text-mute">Impacto:</span> {a.impacto}</p>
                    <p><span className="text-mute">Riesgo:</span> {a.riesgo}</p>
                    {a.objetivo?.id && <Link href={`/anuncios?tab=campanias&focus=${a.objetivo.id}`} className="text-mute hover:text-ink underline w-fit">Abrir {a.objetivo.nombre} en la tabla</Link>}
                  </div>
                )}
              </li>
            ))}
          </ol>
          <div className="grid md:grid-cols-2 gap-4 text-[13px]">
            {data.report.publicar?.length > 0 && (
              <div><p className="font-medium text-ink mb-1">Qué publicar esta semana</p><ul className="list-disc pl-4 text-ink flex flex-col gap-0.5">{data.report.publicar.map((p, i) => <li key={i}>{p}</li>)}</ul></div>
            )}
            {data.report.no_tocar?.length > 0 && (
              <div><p className="font-medium text-ink mb-1">No tocar</p><ul className="list-disc pl-4 text-mute flex flex-col gap-0.5">{data.report.no_tocar.map((p, i) => <li key={i}>{p}</li>)}</ul></div>
            )}
          </div>
        </div>
      )}
    </Panel>
  )
}
