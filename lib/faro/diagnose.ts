/**
 * Diagnóstico automático: cuando ventas, ganancia o costo por compra se mueven, busca la causa en los datos
 * (ad sets, anuncios, productos, stock, medios de pago, embudo) y arma una explicación en una oración.
 * La parte de cálculo es pura; `loadDiagnosis` junta los datos.
 */
import type { OrderRow, AdsDaily } from './metrics'
import { isSale, loadOrders, loadCostIndex, loadAdsDaily, summarizeSales, summarizeAds } from './metrics'
import type { WorkspaceSettings } from './settings'
import { svc, fetchAll } from './db'
import { addDays, localDate } from './dates'
import { money, int, pct } from './format'
import { productName } from './insights'

export interface Finding {
  area: 'anuncios' | 'productos' | 'stock' | 'pagos' | 'embudo' | 'clientes'
  level: 'bad' | 'good' | 'info'
  title: string
  detail: string
  impact: number          // pesos en juego, para ordenar
  href?: string
}

export interface Diagnosis {
  from: string; to: string; prevFrom: string; prevTo: string
  headline: { net: number; prevNet: number; profit: number; prevProfit: number; cpa: number | null; prevCpa: number | null; orders: number; prevOrders: number }
  moved: boolean
  summary: string
  findings: Finding[]
}

const ch = (a: number, b: number) => (b > 0 ? (a - b) / b : a > 0 ? 1 : 0)
const sgn = (v: number) => `${v >= 0 ? '+' : '−'}${Math.abs(Math.round(v * 100))}%`

interface EntityDay { date: string; adset_id: string | null; ad_id: string; spend: number; purchases: number; impressions: number; link_clicks: number; lpv: number }

export function diagnose(input: {
  cur: { orders: OrderRow[]; ads: AdsDaily[]; ents: EntityDay[] }
  prev: { orders: OrderRow[]; ads: AdsDaily[]; ents: EntityDay[] }
  names: Map<string, string>
  stock: Map<string, { name: string; stock: number | null }>
  tz: string; settings: WorkspaceSettings; idx: Parameters<typeof summarizeSales>[2]
  range: { from: string; to: string; prevFrom: string; prevTo: string }
}): Diagnosis {
  const { cur, prev, names, settings, tz, idx, range } = input
  const sC = summarizeSales(cur.orders, tz, idx, settings), sP = summarizeSales(prev.orders, tz, idx, settings)
  const aC = summarizeAds(cur.ads), aP = summarizeAds(prev.ads)
  const adCost = (a: typeof aC) => a.spend * (1 + settings.ad_tax_pct / 100)
  const head = {
    net: sC.netSales, prevNet: sP.netSales, orders: sC.orders, prevOrders: sP.orders,
    profit: sC.contribution - adCost(aC), prevProfit: sP.contribution - adCost(aP),
    cpa: aC.purchases > 0 ? aC.spend / aC.purchases : null, prevCpa: aP.purchases > 0 ? aP.spend / aP.purchases : null,
  }
  const findings: Finding[] = []

  // Anuncios: por ad set, qué explicó el cambio en compras y costo
  const byAdset = (list: EntityDay[]) => {
    const m = new Map<string, { spend: number; purchases: number; imp: number; clicks: number; lpv: number }>()
    for (const e of list) { const k = e.adset_id || e.ad_id; const r = m.get(k) || { spend: 0, purchases: 0, imp: 0, clicks: 0, lpv: 0 }; r.spend += e.spend; r.purchases += e.purchases; r.imp += e.impressions; r.clicks += e.link_clicks; r.lpv += e.lpv; m.set(k, r) }
    return m
  }
  const AC = byAdset(cur.ents), AP = byAdset(prev.ents)
  const keys = new Set([...Array.from(AC.keys()), ...Array.from(AP.keys())])
  const cpaRef = head.prevCpa ?? head.cpa ?? 0
  for (const k of Array.from(keys)) {
    const c = AC.get(k) || { spend: 0, purchases: 0, imp: 0, clicks: 0, lpv: 0 }, p = AP.get(k) || { spend: 0, purchases: 0, imp: 0, clicks: 0, lpv: 0 }
    const name = names.get(k) || k
    const dPurch = c.purchases - p.purchases
    const cCpa = c.purchases > 0 ? c.spend / c.purchases : null, pCpa = p.purchases > 0 ? p.spend / p.purchases : null
    if (c.spend === 0 && p.spend > 0 && p.purchases >= 3) findings.push({ area: 'anuncios', level: 'bad', title: `"${name}" dejó de entregar`, detail: `La semana anterior gastó ${money(p.spend)} y trajo ${int(p.purchases)} compras; esta semana no gastó.`, impact: p.purchases * cpaRef, href: `/anuncios?focus=${k}` })
    else if (p.spend === 0 && c.spend > 0 && c.purchases >= 3) findings.push({ area: 'anuncios', level: 'good', title: `"${name}" es nuevo y ya vende`, detail: `${int(c.purchases)} compras con ${money(c.spend)}${cCpa ? ` (costo por compra ${money(cCpa)})` : ''}.`, impact: c.purchases * cpaRef, href: `/anuncios?focus=${k}` })
    else if (c.spend > 0 && p.spend > 0) {
      const ctrC = c.imp ? c.clicks / c.imp : 0, ctrP = p.imp ? p.clicks / p.imp : 0
      if (Math.abs(dPurch) >= 3 && Math.abs(dPurch) >= 0.25 * Math.max(1, p.purchases)) {
        const why = ch(c.spend, p.spend) < -0.2 ? `gastó ${sgn(ch(c.spend, p.spend))}` : ctrP > 0 && ch(ctrC, ctrP) < -0.2 ? `el CTR cayó ${sgn(ch(ctrC, ctrP))} (creativo cansado)` : ch(c.spend, p.spend) > 0.2 ? `gastó ${sgn(ch(c.spend, p.spend))}` : ctrP > 0 && ch(ctrC, ctrP) > 0.2 ? `el CTR subió ${sgn(ch(ctrC, ctrP))}` : cCpa && pCpa ? `el costo por compra pasó de ${money(pCpa)} a ${money(cCpa)}` : 'cambió la conversión'
        findings.push({ area: 'anuncios', level: dPurch < 0 ? 'bad' : 'good', title: `"${name}": ${dPurch > 0 ? '+' : ''}${int(dPurch)} compras`, detail: `De ${int(p.purchases)} a ${int(c.purchases)}: ${why}.`, impact: Math.abs(dPurch) * cpaRef, href: `/anuncios?focus=${k}` })
      } else if (cCpa && pCpa && ch(cCpa, pCpa) > 0.3 && c.spend > 0.1 * aC.spend) {
        findings.push({ area: 'anuncios', level: 'bad', title: `"${name}" se encareció ${sgn(ch(cCpa, pCpa))}`, detail: `Costo por compra de ${money(pCpa)} a ${money(cCpa)} con gasto parecido${ctrP > 0 && ch(ctrC, ctrP) < -0.15 ? `; el CTR cayó ${sgn(ch(ctrC, ctrP))}` : ''}.`, impact: (cCpa - pCpa) * c.purchases, href: `/anuncios?focus=${k}` })
      }
    }
  }

  // Productos: unidades por producto, y stock agotado
  const units = (list: OrderRow[]) => { const m = new Map<string, { units: number; net: number; ids: Set<string> }>(); for (const o of list) if (isSale(o)) for (const it of o.items) { const k = productName(it.name); const r = m.get(k) || { units: 0, net: 0, ids: new Set() }; r.units += it.qty; r.net += it.price * it.qty; if (it.product_id) r.ids.add(it.product_id); m.set(k, r) } return m }
  const UC = units(cur.orders), UP = units(prev.orders)
  for (const k of Array.from(new Set([...Array.from(UC.keys()), ...Array.from(UP.keys())]))) {
    const c = UC.get(k) || { units: 0, net: 0, ids: new Set<string>() }, p = UP.get(k) || { units: 0, net: 0, ids: new Set<string>() }
    const d = c.units - p.units
    if (Math.abs(d) >= 5 && Math.abs(d) >= 0.3 * Math.max(1, p.units)) {
      const ids = Array.from(c.ids.size ? c.ids : p.ids)
      const st = ids.map((id) => input.stock.get(id)).find((x) => x && x.stock != null && x.stock <= 0)
      findings.push({ area: d < 0 && st ? 'stock' : 'productos', level: d < 0 ? 'bad' : 'good', title: `${k}: ${d > 0 ? '+' : ''}${int(d)} unidades`, detail: d < 0 && st ? `Sin stock en Tiendanube: eso explica la caída.` : `De ${int(p.units)} a ${int(c.units)} unidades (${money(c.net - p.net)} de diferencia a precio de lista).`, impact: Math.abs(c.net - p.net), href: '/ventas?tab=productos' })
    }
  }
  // Variantes agotadas con venta reciente (aunque el total no haya caído todavía)
  for (const [id, s] of Array.from(input.stock.entries())) if (s.stock != null && s.stock <= 0) {
    const sold = cur.orders.filter(isSale).flatMap((o) => o.items).filter((it) => it.product_id === id || it.variant_id === id).reduce((a, it) => a + it.qty, 0)
    if (sold >= 2 && !findings.some((f) => f.area === 'stock' && f.title.startsWith(productName(s.name)))) findings.push({ area: 'stock', level: 'bad', title: `${s.name} se agotó`, detail: `Vendió ${int(sold)} unidades esta semana y ahora no tiene stock.`, impact: sold * (sC.orders ? sC.netSales / Math.max(1, sC.units) : 0), href: '/ventas?tab=productos' })
  }

  // Medios de pago: cambio de mezcla (p. ej. cayó transferencia)
  const mix = (list: OrderRow[]) => { const m = new Map<string, number>(); let n = 0; for (const o of list) if (isSale(o)) { n++; m.set(o.payment_method || 'otro', (m.get(o.payment_method || 'otro') || 0) + 1) } return { m, n } }
  const MC = mix(cur.orders), MP = mix(prev.orders)
  if (MC.n >= 20 && MP.n >= 20) for (const k of Array.from(new Set([...Array.from(MC.m.keys()), ...Array.from(MP.m.keys())]))) {
    const c = (MC.m.get(k) || 0) / MC.n, p = (MP.m.get(k) || 0) / MP.n
    if (Math.abs(c - p) >= 0.15) findings.push({ area: 'pagos', level: 'info', title: `${k === 'credit_card' ? 'Tarjeta de crédito' : k === 'wire_transfer' || k === 'bank_transfer' ? 'Transferencia' : k} pasó de ${pct(p, 0)} a ${pct(c, 0)} de las ventas`, detail: 'Un cambio así suele venir de una promo (descuento por transferencia, cuotas) o de un problema con un medio de pago.', impact: Math.abs(c - p) * sC.netSales * 0.05 })
  }

  // Embudo: conversión visita → compra en Meta
  const cvC = aC.lpv > 0 ? aC.purchases / aC.lpv : null, cvP = aP.lpv > 0 ? aP.purchases / aP.lpv : null
  if (cvC != null && cvP != null && aP.lpv >= 500 && Math.abs(ch(cvC, cvP)) >= 0.2) {
    findings.push({ area: 'embudo', level: ch(cvC, cvP) < 0 ? 'bad' : 'good', title: `La conversión de visita a compra ${ch(cvC, cvP) < 0 ? 'cayó' : 'subió'} ${sgn(ch(cvC, cvP))}`, detail: `De ${pct(cvP, 2)} a ${pct(cvC, 2)} con ${int(aC.lpv)} visitas. ${ch(cvC, cvP) < 0 ? 'Si el tráfico es parecido, mirá precio, stock de talles, envío y checkout.' : 'Mismo tráfico, más ventas: algo en la web o la oferta mejoró.'}`, impact: Math.abs(cvC - cvP) * aC.lpv * (sC.orders ? sC.netSales / sC.orders : 0), href: '/ventas?tab=embudo' })
  }

  // Clientes: nuevos vs. que vuelven
  const firstSeen = new Map<string, string>()
  for (const o of [...prev.orders, ...cur.orders].filter(isSale).sort((a, b) => a.created_at.localeCompare(b.created_at))) if (o.customer_id && !firstSeen.has(o.customer_id)) firstSeen.set(o.customer_id, o.created_at)
  const retC = cur.orders.filter((o) => isSale(o) && o.customer_id && (firstSeen.get(o.customer_id) || '') < range.from + 'T00').length
  const retP = prev.orders.filter((o) => isSale(o) && o.customer_id && (firstSeen.get(o.customer_id) || '') < range.prevFrom + 'T00').length
  if (retP >= 5 && Math.abs(retC - retP) >= 0.4 * retP) findings.push({ area: 'clientes', level: retC < retP ? 'bad' : 'good', title: `Clientes que vuelven: de ${int(retP)} a ${int(retC)}`, detail: retC < retP ? 'Cayó la recompra: vale la pena un empujón a los que compraron hace 60 a 180 días (Ventas → Clientes).' : 'Subió la recompra: lo que estés haciendo con los clientes viejos funciona.', impact: Math.abs(retC - retP) * (sC.orders ? sC.netSales / sC.orders : 0), href: '/ventas?tab=clientes' })

  findings.sort((a, b) => b.impact - a.impact)
  const dNet = ch(head.net, head.prevNet), dCpa = head.cpa != null && head.prevCpa != null ? ch(head.cpa, head.prevCpa) : 0, dProfit = ch(head.profit, head.prevProfit)
  const moved = Math.abs(dNet) >= 0.1 || Math.abs(dCpa) >= 0.15 || Math.abs(dProfit) >= 0.15
  const top = findings.filter((f) => (dNet < 0 || dProfit < 0 ? f.level === 'bad' : f.level === 'good')).slice(0, 2)
  const lead = Math.abs(dProfit) >= Math.abs(dNet) ? `La ganancia después de publicidad ${dProfit < 0 ? 'bajó' : 'subió'} ${sgn(dProfit)} (${money(head.prevProfit)} → ${money(head.profit)})` : `Las ventas ${dNet < 0 ? 'bajaron' : 'subieron'} ${sgn(dNet)} (${money(head.prevNet)} → ${money(head.net)})`
  const cpaTxt = head.cpa != null && head.prevCpa != null && Math.abs(dCpa) >= 0.15 ? ` y el costo por compra ${dCpa > 0 ? 'subió' : 'bajó'} ${sgn(dCpa)}` : ''
  const summary = !moved ? `Semana estable: ventas ${sgn(dNet)}, ganancia ${sgn(dProfit)}${head.cpa != null && head.prevCpa != null ? `, costo por compra ${sgn(dCpa)}` : ''}. Nada se movió más de lo normal.`
    : `${lead}${cpaTxt}. ${top.length ? `Lo que más lo explica: ${top.map((f) => f.title.replace(/"/g, '')).join('; ')}.` : 'No encontré una causa clara en anuncios, productos ni pagos: puede ser estacionalidad o la demanda general.'}`
  return { from: range.from, to: range.to, prevFrom: range.prevFrom, prevTo: range.prevTo, headline: head, moved, summary, findings: findings.slice(0, 8) }
}

/** Últimos 7 días completos contra los 7 anteriores. */
type Ctx = { workspace: { timezone: string; settings: WorkspaceSettings }; stores: { id: string; active: boolean }[]; adAccounts: { id: string; active: boolean }[] }
export async function loadDiagnosis(ctx: Ctx, now = new Date()): Promise<Diagnosis> {
  const tz = ctx.workspace.timezone
  const storeIds = ctx.stores.filter((s) => s.active).map((s) => s.id)
  const accountIds = ctx.adAccounts.filter((a) => a.active).map((a) => a.id)
  const today = localDate(now, tz)
  const to = addDays(today, -1), from = addDays(today, -7), prevTo = addDays(from, -1), prevFrom = addDays(from, -7)
  const [orders, idx, ads, ents, names] = await Promise.all([
    loadOrders(storeIds, prevFrom, to, tz), loadCostIndex(storeIds), loadAdsDaily(accountIds, prevFrom, to),
    accountIds.length ? fetchAll<EntityDay>((a, b) => svc().from('ad_insights_daily').select('date,adset_id,ad_id,spend,purchases,impressions,link_clicks,lpv').in('ad_account_id', accountIds).gte('date', prevFrom).lte('date', to).range(a, b)) : Promise.resolve([] as EntityDay[]),
    accountIds.length ? svc().from('ad_entities').select('entity_id,name').in('ad_account_id', accountIds).in('level', ['adset', 'ad']) : Promise.resolve({ data: [] as { entity_id: string; name: string }[] }),
  ])
  const num = (e: EntityDay): EntityDay => ({ ...e, spend: Number(e.spend) || 0, purchases: Number(e.purchases) || 0, impressions: Number(e.impressions) || 0, link_clicks: Number(e.link_clicks) || 0, lpv: Number(e.lpv) || 0 })
  const stock = new Map<string, { name: string; stock: number | null }>()
  try {
    const { getCachedProducts } = await import('./actions')
    for (const st of ctx.stores.filter((s) => s.active)) for (const p of await getCachedProducts(st as never)) { stock.set(p.id, { name: p.name, stock: p.stock }); for (const v of p.variants) stock.set(v.id, { name: `${p.name} ${v.name}`.trim(), stock: v.stock }) }
  } catch { /* sin stock */ }
  const inR = (o: OrderRow, a: string, b: string) => { const d = localDate(new Date(o.created_at), tz); return d >= a && d <= b }
  return diagnose({
    cur: { orders: orders.filter((o) => inR(o, from, to)), ads: ads.filter((d) => d.date >= from), ents: ents.filter((e) => e.date >= from).map(num) },
    prev: { orders: orders.filter((o) => inR(o, prevFrom, prevTo)), ads: ads.filter((d) => d.date < from), ents: ents.filter((e) => e.date < from).map(num) },
    names: new Map(((names.data || []) as { entity_id: string; name: string }[]).map((n) => [n.entity_id, n.name])), stock,
    tz, settings: ctx.workspace.settings, idx, range: { from, to, prevFrom, prevTo },
  })
}
