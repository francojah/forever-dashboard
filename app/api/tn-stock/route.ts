/**
 * GET /api/tn-stock
 *
 * Consulta todos los productos de Tiendanube y calcula el capital
 * inmovilizado en inventario.
 *
 * variant.cost → usado cuando está disponible
 * Fallback     → UNIT_COST_FALLBACK = $6.500 ARS
 */

import { NextResponse }  from 'next/server'
import { createClient }  from '@supabase/supabase-js'
import { requireAuth }   from '@/lib/auth'

export const dynamic = 'force-dynamic'

const TN_API             = 'https://api.tiendanube.com/v1'
const UNIT_COST_FALLBACK = 6500   // ARS — costo fijo si TN no tiene costo cargado

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL!
const SUPABASE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY!

async function getTNCredentials() {
  try {
    const sb = createClient(SUPABASE_URL, SUPABASE_KEY)
    const { data } = await sb.from('app_config').select('value').eq('key', 'tiendanube_credentials').single()
    if (data?.value?.access_token && data?.value?.user_id) {
      return { token: data.value.access_token, userId: data.value.user_id }
    }
  } catch { /* fallback */ }
  const token  = process.env.TIENDANUBE_ACCESS_TOKEN
  const userId = process.env.TIENDANUBE_USER_ID
  if (!token || !userId) throw new Error('Credenciales Tiendanube no configuradas')
  return { token, userId }
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function fetchAllProducts(token: string, userId: string): Promise<any[]> {
  const all = []
  let page  = 1

  while (true) {
    const params = new URLSearchParams({
      per_page: '200',
      page: String(page),
    })
    const res  = await fetch(`${TN_API}/${userId}/products?${params}`, {
      headers: {
        Authentication: `bearer ${token}`,
        'User-Agent': 'ForeverDashboard/1.0 (francojah@gmail.com)',
      },
      cache: 'no-store',
    })
    const json = await res.json()
    if (!Array.isArray(json) || json.length === 0) break
    all.push(...json)
    if (json.length < 200) break
    page++
  }

  return all
}

export async function GET() {
  const auth = await requireAuth()
  if (auth instanceof NextResponse) return auth

  try {
    const { token, userId } = await getTNCredentials()
    const products = await fetchAllProducts(token, userId)

    let total_units         = 0
    let capital_at_cost     = 0
    let capital_at_retail   = 0
    let units_with_cost     = 0
    let units_without_cost  = 0

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const productRows: any[] = []

    for (const p of products) {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const variants: any[] = p.variants ?? []
      const name = (p.name?.es ?? p.name?.['en'] ?? Object.values(p.name ?? {})[0] ?? 'Sin nombre') as string

      let prod_units        = 0
      let prod_cost_total   = 0
      let prod_retail_total = 0
      let prod_has_cost     = false

      for (const v of variants) {
        const stock  = parseInt(v.stock ?? '0') || 0
        if (stock <= 0) continue

        const rawCost   = parseFloat(v.cost   ?? '') || 0
        const rawPrice  = parseFloat(v.price  ?? '') || 0
        const unitCost  = rawCost > 0 ? rawCost : UNIT_COST_FALLBACK

        prod_units        += stock
        prod_cost_total   += stock * unitCost
        prod_retail_total += stock * rawPrice
        if (rawCost > 0) prod_has_cost = true
      }

      if (prod_units === 0) continue

      total_units       += prod_units
      capital_at_cost   += prod_cost_total
      capital_at_retail += prod_retail_total

      if (prod_has_cost) units_with_cost    += prod_units
      else               units_without_cost += prod_units

      productRows.push({
        id:              p.id,
        name,
        units:           prod_units,
        capital_at_cost: Math.round(prod_cost_total),
        capital_at_retail: Math.round(prod_retail_total),
        has_real_cost:   prod_has_cost,
        // thumbnail: p.images?.[0]?.src ?? null,
      })
    }

    // Sort by capital inmovilizado desc
    productRows.sort((a, b) => b.capital_at_cost - a.capital_at_cost)

    // Markup promedio implícito (retail / cost)
    const avg_markup = capital_at_cost > 0
      ? parseFloat((capital_at_retail / capital_at_cost).toFixed(2))
      : null

    return NextResponse.json({
      ok: true,
      fetched_at: new Date().toISOString(),
      summary: {
        total_units:         Math.round(total_units),
        capital_at_cost:     Math.round(capital_at_cost),
        capital_at_retail:   Math.round(capital_at_retail),
        avg_markup,
        units_with_cost,
        units_without_cost,
        cost_fallback:       UNIT_COST_FALLBACK,
      },
      products: productRows,
    })
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err)
    return NextResponse.json({ error: msg }, { status: 500 })
  }
}
