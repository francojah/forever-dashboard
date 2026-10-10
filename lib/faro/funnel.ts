import { tnGet, getConnectionToken, StoreRow } from './tiendanube'
import { loadAdsDaily, summarizeAds, loadOrders, isSale, AdsSummary } from './metrics'
import { Period, previousPeriod, startOfLocalDayUTC, addDays } from './dates'

export interface StoreFunnel {
  abandoned: number           // checkouts abandonados (Tiendanube)
  abandonedValue: number
  abandonedWithEmail: number  // recuperables por mail/WhatsApp
  ordersCreated: number       // órdenes creadas (pagadas o no)
  ordersPaid: number
  unpaid: number              // creadas y no pagadas ni canceladas (ej. transferencias pendientes)
  unpaidValue: number
  cancelled: number
  partial: boolean            // no se pudo leer todo de Tiendanube
}

export interface FunnelData { ads: AdsSummary; store: StoreFunnel }

export interface FunnelStep {
  key: string
  label: string
  value: number
  rate: number | null         // conversión desde el paso anterior
  prevRate: number | null
  ref: [number, number] | null // rango orientativo [bajo, bueno]
  hint: string                // qué mirar si está bajo
}

async function storeFunnel(stores: StoreRow[], period: Period, tz: string): Promise<StoreFunnel> {
  const out: StoreFunnel = { abandoned: 0, abandonedValue: 0, abandonedWithEmail: 0, ordersCreated: 0, ordersPaid: 0, unpaid: 0, unpaidValue: 0, cancelled: 0, partial: false }
  const ordersP = loadOrders(stores.map((s) => s.id), period.from, period.to, tz)
  const checkoutsP = abandonedCheckouts(stores, period, tz, out)
  const [orders] = await Promise.all([ordersP, checkoutsP])
  for (const o of orders) {
    out.ordersCreated++
    if (isSale(o)) out.ordersPaid++
    else if (o.status === 'cancelled' || o.cancelled_at) out.cancelled++
    else if (o.payment_status === 'pending' || o.payment_status === 'authorized') { out.unpaid++; out.unpaidValue += o.total }
  }
  return out
}

async function abandonedCheckouts(stores: StoreRow[], period: Period, tz: string, out: StoreFunnel) {
  const minIso = startOfLocalDayUTC(period.from, tz)
  const maxIso = new Date(new Date(startOfLocalDayUTC(addDays(period.to, 1), tz)).getTime() - 1000).toISOString()
  await Promise.all(stores.map(async (s) => {
    try {
      const token = await getConnectionToken(s.connection_id)
      for (let page = 1; page <= 5; page++) {
        const { data, total } = await tnGet<{ total: string; contact_email: string | null }[]>(s.external_id, token, 'checkouts', {
          created_at_min: minIso, created_at_max: maxIso, per_page: '200', page: String(page), fields: 'id,total,contact_email',
        })
        if (page === 1 && total != null) out.abandoned += total
        for (const c of data || []) {
          out.abandonedValue += parseFloat(c.total) || 0
          if (c.contact_email) out.abandonedWithEmail++
        }
        if (!data || data.length < 200) break
        if (page === 5) out.partial = true
      }
    } catch { out.partial = true }
  }))
}

export async function loadFunnel(args: { stores: StoreRow[]; accountIds: string[]; tz: string; period: Period }): Promise<{ cur: FunnelData; prev: FunnelData; prevLabel: string }> {
  const prevP = previousPeriod(args.period)
  const [a, b, s1, s2] = await Promise.all([
    loadAdsDaily(args.accountIds, args.period.from, args.period.to),
    loadAdsDaily(args.accountIds, prevP.from, prevP.to),
    storeFunnel(args.stores, args.period, args.tz),
    storeFunnel(args.stores, prevP, args.tz),
  ])
  return { cur: { ads: summarizeAds(a), store: s1 }, prev: { ads: summarizeAds(b), store: s2 }, prevLabel: prevP.label }
}

const r = (a: number, b: number) => (b > 0 ? a / b : null)

/**
 * Pasos del embudo con su conversión. Los rangos son orientativos para tiendas de indumentaria
 * con tráfico mayormente pago en mobile; sirven para ver dónde mirar primero, no como meta.
 */
export function funnelSteps(cur: FunnelData, prev: FunnelData): { ads: FunnelStep[]; store: FunnelStep[] } {
  const A = cur.ads, P = prev.ads
  const ads: FunnelStep[] = [
    { key: 'imp', label: 'Impresiones', value: A.impressions, rate: null, prevRate: null, ref: null, hint: '' },
    { key: 'clk', label: 'Clics en el enlace', value: A.linkClicks, rate: r(A.linkClicks, A.impressions), prevRate: r(P.linkClicks, P.impressions), ref: [0.008, 0.015],
      hint: 'El anuncio no invita a entrar: probá ganchos más claros en los primeros 3 segundos, precio o beneficio visible y un llamado a la acción directo.' },
    { key: 'lpv', label: 'Llegaron a ver la web', value: A.lpv, rate: r(A.lpv, A.linkClicks), prevRate: r(P.lpv, P.linkClicks), ref: [0.6, 0.8],
      hint: 'Muchos clics no llegan a cargar la página: revisá la velocidad en el navegador de Instagram, imágenes pesadas y apps que bloquean la carga.' },
    { key: 'atc', label: 'Agregaron al carrito', value: A.atc, rate: r(A.atc, A.lpv), prevRate: r(P.atc, P.lpv), ref: [0.04, 0.08],
      hint: 'Entran pero no eligen: ficha de producto (fotos, guía de talles, stock por talle), precio frente a lo que promete el anuncio y que el link lleve al producto del anuncio.' },
    { key: 'ic', label: 'Iniciaron el pago', value: A.ic, rate: r(A.ic, A.atc), prevRate: r(P.ic, P.atc), ref: [0.35, 0.55],
      hint: 'Abandonan en el carrito: costo y plazo de envío a la vista, envío gratis desde cierto monto, cupones que no funcionan.' },
    { key: 'pur', label: 'Compraron (según Meta)', value: A.purchases, rate: r(A.purchases, A.ic), prevRate: r(P.purchases, P.ic), ref: [0.4, 0.6],
      hint: 'Abandonan en el pago: medios de pago y cuotas, descuento por transferencia claro, errores del checkout y pasos de más.' },
  ]
  const S = cur.store, Q = prev.store
  const started = S.ordersCreated + S.abandoned
  const startedPrev = Q.ordersCreated + Q.abandoned
  const store: FunnelStep[] = [
    { key: 'chk', label: 'Checkouts iniciados', value: started, rate: null, prevRate: null, ref: null, hint: '' },
    { key: 'ord', label: 'Órdenes creadas', value: S.ordersCreated, rate: r(S.ordersCreated, started), prevRate: r(Q.ordersCreated, startedPrev), ref: [0.3, 0.5],
      hint: 'Muchos checkouts quedan abandonados: mandá recuperación de carrito (mail o WhatsApp) y revisá envío y medios de pago.' },
    { key: 'paid', label: 'Órdenes pagadas', value: S.ordersPaid, rate: r(S.ordersPaid, S.ordersCreated), prevRate: r(Q.ordersPaid, Q.ordersCreated), ref: [0.8, 0.92],
      hint: 'Hay órdenes que no se pagan: seguí las transferencias pendientes y recordá el pago dentro de las primeras horas.' },
  ]
  return { ads, store }
}

/** El paso más flojo contra su referencia: ahí conviene mirar primero. */
export function weakest(steps: FunnelStep[]): FunnelStep | null {
  let worst: FunnelStep | null = null
  let score = Infinity
  for (const s of steps) {
    if (s.rate == null || !s.ref || s.value < 0) continue
    const k = s.rate / s.ref[0]
    if (k < 1 && k < score) { score = k; worst = s }
  }
  return worst
}

