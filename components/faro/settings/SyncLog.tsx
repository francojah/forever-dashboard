import { Panel, Badge, Empty } from '../ui'

const SRC: Record<string, string> = { tiendanube: 'Tiendanube', meta: 'Meta', webhook: 'Venta nueva (webhook)', meta_insights: 'Meta', meta_entities: 'Meta' }

export default function SyncLog({ rows, timezone }: { rows: { source: string; status: string; rows: number | null; ms: number | null; error: string | null; created_at: string }[]; timezone: string }) {
  return (
    <Panel title="Últimas actualizaciones" description="Cada vez que Faro trae datos de Tiendanube o Meta. Si algo falla, el error queda acá." padded={false}>
      {rows.length === 0 ? <div className="px-5"><Empty title="Todavía no hubo actualizaciones" /></div> : (
        <table className="w-full text-[13.5px]">
          <tbody className="divide-y divide-line border-t border-line">
            {rows.map((r, i) => (
              <tr key={i}>
                <td className="px-5 py-2 text-mute num whitespace-nowrap">{new Date(r.created_at).toLocaleString('es-AR', { timeZone: timezone, day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit', second: '2-digit' })}</td>
                <td className="px-2 py-2 text-ink">{SRC[r.source] || r.source}</td>
                <td className="px-2 py-2">{r.status === 'ok' ? <Badge tone="good">ok</Badge> : <Badge tone="bad">error</Badge>}</td>
                <td className="px-2 py-2 text-right num text-mute">{r.rows != null ? `${r.rows} filas` : ''}</td>
                <td className="px-5 py-2 text-right num text-mute">{r.ms != null ? `${(r.ms / 1000).toLocaleString('es-AR', { maximumFractionDigits: 1 })} s` : ''}</td>
                <td className="px-5 py-2 text-bad text-[12.5px] max-w-[360px] truncate" title={r.error || ''}>{r.error}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </Panel>
  )
}
