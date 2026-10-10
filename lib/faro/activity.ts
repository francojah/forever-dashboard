import { graphAll, getMetaToken } from './meta'
import type { FaroContext } from './context'

/** Registro de actividad de Meta: cambios hechos desde Ads Manager, apps o reglas, por cualquier usuario. */

export interface Activity {
  id: string
  at: string
  actor: string | null
  app: string | null              // vacío = Ads Manager / Meta
  level: 'campaign' | 'adset' | 'ad' | 'account' | 'other'
  objectId: string | null
  objectName: string | null
  what: string                    // descripción de Meta, en el idioma de la cuenta
  from: string | null
  to: string | null
  billing: boolean
  account: string
}

const LEVEL: Record<string, Activity['level']> = { CAMPAIGN_GROUP: 'campaign', CAMPAIGN: 'adset', ADGROUP: 'ad', ACCOUNT: 'account' }

function money(v: unknown, currency?: string) {
  const n = Number(v)
  if (!isFinite(n)) return null
  return `${currency === 'USD' ? 'US$' : '$'} ${(n / 100).toLocaleString('es-AR', { maximumFractionDigits: 0 })}`
}

function valueOf(v: unknown): string | null {
  if (v == null || v === '') return null
  if (typeof v === 'object') {
    const o = v as Record<string, unknown>
    if (o.type === 'payment_amount') {
      const amount = money(o.old_value ?? o.new_value ?? o.value, o.currency as string)
      return o.additional_value ? `${amount} (${String(o.additional_value).toLowerCase()})` : amount
    }
    return null
  }
  return String(v).slice(0, 120)
}

export function parseActivity(raw: Record<string, unknown>, account: string): Activity {
  let extra: Record<string, unknown> = {}
  try { extra = typeof raw.extra_data === 'string' ? JSON.parse(raw.extra_data) : (raw.extra_data as Record<string, unknown>) || {} } catch { /* texto libre */ }
  const ev = String(raw.event_type || '')
  return {
    id: `${raw.event_time}-${raw.object_id}-${ev}`,
    at: String(raw.event_time || ''),
    actor: (raw.actor_name as string) || null,
    app: (raw.application_name as string) || null,
    level: LEVEL[String(raw.object_type)] || 'other',
    objectId: raw.object_id ? String(raw.object_id) : null,
    objectName: (raw.object_name as string) || null,
    what: String(raw.translated_event_type || ev.replace(/_/g, ' ')),
    from: valueOf(extra.old_value),
    to: valueOf(extra.new_value),
    billing: /billing|funding|payment|spend_limit/.test(ev),
    account,
  }
}

export async function loadActivities(ctx: FaroContext, days: number): Promise<{ rows: Activity[]; errors: string[] }> {
  const since = String(Math.floor(Date.now() / 1000) - days * 86400)
  const errors: string[] = []
  const lists = await Promise.all(ctx.adAccounts.filter((a) => a.active).map(async (acc) => {
    try {
      const token = await getMetaToken(acc.connection_id)
      const data = await graphAll<Record<string, unknown>>(`${acc.external_id}/activities`, token, {
        fields: 'event_type,translated_event_type,event_time,actor_name,object_id,object_name,object_type,extra_data,application_name',
        since, limit: '100',
      }, 10)
      return data.map((d) => parseActivity(d, acc.name))
    } catch (e) {
      errors.push(`${acc.name}: ${e instanceof Error ? e.message : 'error'}`)
      return []
    }
  }))
  return { rows: lists.flat().sort((a, b) => b.at.localeCompare(a.at)), errors }
}
