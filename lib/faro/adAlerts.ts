import { unstable_cache } from 'next/cache'
import { graphGet, getMetaToken } from './meta'

export interface AdAlert {
  id: string
  level: 'critical' | 'warning' | 'info'
  account: string
  title: string
  detail: string
  targetId?: string
}

const ACCOUNT_STATUS: Record<number, string> = {
  2: 'Cuenta deshabilitada', 3: 'Pago pendiente (cuenta sin saldar)', 7: 'En revisión de riesgo por Meta', 8: 'Pago en proceso de cobro',
  9: 'En período de gracia por un pago', 100: 'Cierre pendiente', 101: 'Cuenta cerrada',
}

type Acc = { id: string; name: string; external_id: string; connection_id: string | null }

async function fetchAlerts(acc: Acc): Promise<AdAlert[]> {
  const out: AdAlert[] = []
  const token = await getMetaToken(acc.connection_id)
  const [info, adsets, ads] = await Promise.all([
    graphGet<{ account_status?: number; spend_cap?: string; amount_spent?: string }>(acc.external_id, token, { fields: 'account_status,spend_cap,amount_spent' }).catch(() => null),
    graphGet<{ data?: { id: string; name: string; learning_stage_info?: { status?: string } }[] }>(`${acc.external_id}/adsets`, token, { fields: 'id,name,learning_stage_info', effective_status: '["ACTIVE"]', limit: '100' }).catch(() => null),
    graphGet<{ data?: { id: string; name: string; effective_status: string; adset?: { effective_status?: string; name?: string }; issues_info?: { error_summary?: string }[] }[] }>(`${acc.external_id}/ads`, token, {
      fields: 'id,name,effective_status,issues_info,adset{effective_status,name}', effective_status: '["DISAPPROVED","WITH_ISSUES"]', limit: '50',
    }).catch(() => null),
  ])
  if (info?.account_status && info.account_status !== 1) {
    out.push({ id: `acc-${acc.id}`, level: 'critical', account: acc.name, title: ACCOUNT_STATUS[info.account_status] || `Estado de cuenta ${info.account_status}`, detail: 'Los anuncios de esta cuenta pueden estar frenados. Revisalo en Ads Manager → Facturación.' })
  }
  const cap = Number(info?.spend_cap || 0), spent = Number(info?.amount_spent || 0)
  if (cap > 0 && spent / cap >= 0.9) {
    out.push({ id: `cap-${acc.id}`, level: spent >= cap ? 'critical' : 'warning', account: acc.name, title: spent >= cap ? 'Se alcanzó el límite de gasto de la cuenta' : 'Cerca del límite de gasto de la cuenta', detail: `Usado ${Math.round((spent / cap) * 100)}% del límite. Al llegar al 100% Meta frena todos los anuncios.` })
  }
  for (const s of adsets?.data || []) {
    if (s.learning_stage_info?.status === 'FAIL') out.push({ id: `learn-${s.id}`, level: 'warning', account: acc.name, title: `Aprendizaje limitado: ${s.name}`, detail: 'No llega a ~50 conversiones por semana. Suele mejorar juntando ad sets o con más presupuesto.', targetId: s.id })
  }
  // Solo anuncios de ad sets activos: los viejos rechazados en estructuras apagadas no importan
  const live = (ads?.data || []).filter((a) => a.adset?.effective_status === 'ACTIVE')
  for (const a of live.slice(0, 8)) {
    const why = a.issues_info?.[0]?.error_summary
    out.push({ id: `ad-${a.id}`, level: a.effective_status === 'DISAPPROVED' ? 'critical' : 'warning', account: acc.name,
      title: `${a.effective_status === 'DISAPPROVED' ? 'Anuncio rechazado' : 'Anuncio con problemas'}: ${a.name}`, detail: why || (a.effective_status === 'DISAPPROVED' ? 'Meta lo rechazó: revisá el motivo y pedí revisión o reemplazalo.' : 'Meta reporta un problema de entrega.'), targetId: a.id })
  }
  if (live.length > 8) out.push({ id: `ad-more-${acc.id}`, level: 'info', account: acc.name, title: `${live.length - 8} anuncios más con problemas`, detail: 'Filtrá por estado en la tabla de anuncios para verlos.' })
  return out
}

/** Alertas de las cuentas (cache de 15 min para cuidar el límite de llamadas de Meta). */
export async function loadAdAlerts(accounts: Acc[]): Promise<AdAlert[]> {
  const lists = await Promise.all(accounts.map((a) =>
    unstable_cache(() => fetchAlerts(a).catch(() => []), ['ad-alerts', a.id], { revalidate: 900 })()))
  const rank = { critical: 0, warning: 1, info: 2 }
  return lists.flat().sort((a, b) => rank[a.level] - rank[b.level])
}
