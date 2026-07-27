/**
 * GET /api/tn-stock
 *
 * Devuelve el stock de cada producto de Tiendanube (solo cantidades).
 * El costo por unidad se gestiona manualmente desde /api/product-costs.
 */

import { NextResponse }  from 'next/server'
import { createClient }  from '@supabase/supabase-js'
import { requireAuth }   from '@/lib/auth'

export const dynamic = 'force-dynamic'

const TN_API       = 'https://api.tiendanube.com/v1'
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
    const params = new URLSearchParams({ per_page: '200', page: String(page) })
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

    const productRows: {
      id: string | number
      name: string
      total_units: number
      variant_count: number
      oos_variants: string[]
      sold_out: boolean
    }[] = []
    let total_units = 0

    for (const p of products) {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const variants: any[] = p.variants ?? []
      const name = (p.name?.es ?? p.name?.['en'] ?? Object.values(p.name ?? {})[0] ?? 'Sin nombre') as string

      let prod_units = 0
      const oos_variants: string[] = []
      for (const v of variants) {
        const stock = parseInt(v.stock ?? '0') || 0
        if (stock > 0) prod_units += stock
        else {
          // etiqueta del talle/color agotado (ej: "M / Negro")
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          const label = ((v.values ?? []) as any[])
            .map((val) => (val?.es ?? Object.values(val ?? {})[0]) as string)
            .filter(Boolean)
            .join(' / ')
          oos_variants.push(label || 'único')
        }
      }

      total_units += prod_units
      // Conservamos TODOS los productos (incl. agotados) para poder alertar
      productRows.push({
        id: p.id,
        name,
        total_units: prod_units,
        variant_count: variants.length,
        oos_variants,
        sold_out: prod_units === 0 && variants.length > 0,
      })
    }

    // Sort by stock desc
    productRows.sort((a, b) => b.total_units - a.total_units)

    const sold_out_count = productRows.filter((p) => p.sold_out).length
    const partial_oos_count = productRows.filter((p) => !p.sold_out && p.oos_variants.length > 0).length

    return NextResponse.json({
      ok: true,
      fetched_at: new Date().toISOString(),
      total_units,
      sold_out_count,
      partial_oos_count,
      products: productRows,
    })
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err)
    return NextResponse.json({ error: msg }, { status: 500 })
  }
}
