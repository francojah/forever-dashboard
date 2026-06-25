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

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const productRows: { id: string | number; name: string; total_units: number }[] = []
    let total_units = 0

    for (const p of products) {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const variants: any[] = p.variants ?? []
      const name = (p.name?.es ?? p.name?.['en'] ?? Object.values(p.name ?? {})[0] ?? 'Sin nombre') as string

      let prod_units = 0
      for (const v of variants) {
        const stock = parseInt(v.stock ?? '0') || 0
        if (stock > 0) prod_units += stock
      }

      if (prod_units === 0) continue

      total_units += prod_units
      productRows.push({ id: p.id, name, total_units: prod_units })
    }

    // Sort by stock desc
    productRows.sort((a, b) => b.total_units - a.total_units)

    return NextResponse.json({
      ok: true,
      fetched_at: new Date().toISOString(),
      total_units,
      products: productRows,
    })
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err)
    return NextResponse.json({ error: msg }, { status: 500 })
  }
}
