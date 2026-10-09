import { createClient, SupabaseClient } from '@supabase/supabase-js'

let _svc: SupabaseClient | null = null

/** Cliente con service role. Solo server-side. */
export function svc(): SupabaseClient {
  if (!_svc) {
    _svc = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!, {
      auth: { persistSession: false },
    })
  }
  return _svc
}

/**
 * Trae todas las filas de una consulta paginando de a 1000 (límite de PostgREST).
 * `build` recibe el rango y devuelve la query ya filtrada.
 */
export async function fetchAll<T>(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  build: (from: number, to: number) => PromiseLike<{ data: any; error: any }>,
  pageSize = 1000,
  maxRows = 50000,
): Promise<T[]> {
  const out: T[] = []
  for (let from = 0; from < maxRows; from += pageSize) {
    const { data, error } = await build(from, from + pageSize - 1)
    if (error) throw new Error(error.message || String(error))
    const rows = (data || []) as T[]
    out.push(...rows)
    if (rows.length < pageSize) break
  }
  return out
}

/** Inserta/actualiza en lotes. */
export async function upsertChunks(
  table: string,
  rows: Record<string, unknown>[],
  onConflict: string,
  chunk = 500,
): Promise<number> {
  let n = 0
  for (let i = 0; i < rows.length; i += chunk) {
    const part = rows.slice(i, i + chunk)
    const { error } = await svc().from(table).upsert(part, { onConflict })
    if (error) throw new Error(`${table}: ${error.message}`)
    n += part.length
  }
  return n
}

export async function logSync(entry: {
  workspace_id: string | null
  source: string
  target_id?: string | null
  status: 'ok' | 'error'
  rows?: number
  ms?: number
  error?: string | null
}) {
  try {
    await svc().from('sync_log').insert({ ...entry, error: entry.error?.slice(0, 500) ?? null })
  } catch { /* no bloquea */ }
}
